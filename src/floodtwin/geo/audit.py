"""Data-audit checks (Role A, technical-specs §5.1). Pure functions returning dicts/frames."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString

from floodtwin.geo import network as nw

HYDRAULIC_KEYWORDS = ("diam", "width", "depth", "invert", "slope", "rough", "manning", "capac",
                      "flow", "dir", "material", "height", "size", "level", "elev")


def attribute_inventory(raw: gpd.GeoDataFrame) -> dict:
    """List attributes, their fill rate and number of distinct values; flag hydraulic-looking ones."""
    inv = {}
    for c in raw.columns:
        if c in ("geometry", "kml_index"):
            continue
        s = raw[c]
        inv[c] = {
            "filled_frac": round(float(s.notna().mean()), 4),
            "n_distinct": int(s.nunique(dropna=True)),
            "examples": [str(v) for v in s.dropna().unique()[:3]],
            "hydraulic_keyword_match": any(k in c.lower() for k in HYDRAULIC_KEYWORDS),
        }
    return inv


def geometry_checks(raw: gpd.GeoDataFrame, segs: gpd.GeoDataFrame) -> dict:
    """Geometry types, null/empty/zero-length parts, non-simple lines, coordinate ranges."""
    gt = raw.geom_type.fillna("None").value_counts().to_dict()
    multi_parts = segs.groupby("src_objectid")["part"].nunique()
    return {
        "n_features": int(len(raw)),
        "geometry_types": {str(k): int(v) for k, v in gt.items()},
        "n_null_geometry": int(raw.geometry.isna().sum()),
        "n_parts_after_explode": int(len(segs)),
        "n_multipart_features": int((multi_parts > 1).sum()),
        "n_empty_parts": int(segs.geometry.is_empty.sum()),
        "n_zero_length_parts_lt_1m": int(((segs["length_m"] < 1.0) & ~segs.geometry.is_empty).sum()),
        "n_non_simple_parts": int((~segs.geometry[~segs.geometry.is_empty].is_simple).sum()),
        "n_invalid_parts": int((~segs.geometry[~segs.geometry.is_empty].is_valid).sum()),
        "total_length_km": round(float(segs["length_m"].sum() / 1000), 2),
        "length_m_quantiles": {q: round(float(v), 1) for q, v in segs["length_m"].quantile([0, .05, .5, .95, 1]).items()},
        "bounds_wgs84": [round(float(v), 4) for v in raw.total_bounds],
    }


def duplicate_checks(segs: gpd.GeoDataFrame, hausdorff_m: float, ratio: float) -> dict:
    kept, rej = nw.flag_degenerate(segs, 1.0)
    _, dup = nw.flag_duplicates(kept, hausdorff_m, ratio)
    return {
        "n_exact_duplicates": int((dup["reason_code"] == "DUPLICATE_EXACT").sum()),
        "n_near_duplicates": int((dup["reason_code"] == "DUPLICATE_NEAR").sum()),
        "examples": dup[["seg_id", "reason_code", "reason_detail"]].head(10).to_dict("records"),
    }


def connectivity_sensitivity(segs: gpd.GeoDataFrame, tolerances: list[float], hausdorff_m: float,
                             ratio: float) -> pd.DataFrame:
    """Network statistics for each snap tolerance (tech-specs §5.1)."""
    rows = []
    for tol in tolerances:
        net, counts = nw.build_network(segs, tol, 1.0, hausdorff_m, ratio)
        rows.append({"snap_tol_m": tol, **counts, **nw.connectivity_stats(net)})
    return pd.DataFrame(rows)


def dangling_gap_distances(net: nw.Network) -> np.ndarray:
    """Distance (m) from each dangling node to the nearest link not incident to it."""
    dang = net.nodes[net.nodes["degree"] == 1]
    geoms = net.links.geometry.values
    tree = shapely.STRtree(geoms)
    inc = pd.concat([
        net.links[["from_node"]].rename(columns={"from_node": "n"}).assign(i=net.links.index),
        net.links[["to_node"]].rename(columns={"to_node": "n"}).assign(i=net.links.index),
    ]).groupby("n")["i"].apply(set).to_dict()
    out = []
    for nid, p in zip(dang["node_id"], dang.geometry):
        cand = tree.query(p.buffer(500))
        ds = [p.distance(geoms[j]) for j in cand if j not in inc.get(nid, set())]
        out.append(min(ds) if ds else np.inf)
    return np.asarray(out)


def overlap_between(a: gpd.GeoDataFrame, b: gpd.GeoDataFrame, buffer_m: float) -> float:
    """Fraction of `a`'s length lying within `buffer_m` of any line in `b`."""
    if a.empty or b.empty:
        return float("nan")
    # Sample each line of `a` every 5 m and test the distance to the nearest line of `b`
    # (much faster than unioning thousands of buffers; error <= 5 m of length per segment).
    tree = shapely.STRtree(b.geometry.values)
    inside = total = 0.0
    for g in a.geometry.values:
        if g is None or g.is_empty or g.length == 0:
            continue
        n = max(2, int(np.ceil(g.length / 5.0)) + 1)
        pts = shapely.line_interpolate_point(g, np.linspace(0, g.length, n))
        hit = tree.query(pts, predicate="dwithin", distance=buffer_m)[0]
        frac = len(np.unique(hit)) / n
        inside += frac * g.length
        total += g.length
    return float(inside / total) if total else float("nan")


def read_osm_waterways(path: Path, crs: str) -> gpd.GeoDataFrame:
    """OSM Overpass JSON (`out geom`) -> LineStrings with the waterway tag."""
    d = json.loads(path.read_text(encoding="utf-8"))
    rows, geoms = [], []
    for e in d["elements"]:
        pts = [(p["lon"], p["lat"]) for p in e.get("geometry", [])]
        if len(pts) < 2:
            continue
        rows.append({"osm_id": e["id"], "waterway": e["tags"].get("waterway"),
                     "tunnel": e["tags"].get("tunnel"), "name": e["tags"].get("name")})
        geoms.append(LineString(pts))
    return gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326").to_crs(crs)


def spot_check_sample(segs: gpd.GeoDataFrame, n: int, seed: int) -> pd.DataFrame:
    """Seeded sample of segments for the manual positional check against imagery.

    Returns seg_id, hierarchy, midpoint lon/lat, an OSM map link, and empty result columns
    to be filled by a person (never auto-filled).
    """
    rng = np.random.default_rng(seed)
    pick = segs.iloc[np.sort(rng.choice(len(segs), size=min(n, len(segs)), replace=False))]
    mid = pick.geometry.interpolate(0.5, normalized=True).to_crs("EPSG:4326")
    return pd.DataFrame({
        "seg_id": pick["seg_id"].to_numpy(),
        "hierarchy": pick["hierarchy"].to_numpy(),
        "length_m": pick["length_m"].round(1).to_numpy(),
        "mid_lon": mid.x.round(6).to_numpy(),
        "mid_lat": mid.y.round(6).to_numpy(),
        "map_link": [f"https://www.openstreetmap.org/?mlat={y:.6f}&mlon={x:.6f}#map=18/{y:.6f}/{x:.6f}" for x, y in zip(mid.x, mid.y)],
        "visible_channel_yes_no_unclear": "",
        "offset_m_estimate": "",
        "checked_by": "",
        "checked_on": "",
    })
