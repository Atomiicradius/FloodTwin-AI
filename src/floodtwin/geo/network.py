"""Drainage-line cleaning and graph construction (Role A).

Pipeline (each step is a pure function on GeoDataFrames in EPSG:32643, metres):

1. `load_drainage`      KML -> exploded single-part LineStrings with stable `seg_id`.
2. `flag_degenerate`    empty / too-short parts -> rejected (ZERO_LENGTH, EMPTY_GEOMETRY).
3. `flag_duplicates`    exact (incl. reversed) and near duplicates -> rejected (DUPLICATE_*).
4. `split_at_junctions` split a line where another line's endpoint touches its interior (T-joins).
5. `snap_endpoints`     cluster endpoints within `tol_m` into nodes; links get from/to node ids.

Nothing is deleted silently: every removed feature goes to the `rejected` frame with a
`reason_code`. Geometry is changed only by (a) splitting at T-junctions and (b) moving end
vertices to their node position; the displacement is recorded in `snap_shift_m`.
Link direction is NOT known from the source (no attribute encodes it); `orient_links` infers
it from terrain and tags it `INFERRED`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import substring

log = logging.getLogger(__name__)

HIER_PRIORITY = {"primary": 0, "secondary": 1, "tertiary": 2, "other": 3}


def load_drainage(raw: gpd.GeoDataFrame, hierarchy: str, source_id: str, crs: str) -> gpd.GeoDataFrame:
    """Explode a raw drainage KML frame into single-part lines.

    Args:
        raw: output of `floodtwin.geo.kml.read_kml` (EPSG:4326).
        hierarchy: `primary|secondary|tertiary|other`.
        source_id: manifest id of the file.
        crs: metric CRS to reproject to (EPSG:32643).

    Returns:
        GeoDataFrame with `seg_id` (`<P|S|T><OBJECTID>_<part>`), `hierarchy`, `source_id`,
        `src_objectid`, `part`, `length_m`, `geometry` (LineString, metres). Parts that are
        null geometries are kept with empty geometry so they can be rejected explicitly.
    """
    df = raw.copy()
    oid = df["OBJECTID"] if "OBJECTID" in df.columns else df["kml_index"].astype(str)
    oid = oid.fillna(df["kml_index"].astype(str)).astype(str).str.replace(r"\.0$", "", regex=True)
    if oid.duplicated().any():
        log.warning("%s: OBJECTID not unique; using kml_index for ids", source_id)
        oid = df["kml_index"].astype(str)
    df["src_objectid"] = oid
    df["geometry"] = df.geometry.fillna(LineString())
    df = df.to_crs(crs)
    ex = df.explode(index_parts=True).reset_index(level=1).rename(columns={"level_1": "part"})
    ex = ex.reset_index(drop=True)
    prefix = hierarchy[0].upper()
    ex["seg_id"] = prefix + ex["src_objectid"] + "_" + ex["part"].astype(str)
    ex["hierarchy"] = hierarchy
    ex["source_id"] = source_id
    ex["length_m"] = ex.geometry.length
    cols = ["seg_id", "hierarchy", "source_id", "src_objectid", "part", "length_m", "geometry"]
    return gpd.GeoDataFrame(ex[cols], geometry="geometry", crs=crs)


def flag_degenerate(segs: gpd.GeoDataFrame, min_length_m: float) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Split off empty, invalid-after-repair or too-short segments.

    Returns:
        (kept, rejected) where rejected has `reason_code` in
        {EMPTY_GEOMETRY, ZERO_LENGTH}. Invalid-but-nonempty lines (self-intersections are
        legal for LineStrings) are kept; `is_simple` is reported by the audit instead.
    """
    empty = segs.geometry.is_empty | segs.geometry.isna()
    short = ~empty & (segs["length_m"] < min_length_m)
    rej = segs[empty | short].copy()
    rej["reason_code"] = np.where(empty[empty | short], "EMPTY_GEOMETRY", "ZERO_LENGTH")
    rej["reason_detail"] = ""
    return segs[~(empty | short)].copy(), rej


def flag_duplicates(
    segs: gpd.GeoDataFrame, hausdorff_m: float, length_ratio_min: float
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Detect exact and near-duplicate segments; keep one per group.

    Exact duplicate: same vertex sequence up to reversal (`shapely.normalize`).
    Near duplicate: Hausdorff distance <= `hausdorff_m` and length ratio >= `length_ratio_min`.
    The kept member is the one with the highest hierarchy, then the smallest `seg_id`
    (deterministic). Rejected rows record the kept id in `reason_detail`.
    """
    segs = segs.copy()
    segs["_prio"] = segs["hierarchy"].map(HIER_PRIORITY).fillna(9)
    segs = segs.sort_values(["_prio", "seg_id"]).reset_index(drop=True)
    norm = shapely.normalize(segs.geometry.values)
    wkb = pd.Series([g.wkb_hex for g in norm])
    dropped: dict[int, tuple[str, str]] = {}
    first_of: dict[str, int] = {}
    for i, key in enumerate(wkb):
        if key in first_of:
            dropped[i] = ("DUPLICATE_EXACT", segs.at[first_of[key], "seg_id"])
        else:
            first_of[key] = i
    geoms = segs.geometry.values
    tree = shapely.STRtree(geoms)
    left, right = tree.query(geoms, predicate="dwithin", distance=hausdorff_m)
    lengths = segs["length_m"].to_numpy()
    for i, j in zip(left, right):
        if i >= j or i in dropped or j in dropped:
            continue
        ratio = min(lengths[i], lengths[j]) / max(lengths[i], lengths[j])
        if ratio < length_ratio_min:
            continue
        if shapely.hausdorff_distance(geoms[i], geoms[j]) <= hausdorff_m:
            dropped[j] = ("DUPLICATE_NEAR", segs.at[i, "seg_id"])
    mask = segs.index.isin(list(dropped))
    rej = segs[mask].copy()
    rej["reason_code"] = [dropped[i][0] for i in rej.index]
    rej["reason_detail"] = ["duplicate of " + dropped[i][1] for i in rej.index]
    keep = segs[~mask].drop(columns="_prio")
    return keep.reset_index(drop=True), rej.drop(columns="_prio")


def split_at_junctions(segs: gpd.GeoDataFrame, tol_m: float) -> tuple[gpd.GeoDataFrame, int]:
    """Split lines where another line's endpoint lies within `tol_m` of their interior.

    Child segments get ids `<seg_id>.<k>` (k = 0.. along the line).

    Returns:
        (split frame, number of split points inserted).
    """
    geoms = segs.geometry.values
    starts = shapely.get_point(geoms, 0)
    ends = shapely.get_point(geoms, -1)
    pts = np.concatenate([starts, ends])
    owner = np.concatenate([np.arange(len(geoms)), np.arange(len(geoms))])
    tree = shapely.STRtree(geoms)
    p_idx, l_idx = tree.query(pts, predicate="dwithin", distance=tol_m)
    cuts: dict[int, list[float]] = {}
    for p, li in zip(p_idx, l_idx):
        if owner[p] == li:
            continue
        line = geoms[li]
        d = line.project(pts[p])
        if d <= tol_m or d >= line.length - tol_m:
            continue  # near an existing endpoint: snapping handles it
        cuts.setdefault(li, []).append(d)
    rows = []
    n_cuts = 0
    for i, row in enumerate(segs.itertuples(index=False)):
        if i not in cuts:
            rows.append(row._asdict())
            continue
        ds = sorted(set(round(d, 3) for d in cuts[i]))
        # merge cut points closer than tol to each other
        merged: list[float] = []
        for d in ds:
            if not merged or d - merged[-1] > tol_m:
                merged.append(d)
        n_cuts += len(merged)
        bounds = [0.0, *merged, row.geometry.length]
        for k in range(len(bounds) - 1):
            r = row._asdict()
            r["geometry"] = substring(row.geometry, bounds[k], bounds[k + 1])
            r["seg_id"] = f"{row.seg_id}.{k}"
            r["length_m"] = r["geometry"].length
            rows.append(r)
    out = gpd.GeoDataFrame(rows, geometry="geometry", crs=segs.crs)
    return out, n_cuts


def _cluster_points(xy: np.ndarray, tol_m: float) -> np.ndarray:
    """Union-find clustering of points within `tol_m` (single linkage). Returns labels."""
    pts = shapely.points(xy)
    tree = shapely.STRtree(pts)
    a, b = tree.query(pts, predicate="dwithin", distance=tol_m)
    g = nx.Graph()
    g.add_nodes_from(range(len(xy)))
    g.add_edges_from((i, j) for i, j in zip(a, b) if i < j)
    labels = np.empty(len(xy), dtype=int)
    # deterministic: components ordered by their smallest member
    comps = sorted((sorted(c) for c in nx.connected_components(g)), key=lambda c: c[0])
    for k, comp in enumerate(comps):
        labels[comp] = k
    return labels


@dataclass
class Network:
    """Cleaned network in the metric CRS."""

    nodes: gpd.GeoDataFrame
    links: gpd.GeoDataFrame
    rejected: gpd.GeoDataFrame


def snap_endpoints(segs: gpd.GeoDataFrame, tol_m: float) -> Network:
    """Cluster endpoints within `tol_m` into nodes and attach from/to ids.

    Node ids are `N<E>_<N>` from the cluster centroid rounded to the metre (stable while
    geometry is unchanged); a numeric suffix disambiguates rare collisions.
    `from_node`/`to_node` follow digitising order here; `orient_links` sets final direction.

    Returns:
        Network with nodes (`node_id`, `degree`, geometry), links (adds `from_node`,
        `to_node`, `snap_shift_m`) and rejected (`SELF_LOOP_AFTER_SNAP`).
    """
    geoms = segs.geometry.values
    s = shapely.get_coordinates(shapely.get_point(geoms, 0))
    e = shapely.get_coordinates(shapely.get_point(geoms, -1))
    xy = np.vstack([s, e])
    lab = _cluster_points(xy, tol_m)
    n = len(geoms)
    cent = pd.DataFrame(xy, columns=["x", "y"]).groupby(lab).mean()
    ids: list[str] = []
    seen: dict[str, int] = {}
    for x, y in cent.itertuples(index=False):
        base = f"N{int(round(x))}_{int(round(y))}"
        k = seen.get(base, 0)
        seen[base] = k + 1
        ids.append(base if k == 0 else f"{base}_{k}")
    node_ids = np.array(ids)
    links = segs.copy().reset_index(drop=True)
    links["from_node"] = node_ids[lab[:n]]
    links["to_node"] = node_ids[lab[n:]]
    new_geoms, shifts = [], []
    for i, g in enumerate(geoms):
        c = np.asarray(g.coords)
        a = cent.iloc[lab[i]].to_numpy()
        b = cent.iloc[lab[n + i]].to_numpy()
        shifts.append(float(max(np.hypot(*(c[0] - a)), np.hypot(*(c[-1] - b)))))
        c = c.copy()
        c[0], c[-1] = a, b
        new_geoms.append(LineString(c))
    links["geometry"] = new_geoms
    links["snap_shift_m"] = shifts
    links["length_m"] = links.geometry.length
    loop = links["from_node"] == links["to_node"]
    rej = links[loop].copy()
    rej["reason_code"] = "SELF_LOOP_AFTER_SNAP"
    rej["reason_detail"] = f"both ends snapped to one node at tol={tol_m} m"
    links = links[~loop].reset_index(drop=True)
    deg = pd.concat([links["from_node"], links["to_node"]]).value_counts()
    used = sorted(set(links["from_node"]) | set(links["to_node"]))
    pos = {nid: Point(cent.iloc[k]) for k, nid in enumerate(node_ids)}
    nodes = gpd.GeoDataFrame(
        {"node_id": used, "degree": [int(deg[u]) for u in used]},
        geometry=[pos[u] for u in used],
        crs=segs.crs,
    )
    return Network(nodes=nodes, links=links, rejected=rej)


def connectivity_stats(net: Network) -> dict[str, float]:
    """Undirected connectivity summary used by the audit."""
    g = nx.Graph()
    g.add_nodes_from(net.nodes["node_id"])
    for r in net.links.itertuples(index=False):
        g.add_edge(r.from_node, r.to_node, length=r.length_m)
    comps = list(nx.connected_components(g))
    total = float(net.links["length_m"].sum()) or 1.0
    lengths = []
    for c in comps:
        sub = g.subgraph(c)
        lengths.append(sum(d["length"] for _, _, d in sub.edges(data=True)))
    return {
        "n_nodes": int(g.number_of_nodes()),
        "n_links": int(len(net.links)),
        "n_components": len(comps),
        "largest_component_length_frac": float(max(lengths) / total) if lengths else 0.0,
        "n_dangling_nodes": int((net.nodes["degree"] == 1).sum()),
        "n_junction_nodes": int((net.nodes["degree"] >= 3).sum()),
    }


def build_network(segs: gpd.GeoDataFrame, tol_m: float, min_length_m: float,
                  hausdorff_m: float, length_ratio_min: float) -> tuple[Network, dict]:
    """Full cleaning chain; returns the network and step counts for the audit."""
    kept, rej_deg = flag_degenerate(segs, min_length_m)
    kept, rej_dup = flag_duplicates(kept, hausdorff_m, length_ratio_min)
    split, n_cuts = split_at_junctions(kept, tol_m)
    split2, rej_short = flag_degenerate(split, min_length_m)
    net = snap_endpoints(split2, tol_m)
    rejected = pd.concat([rej_deg, rej_dup, rej_short, net.rejected], ignore_index=True)
    rejected = gpd.GeoDataFrame(rejected, geometry="geometry", crs=segs.crs)
    counts = {
        "input_parts": len(segs),
        "rejected_degenerate": len(rej_deg) + len(rej_short),
        "rejected_duplicate_exact": int((rej_dup["reason_code"] == "DUPLICATE_EXACT").sum()),
        "rejected_duplicate_near": int((rej_dup["reason_code"] == "DUPLICATE_NEAR").sum()),
        "t_junction_splits": n_cuts,
        "rejected_self_loop": len(net.rejected),
    }
    return Network(net.nodes, net.links, rejected), counts


def orient_links(
    links: gpd.GeoDataFrame,
    z_from: np.ndarray,
    z_to: np.ndarray,
    a_from: np.ndarray,
    a_to: np.ndarray,
    min_drop_m: float,
) -> gpd.GeoDataFrame:
    """Set link direction from terrain (the source data encode no direction).

    Rule: downstream end = lower conditioned-DEM elevation when |dz| >= `min_drop_m`;
    otherwise the end with larger D8 upstream area; ties keep digitising order.
    All directions get `direction_provenance = INFERRED` and a `direction_basis` note.

    Args:
        z_from, z_to: conditioned DEM elevation (m) at current from/to node.
        a_from, a_to: D8 upstream area (km2) at current from/to node.
    """
    out = links.copy()
    dz = z_from - z_to  # >0 means from-end is higher (already downhill)
    by_z = np.abs(dz) >= min_drop_m
    flip = np.where(by_z, dz < 0, a_from > a_to)
    basis = np.where(by_z, "dem_elevation_drop", np.where(a_from != a_to, "upstream_area", "digitising_order"))
    f, t = out["from_node"].to_numpy().copy(), out["to_node"].to_numpy().copy()
    out["from_node"] = np.where(flip, t, f)
    out["to_node"] = np.where(flip, f, t)
    out["geometry"] = [g.reverse() if fl else g for g, fl in zip(out.geometry, flip)]
    out["direction_provenance"] = "INFERRED"
    out["direction_basis"] = basis
    out["dz_m"] = np.abs(dz)
    return out
