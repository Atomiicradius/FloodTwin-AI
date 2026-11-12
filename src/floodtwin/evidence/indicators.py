"""Per-segment evidence indicators (Role A, technical-specs §5.3).

Each indicator is computed and stored separately, in [0, 1] or NaN when not assessable.
All DEM-derived indicators belong to ONE evidence group ("terrain") because they share the
same DEM; they are never counted as independent of each other.

Language rule (P3): a low terrain indicator means "terrain-scale inconsistency, worth
investigating", never "the drain does not exist / is blocked".
"""

from __future__ import annotations

import numpy as np
import shapely
from rasterio.transform import rowcol
from scipy import ndimage

from floodtwin.geo.terrain import trace_downstream


def distance_to_corridor(acc_km2: np.ndarray, threshold_km2: float, cell_m: float) -> np.ndarray:
    """Euclidean distance (m) from every cell to the nearest terrain corridor cell.

    Corridor = cells with D8 upstream area >= `threshold_km2`.
    """
    corridor = np.isfinite(acc_km2) & (acc_km2 >= threshold_km2)
    if not corridor.any():
        return np.full(acc_km2.shape, np.inf)
    return ndimage.distance_transform_edt(~corridor) * cell_m


def sample_raster(arr: np.ndarray, transform, xs: np.ndarray, ys: np.ndarray, fill=np.nan) -> np.ndarray:
    """Nearest-cell lookup of raster values at metric coordinates (outside -> `fill`)."""
    rows, cols = rowcol(transform, xs, ys)
    rows, cols = np.asarray(rows), np.asarray(cols)
    ok = (rows >= 0) & (rows < arr.shape[0]) & (cols >= 0) & (cols < arr.shape[1])
    out = np.full(len(xs), fill, dtype="float64")
    out[ok] = arr[rows[ok], cols[ok]]
    return out


def terrain_alignment(lines, dist_m: np.ndarray, transform, buffer_m: float, spacing_m: float) -> np.ndarray:
    """Fraction of each line's length lying within `buffer_m` of a terrain flow corridor.

    Args:
        lines: sequence of shapely LineStrings (metric CRS).
        dist_m: output of `distance_to_corridor` on the same grid.
        buffer_m: corridor half-width tolerance (m).
        spacing_m: sampling interval along the line (m).

    Returns:
        Array in [0, 1] (NaN for empty lines).
    """
    out = np.full(len(lines), np.nan)
    for i, g in enumerate(lines):
        if g is None or g.is_empty or g.length == 0:
            continue
        n = max(2, int(np.ceil(g.length / spacing_m)) + 1)
        pts = shapely.line_interpolate_point(g, np.linspace(0, g.length, n))
        xy = shapely.get_coordinates(pts)
        d = sample_raster(dist_m, transform, xy[:, 0], xy[:, 1], fill=np.inf)
        out[i] = float(np.mean(d <= buffer_m))
    return out


def local_max(arr: np.ndarray, transform, x: float, y: float, radius_cells: int = 1) -> float:
    """Max of `arr` in a (2r+1)^2 window around (x, y); NaN outside the grid."""
    r, c = rowcol(transform, x, y)
    if not (0 <= r < arr.shape[0] and 0 <= c < arr.shape[1]):
        return float("nan")
    win = arr[max(r - radius_cells, 0): r + radius_cells + 1, max(c - radius_cells, 0): c + radius_cells + 1]
    win = win[np.isfinite(win)]
    return float(win.max()) if win.size else float("nan")


def terminal_plausibility(
    to_xy: np.ndarray,
    to_is_terminal: np.ndarray,
    near_extent_edge: np.ndarray,
    acc_km2: np.ndarray,
    sink_m: np.ndarray,
    transform,
    min_area_km2: float,
    min_sink_m: float,
) -> np.ndarray:
    """Terrain plausibility of each link's downstream end.

    1.0  downstream node continues into another link (not a network terminus), or the
         terminus sits on a terrain corridor (upstream area >= `min_area_km2`) or in a
         depression >= `min_sink_m` deep (tank / lake / low point);
    0.0  terminus on neither (terrain-scale implausible end, worth investigating);
    NaN  terminus within the edge zone of the mapped network extent (cannot be judged).
    """
    out = np.ones(len(to_xy))
    for i, (x, y) in enumerate(to_xy):
        if not to_is_terminal[i]:
            continue
        if near_extent_edge[i]:
            out[i] = np.nan
            continue
        a = local_max(acc_km2, transform, x, y)
        s = local_max(sink_m, transform, x, y)
        out[i] = 1.0 if (a >= min_area_km2 or s >= min_sink_m) else 0.0
    return out


def connectivity_consistency(
    from_xy: np.ndarray,
    to_xy: np.ndarray,
    lengths_m: np.ndarray,
    fdir: np.ndarray,
    transform,
    cell_m: float,
    trace_factor: float,
    reach_buffer_m: float,
) -> np.ndarray:
    """Does terrain flow from a link's upstream end reach its downstream end?

    Traces D8 flow from the upstream node for up to `trace_factor * length` and returns 1.0
    if the traced path passes within `reach_buffer_m` of the downstream node, else 0.0.
    Because link direction is itself INFERRED from the same DEM, this tests that the
    network connection follows a terrain flow path, not that the direction is correct.
    """
    out = np.full(len(from_xy), np.nan)
    for i in range(len(from_xy)):
        r, c = rowcol(transform, from_xy[i, 0], from_xy[i, 1])
        if not (0 <= r < fdir.shape[0] and 0 <= c < fdir.shape[1]):
            continue
        steps = int(np.ceil(trace_factor * lengths_m[i] / cell_m)) + 2
        path = np.array(trace_downstream(fdir, r, c, steps), dtype=float)
        # cell centres in metric coordinates
        px = transform.c + (path[:, 1] + 0.5) * transform.a
        py = transform.f + (path[:, 0] + 0.5) * transform.e
        d = np.hypot(px - to_xy[i, 0], py - to_xy[i, 1]).min()
        out[i] = 1.0 if d <= reach_buffer_m else 0.0
    return out


def historical_evidence(lines, locations_xy: np.ndarray, buffer_m: float, saturation: int) -> tuple[np.ndarray, np.ndarray]:
    """Count recorded flood locations within `buffer_m` of each line.

    Returns:
        (index in [0, 1] = min(1, count / saturation), raw counts). This is a behavioural
        hint only: flooding near a drain neither confirms nor refutes the drain.
    """
    if len(locations_xy) == 0:
        return np.zeros(len(lines)), np.zeros(len(lines), dtype=int)
    pts = shapely.points(locations_xy)
    tree = shapely.STRtree(pts)
    li, _ = tree.query(np.asarray(lines, dtype=object), predicate="dwithin", distance=buffer_m)
    counts = np.bincount(li, minlength=len(lines))
    return np.minimum(1.0, counts / saturation), counts
