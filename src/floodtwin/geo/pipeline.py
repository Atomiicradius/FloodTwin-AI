"""Role A end-to-end pipeline: audit -> terrain -> observations -> network + evidence ->
catchment ranking -> handoff exports. Reproducible from `data/raw` + configs only.

    python -m floodtwin.geo.fetch --verify
    python -m floodtwin.geo.pipeline [--catchment <cand_id>]

Outputs
    data/interim/            AOI DEMs, terrain rasters, audit tables
    data/processed/bengaluru city-wide layers (network, evidence, observations, stations)
    data/processed/<cid>/    network_v1.gpkg (+ terrain/ clip, manifest.json, README.md)
    reports/01_data_audit_numbers.json, reports/figures/01_*.png, reports/tables/01_*.csv
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import platform
import re
import sys
import time
from pathlib import Path

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
import rasterio
import rasterio.features
import rasterio.mask
import shapely

from floodtwin.evidence import indicators as ind
from floodtwin.evidence.scoring import assign_status
from floodtwin.evidence.sensitivity import run_sensitivity
from floodtwin.geo import audit, catchments, network as nw, observations as obs, terrain
from floodtwin.geo.config import REPO_ROOT, evidence_config, geo_config, raw_path, sha256_file
from floodtwin.geo.kml import read_kml

log = logging.getLogger("floodtwin.geo.pipeline")


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.ndarray,)):
        return o.tolist()
    if isinstance(o, (pd.Timestamp, dt.datetime)):
        return o.isoformat()
    return str(o)


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")


class Ctx:
    """Paths and configs for one pipeline run."""

    def __init__(self) -> None:
        self.g = geo_config()
        self.e = evidence_config()
        p = self.g["paths"]
        self.interim = REPO_ROOT / p["interim"]
        self.city = REPO_ROOT / p["processed"] / "bengaluru"
        self.reports = REPO_ROOT / p["reports"]
        self.fig = REPO_ROOT / p["figures"]
        self.tables = self.reports / "tables"
        for d in (self.interim, self.city, self.fig, self.tables):
            d.mkdir(parents=True, exist_ok=True)
        self.crs = self.g["crs_metric"]
        self.numbers: dict = {"generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}


# --------------------------------------------------------------------------- audit
def stage_audit(ctx: Ctx) -> dict[str, gpd.GeoDataFrame]:
    a = ctx.g["audit"]
    segs_by_h: dict[str, gpd.GeoDataFrame] = {}
    out: dict = {}
    for h, sid in ctx.g["drainage_sources"].items():
        raw = read_kml(raw_path(sid))
        hier = h if h != "all" else "other"
        segs = nw.load_drainage(raw, hier, sid, ctx.crs)
        segs_by_h[h] = segs
        out[h] = {
            "source_id": sid,
            "geometry": audit.geometry_checks(raw, segs),
            "attributes": audit.attribute_inventory(raw),
            "duplicates": audit.duplicate_checks(segs, a["near_duplicate_hausdorff_m"], a["near_duplicate_length_ratio_min"]),
            "crs_source": "EPSG:4326 (KML)", "crs_target": ctx.crs,
            "flow_direction_attribute": "none found",
        }
        log.info("audited %s: %d features", h, len(raw))
    # all-drain file vs union of split files
    raw_all = read_kml(raw_path(ctx.g["drainage_sources"]["all"]))
    out["all"]["published_type_counts"] = raw_all["Type"].value_counts().to_dict()
    # connectivity sensitivity
    model_h = ctx.g["network"]["hierarchies_for_model"]
    ps = gpd.GeoDataFrame(pd.concat([segs_by_h[h] for h in model_h], ignore_index=True), crs=ctx.crs)
    pst = gpd.GeoDataFrame(pd.concat([segs_by_h[h] for h in ("primary", "secondary", "tertiary")], ignore_index=True), crs=ctx.crs)
    tols = a["snap_tolerances_m"] + [20, 50]
    sens_ps = audit.connectivity_sensitivity(ps, tols, a["near_duplicate_hausdorff_m"], a["near_duplicate_length_ratio_min"])
    sens_pst = audit.connectivity_sensitivity(pst, a["snap_tolerances_m"], a["near_duplicate_hausdorff_m"], a["near_duplicate_length_ratio_min"])
    sens_ps.to_csv(ctx.tables / "01_connectivity_sensitivity_primary_secondary.csv", index=False)
    sens_pst.to_csv(ctx.tables / "01_connectivity_sensitivity_all_classes.csv", index=False)
    out["connectivity_sensitivity_primary_secondary"] = sens_ps.to_dict("records")
    out["connectivity_sensitivity_all_classes"] = sens_pst.to_dict("records")
    net, _ = nw.build_network(ps, ctx.g["network"]["snap_tolerance_m"], 1.0,
                              a["near_duplicate_hausdorff_m"], a["near_duplicate_length_ratio_min"])
    gaps = audit.dangling_gap_distances(net)
    out["dangling_gap_m_quantiles"] = {str(q): float(np.quantile(gaps[np.isfinite(gaps)], q)) for q in (0.1, 0.25, 0.5, 0.75, 0.9)}
    out["dangling_gap_counts"] = {f"<= {t} m": int((gaps <= t).sum()) for t in (10, 20, 50, 100, 200)}
    out["n_dangling"] = int(len(gaps))
    # overlap between classes
    out["overlap_frac_secondary_within_10m_of_primary"] = audit.overlap_between(segs_by_h["secondary"], segs_by_h["primary"], 10)
    out["overlap_frac_tertiary_within_10m_of_primary_or_secondary"] = audit.overlap_between(segs_by_h["tertiary"], ps, 10)
    # independent mapping (OSM) agreement
    osm = audit.read_osm_waterways(raw_path("osm_waterways_snapshot"), ctx.crs)
    out["osm_ways"] = int(len(osm))
    out["osm_agreement"] = {
        f"{h}_within_{b}m": audit.overlap_between(segs_by_h[h], osm, b)
        for h in ("primary", "secondary", "tertiary") for b in (15, 30, 60)
    }
    # spot-check sample (manual)
    audit.spot_check_sample(ps, a["spot_check_sample_n"], a["spot_check_seed"]).to_csv(
        ctx.tables / "01_spot_check_sample.csv", index=False)
    ctx.numbers["audit"] = out
    segs_by_h["model"] = ps
    segs_by_h["osm"] = osm
    return segs_by_h


# --------------------------------------------------------------------------- terrain
def stage_terrain(ctx: Ctx) -> dict:
    zones = read_kml(raw_path("bbmp_zones_2022")).to_crs(ctx.crs)
    bbmp = shapely.union_all(zones.geometry.buffer(0).values)
    buf = ctx.g["dem"]["aoi_buffer_m"]
    xmin, ymin, xmax, ymax = bbmp.bounds
    transform, w, h = terrain.aoi_grid((xmin - buf, ymin - buf, xmax + buf, ymax + buf), ctx.g["dem"]["resolution_m"])
    tdir = ctx.interim / "terrain"
    out: dict = {"aoi": {"width": w, "height": h, "bounds": [xmin - buf, ymin - buf, xmax + buf, ymax + buf]}}
    dems = {}
    for name, ids in ctx.g["dem"]["candidates"].items():
        p = tdir / f"dem_{name}_utm.tif"
        stats = terrain.build_dem([raw_path(i) for i in ids], ctx.interim / "tiles", ctx.crs, transform, w, h, p,
                                  ctx.g["dem"]["resampling"])
        out[name] = stats
        dems[name] = terrain.read_raster(p)[0]
    # compare inside BBMP
    inside = rasterio.features.geometry_mask([bbmp], (h, w), transform, invert=True)
    a, b = dems["cop30"], dems["srtm"]
    ok = inside & (a != terrain.NODATA) & (b != terrain.NODATA)
    diff = a - b
    out["cop_minus_srtm_inside_bbmp"] = {
        "median_m": float(np.median(diff[ok])), "mad_m": float(np.median(np.abs(diff[ok]))),
        "p05_m": float(np.quantile(diff[ok], 0.05)), "p95_m": float(np.quantile(diff[ok], 0.95)),
        "n_cells": int(ok.sum()),
        "void_cells_cop": int((inside & (a == terrain.NODATA)).sum()),
        "void_cells_srtm": int((inside & (b == terrain.NODATA)).sum()),
    }
    terrain.write_raster(tdir / "cop_minus_srtm.tif", np.where(ok | ((a != terrain.NODATA) & (b != terrain.NODATA)), diff, terrain.NODATA), transform, ctx.crs)
    sel = ctx.g["dem"]["selected"]
    routed = terrain.condition_and_route(tdir / f"dem_{sel}_utm.tif", tdir)
    out["routing"] = routed
    sink = terrain.read_raster(tdir / "sink_depth.tif")[0]
    sm = ctx.g["terrain"]["sink_depth_min_m"]
    out["sink_cells_ge_min_inside_bbmp"] = int((inside & (sink >= sm)).sum())
    out["sink_cells_ge_2m_inside_bbmp"] = int((inside & (sink >= 2.0)).sum())
    ctx.numbers["terrain"] = out
    return {"bbmp": bbmp, "zones": zones, "transform": transform, "shape": (h, w), "dir": tdir, "inside": inside}


def _load_terrain(t: dict) -> dict:
    d = t["dir"]
    arrs = {}
    for k in ("dem_conditioned", "sink_depth", "acc_d8_km2", "flowdir_d8", "cop_minus_srtm"):
        arr, tr, _ = terrain.read_raster(d / f"{k}.tif")
        if k != "flowdir_d8":
            arr = np.where(arr == terrain.NODATA, np.nan, arr.astype("float64"))
        arrs[k] = arr
    arrs["transform"] = tr
    return arrs


# --------------------------------------------------------------------------- observations
def stage_observations(ctx: Ctx, t: dict) -> dict:
    loc = obs.build_flood_locations(ctx.crs, ctx.g["catchment_search"]["dedup_locations_m"])
    st = obs.build_rain_stations(ctx.crs)
    cur = obs.read_curated()
    qs = sorted({r["query"] for r in cur["reports"] if r.get("query")})
    gc = obs.geocode(qs, ctx.g["observations"], ctx.interim / "geocode_cache.json")
    fo = obs.build_flood_observations(cur, gc, ctx.crs)
    bbmp_wgs = gpd.GeoSeries([t["bbmp"]], crs=ctx.crs).to_crs("EPSG:4326").iloc[0]
    aoi_wkt = shapely.box(*bbmp_wgs.bounds).wkt
    s1_path = ctx.interim / "sentinel1_availability.csv"
    if s1_path.exists():
        s1 = pd.read_csv(s1_path, dtype={"event_ref": str})
    else:
        s1 = obs.sentinel1_availability(cur, aoi_wkt, ctx.g["sentinel1"])
        s1.to_csv(s1_path, index=False)
    loc.to_file(ctx.city / "flood_locations.gpkg", layer="flood_locations", driver="GPKG")
    st.to_file(ctx.city / "rain_stations.gpkg", layer="rain_stations", driver="GPKG")
    fo.to_parquet(ctx.city / "flood_observations.parquet")
    s1.to_csv(ctx.city / "sentinel1_availability.csv", index=False)
    ev = pd.DataFrame(cur["events"])
    ev["event_id"] = ev["event_ref"] + "_bengaluru"
    ev["n_reports"] = ev["event_ref"].map(pd.Series([r["event_ref"] for r in cur["reports"]]).value_counts()).fillna(0).astype(int)
    geocoded = fo[~fo.geometry.is_empty]
    ev["n_geocoded"] = ev["event_id"].map(geocoded["event_id"].value_counts()).fillna(0).astype(int)
    ev["role"] = "candidate (split is Role B's decision in configs/events.yaml)"
    ev.to_csv(ctx.city / "event_candidates.csv", index=False)
    inside_bbmp = loc.within(t["bbmp"])
    ctx.numbers["observations"] = {
        "flood_location_records": int(len(loc)),
        "flood_location_records_rejected_no_coordinates": loc.attrs.get("rejected_no_coordinates", []),
        "flood_location_records_by_source": loc["source_id"].value_counts().to_dict(),
        "flood_location_clusters": int(loc["location_cluster"].nunique()),
        "flood_location_records_inside_bbmp": int(inside_bbmp.sum()),
        "rain_gauges_bengaluru_urban": int(len(st)),
        "rain_gauges_inside_bbmp": int(st.within(t["bbmp"]).sum()),
        "event_reports": int(len(fo)),
        "event_reports_geocoded": int((~fo.geometry.is_empty).sum()),
        "events": ev[["event_id", "n_reports", "n_geocoded"]].to_dict("records"),
        "sentinel1": s1.to_dict("records"),
    }
    return {"loc": loc, "stations": st, "fo": fo, "s1": s1, "events": ev}


# --------------------------------------------------------------------------- network + evidence
def compute_indicators(links: gpd.GeoDataFrame, nodes: gpd.GeoDataFrame, ta: dict, loc_xy: np.ndarray,
                       ecfg: dict, gcfg: dict, extent_edge: shapely.Geometry,
                       stream_km2: float | None = None, buffer_m: float | None = None) -> pd.DataFrame:
    cell = gcfg["dem"]["resolution_m"]
    stream_km2 = stream_km2 or gcfg["terrain"]["stream_threshold_km2"]
    icfg = ecfg["indicators"]
    buffer_m = buffer_m or icfg["terrain_alignment"]["corridor_buffer_m"]
    dist = ind.distance_to_corridor(ta["acc_d8_km2"], stream_km2, cell)
    df = pd.DataFrame({"link_id": links["link_id"].to_numpy(), "hierarchy": links["hierarchy"].to_numpy()})
    df["terrain_alignment"] = ind.terrain_alignment(links.geometry.values, dist, ta["transform"], buffer_m,
                                                    icfg["terrain_alignment"]["sample_spacing_m"])
    pos = nodes.set_index("node_id").geometry
    to_xy = np.array([[pos[n].x, pos[n].y] for n in links["to_node"]])
    fr_xy = np.array([[pos[n].x, pos[n].y] for n in links["from_node"]])
    outdeg = links["from_node"].value_counts()
    is_term = np.array([outdeg.get(n, 0) == 0 for n in links["to_node"]])
    near_edge = np.array([shapely.Point(x, y).within(extent_edge) for x, y in to_xy])
    tp = icfg["terminal_plausibility"]
    df["terminal_plausibility"] = ind.terminal_plausibility(
        to_xy, is_term, near_edge, ta["acc_d8_km2"], ta["sink_depth"], ta["transform"],
        tp["plausible_min_area_km2"], tp["plausible_min_sink_depth_m"])
    cc = icfg["connectivity_consistency"]
    df["connectivity_consistency"] = ind.connectivity_consistency(
        fr_xy, to_xy, links["length_m"].to_numpy(), ta["flowdir_d8"], ta["transform"], cell,
        cc["trace_length_factor"], cc["reach_buffer_m"])
    he = icfg["historical_evidence"]
    df["historical_evidence"], df["historical_count"] = ind.historical_evidence(
        links.geometry.values, loc_xy, he["buffer_m"], he["saturation_count"])
    df["imagery_evidence"] = np.nan
    df["observation_evidence"] = np.nan
    df["to_is_terminal"] = is_term
    return df


def stage_network(ctx: Ctx, segs: dict, t: dict, ta: dict, ob: dict) -> dict:
    a, ncfg = ctx.g["audit"], ctx.g["network"]
    net, counts = nw.build_network(segs["model"], ncfg["snap_tolerance_m"], ncfg["min_segment_length_m"],
                                   a["near_duplicate_hausdorff_m"], a["near_duplicate_length_ratio_min"])
    links = net.links.rename(columns={"seg_id": "link_id"})
    pos = net.nodes.set_index("node_id").geometry
    fx = np.array([[pos[n].x, pos[n].y] for n in links["from_node"]])
    tx = np.array([[pos[n].x, pos[n].y] for n in links["to_node"]])
    zf = ind.sample_raster(ta["dem_conditioned"], ta["transform"], fx[:, 0], fx[:, 1])
    zt = ind.sample_raster(ta["dem_conditioned"], ta["transform"], tx[:, 0], tx[:, 1])
    af = np.array([ind.local_max(ta["acc_d8_km2"], ta["transform"], x, y) for x, y in fx])
    at = np.array([ind.local_max(ta["acc_d8_km2"], ta["transform"], x, y) for x, y in tx])
    links = nw.orient_links(links, zf, zt, af, at, min_drop_m=1.0)
    nodes = net.nodes.copy()
    nxy = shapely.get_coordinates(nodes.geometry.values)
    nodes["elev_m"] = ind.sample_raster(ta["dem_conditioned"], ta["transform"], nxy[:, 0], nxy[:, 1])
    nodes["provenance_elev"] = "ESTIMATED"
    nodes["elev_note"] = "conditioned Copernicus GLO-30 DSM surface elevation at node cell; NOT an invert level"
    outdeg = links["from_node"].value_counts()
    nodes["node_type"] = np.where(nodes["node_id"].map(outdeg).fillna(0) == 0, "outfall", "junction")
    nodes["node_type_note"] = np.where(nodes["node_type"] == "outfall",
                                       "network terminus after INFERRED orientation; Role B to confirm boundary condition", "")
    # extent edge zone: within 500 m inside the BBMP boundary (network extent ends there)
    edge = t["bbmp"].difference(t["bbmp"].buffer(-500))
    loc_xy = shapely.get_coordinates(ob["loc"].geometry.values)
    df = compute_indicators(links, nodes, ta, loc_xy, ctx.e, ctx.g, edge)
    scored = assign_status(df, ctx.e)
    keep = ["terrain_alignment", "terminal_plausibility", "connectivity_consistency", "historical_evidence",
            "historical_count", "imagery_evidence", "observation_evidence", "terrain_index",
            "evidence_score", "evidence_status", "evidence_notes"]
    links = links.merge(scored[["link_id", *keep]], on="link_id")
    # sensitivity (rule variants + indicator variants)
    variants = {}
    for b in ctx.e["sensitivity"]["corridor_buffer_m"]:
        if b != ctx.e["indicators"]["terrain_alignment"]["corridor_buffer_m"]:
            variants[f"corridor buffer {b} m"] = compute_indicators(links, nodes, ta, loc_xy, ctx.e, ctx.g, edge, buffer_m=b)
    for s in ctx.e["sensitivity"]["stream_threshold_km2"]:
        if s != ctx.g["terrain"]["stream_threshold_km2"]:
            variants[f"stream threshold {s} km2"] = compute_indicators(links, nodes, ta, loc_xy, ctx.e, ctx.g, edge, stream_km2=s)
    sens = run_sensitivity(df, ctx.e, variants)
    sens.to_csv(ctx.tables / "01_evidence_sensitivity_city.csv", index=False)
    rejected = net.rejected.rename(columns={"seg_id": "link_id"})
    city_gpkg = ctx.city / "network_city_v1.gpkg"
    if city_gpkg.exists():
        city_gpkg.unlink()
    nodes.to_file(city_gpkg, layer="nodes", driver="GPKG")
    links.to_file(city_gpkg, layer="links", driver="GPKG")
    gpd.GeoDataFrame(rejected, geometry="geometry", crs=ctx.crs).to_file(city_gpkg, layer="rejected", driver="GPKG")
    segs["tertiary"].to_file(city_gpkg, layer="tertiary_evidence_only", driver="GPKG")
    ctx.numbers["network_city"] = {
        **counts, **nw.connectivity_stats(nw.Network(nodes, links, rejected)),
        "direction_basis": links["direction_basis"].value_counts().to_dict(),
        "node_types": nodes["node_type"].value_counts().to_dict(),
        "status_counts": links["evidence_status"].value_counts().to_dict(),
        "status_counts_by_hierarchy": links.groupby("hierarchy")["evidence_status"].value_counts().unstack(fill_value=0).to_dict("index"),
        "indicator_means": {k: float(np.nanmean(links[k])) for k in ("terrain_alignment", "terminal_plausibility", "connectivity_consistency")},
        "indicator_nan_counts": {k: int(links[k].isna().sum()) for k in ("terrain_alignment", "terminal_plausibility", "connectivity_consistency")},
        "terminal_links": int(df["to_is_terminal"].sum()),
        "terminal_implausible": int((links["terminal_plausibility"] == 0).sum()),
        "sensitivity": sens.to_dict("records"),
    }
    return {"nodes": nodes, "links": links, "rejected": rejected}


# --------------------------------------------------------------------------- catchments
def stage_catchments(ctx: Ctx, t: dict, ta: dict, ob: dict, netw: dict) -> gpd.GeoDataFrame:
    cs = ctx.g["catchment_search"]
    wards = read_kml(raw_path("bbmp_wards_2022")).to_crs(ctx.crs)
    allp = []
    n_heads = {}
    for A in cs["head_area_km2"]:
        heads = catchments.head_cells(ta["acc_d8_km2"], ta["flowdir_d8"], A)
        n_heads[str(A)] = int(heads.sum())
        lab = catchments.basin_labels(ta["flowdir_d8"], heads)
        terrain.write_raster(t["dir"] / f"candidate_basins_a{int(A)}.tif", lab.astype("int32"), ta["transform"], ctx.crs, nodata=0)
        polys = catchments.polygons_from_labels(lab, ta["transform"], ctx.crs)
        polys["area_km2"] = polys.area / 1e6
        polys["inside_bbmp_frac"] = polys.geometry.intersection(t["bbmp"]).area / polys.area
        polys = polys[polys["inside_bbmp_frac"] >= cs["min_inside_bbmp_frac"]].reset_index(drop=True)
        hr, hc = np.nonzero(heads)
        head_xy = {k: (ta["transform"].c + (c + .5) * ta["transform"].a, ta["transform"].f + (r + .5) * ta["transform"].e)
                   for k, (r, c) in enumerate(zip(hr, hc), start=1)}
        names = []
        for lbl in polys["basin_label"]:
            hit = wards[wards.contains(shapely.Point(head_xy[lbl]))]
            names.append(slug(hit["WardName"].iloc[0]) if len(hit) else "outside_wards")
        polys["outlet_ward"] = names
        polys["head_area_km2"] = A
        polys["cand_id"] = [f"{n}_a{int(A)}_b{l}" for n, l in zip(names, polys["basin_label"])]
        polys["outlet_x"] = [head_xy[l][0] for l in polys["basin_label"]]
        polys["outlet_y"] = [head_xy[l][1] for l in polys["basin_label"]]
        allp.append(polys)
    polys = gpd.GeoDataFrame(pd.concat(allp, ignore_index=True), geometry="geometry", crs=ctx.crs)
    links, nodes = netw["links"], netw["nodes"]
    mids = links.geometry.interpolate(0.5, normalized=True)
    tert = gpd.read_file(ctx.city / "network_city_v1.gpkg", layer="tertiary_evidence_only")
    fo = ob["fo"][~ob["fo"].geometry.is_empty]
    s1 = ob["s1"]
    post = set(s1.loc[s1.get("lag_h_from_nominal_start", pd.Series(dtype=float)).fillna(-1) >= 0, "event_ref"].astype(str))
    diff = ta["cop_minus_srtm"]
    rows = []
    for r in polys.itertuples():
        poly = r.geometry
        sel = mids.within(poly).to_numpy()
        L = links[sel]
        n_ids = set(L["from_node"]) | set(L["to_node"])
        g = nx.Graph()
        g.add_edges_from((a, b, {"l": l}) for a, b, l in zip(L["from_node"], L["to_node"], L["length_m"]))
        comp_len = [sum(d["l"] for *_, d in g.subgraph(c).edges(data=True)) for c in nx.connected_components(g)]
        tot = L["length_m"].sum()
        mask = rasterio.features.geometry_mask([poly], t["shape"], ta["transform"], invert=True)
        dvals = diff[mask & np.isfinite(diff)]
        d_st = ob["stations"].distance(poly)
        f_in = fo[fo.within(poly)]
        rows.append({
            "cand_id": r.cand_id, "area_km2": r.area_km2,
            "drain_len_km": tot / 1000, "drain_density_km_per_km2": tot / 1000 / r.area_km2,
            "tertiary_len_km": float(tert[tert.geometry.interpolate(0.5, normalized=True).within(poly)].length.sum() / 1000),
            "n_links": int(len(L)), "n_nodes": len(n_ids), "n_components": len(comp_len),
            "lcc_frac": (max(comp_len) / tot) if tot else 0.0,
            "gauges_inside": int((d_st == 0).sum()), "gauges_within_2km": int((d_st <= cs["gauge_near_m"]).sum()),
            "gauges_within_5km": int((d_st <= 5000).sum()),
            "gauge_names_within_2km": "; ".join(ob["stations"].loc[d_st <= cs["gauge_near_m"], "station_name"].astype(str)),
            "flood_location_records": int(ob["loc"].within(poly).sum()),
            "flood_location_clusters": int(ob["loc"].loc[ob["loc"].within(poly), "location_cluster"].nunique()),
            "event_obs_inside": int(len(f_in)), "events_with_obs": int(f_in["event_id"].nunique()),
            "event_ids_inside": "; ".join(sorted(f_in["event_id"].unique())),
            "dem_void_cells": int((mask & np.isnan(ta["dem_conditioned"])).sum()),
            "cop_srtm_mad_m": float(np.median(np.abs(dvals))) if dvals.size else float("nan"),
            "s1_post_event_available": bool(any(e.split("_")[0] in post for e in f_in["event_id"].unique())),
            "n_SUPPORTED": int((L["evidence_status"] == "SUPPORTED").sum()),
            "n_DISPUTED": int((L["evidence_status"] == "DISPUTED").sum()),
            "n_UNVERIFIED": int((L["evidence_status"] == "UNVERIFIED").sum()),
        })
    metrics = pd.DataFrame(rows)
    scored = catchments.score_candidates(polys, metrics)
    scored = scored.sort_values(["weighted_total", "event_obs_inside", "flood_location_clusters", "lcc_frac"],
                                ascending=False).reset_index(drop=True)
    scored["rank"] = np.arange(1, len(scored) + 1)
    cand = polys.merge(scored, on=["cand_id", "area_km2"])
    cand = gpd.GeoDataFrame(cand, geometry="geometry", crs=ctx.crs).sort_values("rank")
    cand.to_file(ctx.city / "candidate_catchments.gpkg", layer="candidates", driver="GPKG")
    scored.drop(columns=[c for c in ("geometry",) if c in scored]).to_csv(ctx.tables / "01_catchment_ranking.csv", index=False)
    ctx.numbers["catchments"] = {
        "n_head_cells_by_scale": n_heads, "n_candidates_inside_bbmp": int(len(cand)),
        "n_candidates_by_scale": cand["head_area_km2"].value_counts().to_dict(),
        "area_km2_range": [float(cand["area_km2"].min()), float(cand["area_km2"].max())],
        "top10": scored.head(10).drop(columns=["geometry"], errors="ignore").to_dict("records"),
    }
    return cand


# --------------------------------------------------------------------------- export
def content_hash(frames: list[gpd.GeoDataFrame]) -> str:
    h = hashlib.sha256()
    for f in frames:
        d = f.copy()
        d["__wkb"] = [g.wkb_hex for g in d.geometry]
        d = d.drop(columns="geometry")
        h.update(pd.util.hash_pandas_object(d.sort_index(axis=1).astype(str), index=False).values.tobytes())
    return h.hexdigest()[:16]


def stage_export(ctx: Ctx, cand: gpd.GeoDataFrame, cid: str, t: dict, ta: dict, netw: dict, ob: dict) -> dict:
    row = cand[cand["cand_id"] == cid].iloc[0]
    poly = row.geometry
    catch_id = slug(cid)
    out_dir = REPO_ROOT / ctx.g["paths"]["processed"] / catch_id
    out_dir.mkdir(parents=True, exist_ok=True)
    links = netw["links"]
    sel = links.geometry.interpolate(0.5, normalized=True).within(poly).to_numpy()
    L = links[sel].copy()
    n_ids = set(L["from_node"]) | set(L["to_node"])
    N = netw["nodes"][netw["nodes"]["node_id"].isin(n_ids)].copy()
    outdeg = L["from_node"].value_counts()
    N["node_type"] = np.where(N["node_id"].map(outdeg).fillna(0) == 0, "outfall", "junction")
    N["node_type_note"] = np.where(N["node_type"] == "outfall",
                                   "terminus within catchment subset (INFERRED orientation); Role B confirms boundary condition", "")
    N["degree"] = N["node_id"].map(pd.concat([L["from_node"], L["to_node"]]).value_counts()).astype(int)
    rej = netw["rejected"]
    R = rej[rej.geometry.is_empty | rej.geometry.isna()].iloc[0:0]
    if len(rej):
        ok = ~(rej.geometry.is_empty | rej.geometry.isna())
        R = rej[ok][rej[ok].geometry.interpolate(0.5, normalized=True).within(poly).to_numpy()]
    C = gpd.GeoDataFrame([{"catchment_id": catch_id, "area_km2": row["area_km2"],
                           "source": "DEM-derived basin (Copernicus GLO-30, D8, head-cell rule, head area >= "
                                     f"{row['head_area_km2']} km2)",
                           "outlet_x": row["outlet_x"], "outlet_y": row["outlet_y"]}], geometry=[poly], crs=ctx.crs)
    gpkg = out_dir / "network_v1.gpkg"
    if gpkg.exists():
        gpkg.unlink()
    N_cols = ["node_id", "elev_m", "node_type", "provenance_elev", "degree", "elev_note", "node_type_note", "geometry"]
    N[N_cols].to_file(gpkg, layer="nodes", driver="GPKG")
    L_cols = ["link_id", "from_node", "to_node", "hierarchy", "length_m", "evidence_score", "evidence_status",
              "direction_provenance", "evidence_notes", "direction_basis", "dz_m", "terrain_alignment",
              "terminal_plausibility", "connectivity_consistency", "historical_evidence", "historical_count",
              "imagery_evidence", "observation_evidence", "terrain_index", "snap_shift_m", "source_id",
              "src_objectid", "geometry"]
    L[L_cols].to_file(gpkg, layer="links", driver="GPKG")
    gpd.GeoDataFrame(R, geometry="geometry", crs=ctx.crs).to_file(gpkg, layer="rejected", driver="GPKG")
    C.to_file(gpkg, layer="catchment", driver="GPKG")
    fo = ob["fo"][~ob["fo"].geometry.is_empty]
    fo_in = fo[fo.within(poly.buffer(500))]
    fo_in.to_parquet(out_dir / "flood_observations.parquet")
    loc_in = ob["loc"][ob["loc"].within(poly.buffer(500))]
    loc_in.to_file(out_dir / "flood_locations.gpkg", layer="flood_locations", driver="GPKG")
    # terrain clip for Role B (surface spreading support)
    tdir = out_dir / "terrain"
    tdir.mkdir(exist_ok=True)
    clip = [poly.buffer(500)]
    for name in ("dem_conditioned", "sink_depth", "flowdir_d8", "acc_d8_km2", "acc_dinf_km2"):
        with rasterio.open(t["dir"] / f"{name}.tif") as src:
            arr, tr = rasterio.mask.mask(src, clip, crop=True, nodata=src.nodata)
            prof = src.profile | {"height": arr.shape[1], "width": arr.shape[2], "transform": tr}
            with rasterio.open(tdir / f"{name}.tif", "w", **prof) as dst:
                dst.write(arr)
    with rasterio.open(tdir / "dem_conditioned.tif") as ref:
        m = rasterio.features.geometry_mask([poly], (ref.height, ref.width), ref.transform, invert=True)
        terrain.write_raster(tdir / "catchment_mask.tif", m.astype("uint8"), ref.transform, ctx.crs, nodata=0)
    netv = content_hash([N[N_cols], L[L_cols]])
    manifest = {
        "run_id": dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + netv[:6],
        "exp_class": "C_historical",
        "exp_class_note": "real observed data products; no predictive-performance claim",
        "catchment_id": catch_id, "network_version": netv,
        "git_commit": None, "git_dirty": None,
        "git_note": "working copy is not a git repository; Role D to tag data-v1 once the repo exists",
        "config_hash": hashlib.sha256((REPO_ROOT / "configs/geo.yaml").read_bytes() + (REPO_ROOT / "configs/evidence.yaml").read_bytes()).hexdigest()[:16],
        "input_file_hashes": {p.parent.name: sha256_file(p) for p in sorted((REPO_ROOT / "data/raw").glob("*/*")) if p.is_file() and not p.name.endswith(".part")},
        "curated_file_hash": sha256_file(REPO_ROOT / "data/curated/news_flood_reports.yaml"),
        "seed": ctx.g["audit"]["spot_check_seed"],
        "software_versions": {"python": sys.version.split()[0], "geopandas": gpd.__version__, "rasterio": rasterio.__version__,
                              "shapely": shapely.__version__, "numpy": np.__version__},
        "hardware": {"platform": platform.platform(), "cpu": platform.processor()},
        "counts": {"nodes": int(len(N)), "links": int(len(L)), "rejected": int(len(R)),
                   "outfalls": int((N["node_type"] == "outfall").sum()),
                   "status": L["evidence_status"].value_counts().to_dict(),
                   "flood_observations_within_500m": int(len(fo_in)), "flood_locations_within_500m": int(len(loc_in))},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=_json_default), encoding="utf-8")
    ctx.numbers["export"] = {"catchment_id": catch_id, "dir": str(out_dir.relative_to(REPO_ROOT)), **manifest["counts"],
                             "network_version": netv, "area_km2": float(row["area_km2"])}
    return {"dir": out_dir, "catchment_id": catch_id, "nodes": N, "links": L, "poly": poly, "fo": fo_in, "loc": loc_in}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--catchment", help="cand_id to export (default: rank 1)")
    ap.add_argument("--no-figures", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    t0 = time.time()
    ctx = Ctx()
    segs = stage_audit(ctx)
    t = stage_terrain(ctx)
    log.info("finished %s", "stage_terrain")
    ta = _load_terrain(t)
    ob = stage_observations(ctx, t)
    log.info("finished %s", "stage_observations")
    netw = stage_network(ctx, segs, t, ta, ob)
    log.info("finished %s", "stage_network")
    cand = stage_catchments(ctx, t, ta, ob, netw)
    log.info("finished %s", "stage_catchments")
    cid = args.catchment or cand.iloc[0]["cand_id"]
    exp = stage_export(ctx, cand, cid, t, ta, netw, ob)
    if not args.no_figures:
        from floodtwin.geo import figures
        figures.make_all(ctx, segs, t, ta, ob, netw, cand, exp)
    ctx.numbers["runtime_s"] = round(time.time() - t0, 1)
    (ctx.reports / "01_data_audit_numbers.json").write_text(json.dumps(ctx.numbers, indent=1, default=_json_default), encoding="utf-8")
    log.info("done in %.0f s; exported %s", time.time() - t0, exp["catchment_id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
