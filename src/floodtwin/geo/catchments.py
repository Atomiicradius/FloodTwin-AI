"""Candidate catchment delineation and scoring (Role A, technical-specs §5.2).

Candidates are terrain-defined, non-nested basins: the watershed of every "head" cell, i.e.
a cell whose D8 upstream area is >= A while every neighbour draining into it has area < A.
No head can lie upstream of another head, so candidate basins never overlap; their areas
lie in [A, 8A).

Scores 0-3 per criterion with the raw evidence kept alongside. Criteria that the open data
cannot support are scored honestly (often 0) rather than guessed.
"""

from __future__ import annotations

import logging

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio.features
import shapely
from shapely.geometry import shape

from floodtwin.geo.terrain import D8_OFFSETS, upstream_max

log = logging.getLogger(__name__)

WEIGHTS = {  # technical-specs §5.2
    "drainage": 3, "rainfall_gauges": 3, "flood_observations": 3, "terrain": 2,
    "network_size": 2, "events": 3, "independent_evidence": 2,
}


def head_cells(acc_km2: np.ndarray, fdir: np.ndarray, area_km2: float) -> np.ndarray:
    """Boolean mask of head cells for threshold `area_km2`."""
    up = upstream_max(acc_km2, fdir)
    return np.isfinite(acc_km2) & (acc_km2 >= area_km2) & (up < area_km2)


def basin_labels(fdir: np.ndarray, heads: np.ndarray) -> np.ndarray:
    """Label every cell with the id (1..n) of the head cell it drains to (0 = none).

    Walks each cell downstream until it hits a labelled cell, a head, an edge or a sink,
    then paints the path; O(cells) amortised.
    """
    h, w = fdir.shape
    lab = np.zeros((h, w), dtype=np.int32)
    hr, hc = np.nonzero(heads)
    for k, (r, c) in enumerate(zip(hr, hc), start=1):
        lab[r, c] = k
    done = lab > 0
    seen_none = np.zeros((h, w), dtype=bool)
    for r0 in range(h):
        for c0 in range(w):
            if done[r0, c0] or seen_none[r0, c0]:
                continue
            path = []
            r, c = r0, c0
            result = 0
            while True:
                if done[r, c]:
                    result = lab[r, c]
                    break
                if seen_none[r, c]:
                    break
                path.append((r, c))
                code = int(fdir[r, c])
                if code not in D8_OFFSETS:
                    break
                dr, dc = D8_OFFSETS[code]
                r, c = r + dr, c + dc
                if not (0 <= r < h and 0 <= c < w):
                    break
                if len(path) > h * w:
                    raise RuntimeError("flow-direction cycle detected")
            for pr, pc in path:
                if result:
                    lab[pr, pc] = result
                    done[pr, pc] = True
                else:
                    seen_none[pr, pc] = True
    return lab


def polygons_from_labels(lab: np.ndarray, transform, crs: str) -> gpd.GeoDataFrame:
    """Polygonise basin labels (one row per label, holes kept)."""
    geoms: dict[int, list] = {}
    for geom, val in rasterio.features.shapes(lab, mask=lab > 0, transform=transform):
        geoms.setdefault(int(val), []).append(shape(geom))
    rows = [{"basin_label": k, "geometry": shapely.union_all(v)} for k, v in sorted(geoms.items())]
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=crs)


def _bin(x: float, cuts: list[float]) -> int:
    """Score = number of cut values that x reaches (0..len(cuts))."""
    return int(sum(x >= c for c in cuts))


def score_candidates(cands: gpd.GeoDataFrame, metrics: pd.DataFrame) -> pd.DataFrame:
    """Combine raw metrics into 0-3 scores and a weighted total (max 54).

    Rules (documented in the audit report; all ASSUMED cut-offs):
      drainage            0 no primary/secondary drain; else 1 + (lcc_frac>=0.5) + (density>=1 km/km2)
      rainfall_gauges     KSNDMC gauges inside/within 2 km: 0 none within 5 km, 1 within 5 km,
                          2 >= 1 within 2 km. Capped at 2: 15-min completeness is unverifiable
                          because the time series are not openly available.
      flood_observations  distinct official flood-location clusters inside: 0 / 1 (>=1) / 2 (>=5);
                          3 reserved for >=5 event-tagged observations in >=3 events.
      terrain             3 if no voids and |Cop-SRTM| median abs diff <= 5 m; 2 if <= 10 m; else 1.
      network_size        nodes 20-300 -> 3; 10-19 or 301-600 -> 2; 1-9 or > 600 -> 1; 0 -> 0.
      events              number of curated events with >=1 geocoded observation inside, capped
                          at 1 because no event rainfall time series is openly available.
      independent_evid.   1 if a post-event Sentinel-1 acquisition exists for any event (quality
                          not inspected); imagery/field audits not available -> no higher score.
    """
    m = metrics.copy()
    s = pd.DataFrame({"cand_id": m["cand_id"]})
    has = m["drain_len_km"] > 0
    s["drainage"] = np.where(has, 1 + (m["lcc_frac"] >= 0.5).astype(int) + (m["drain_density_km_per_km2"] >= 1.0).astype(int), 0)
    s["rainfall_gauges"] = np.where(m["gauges_within_2km"] >= 1, 2, np.where(m["gauges_within_5km"] >= 1, 1, 0))
    s["flood_observations"] = [_bin(x, [1, 5]) for x in m["flood_location_clusters"]]
    s["terrain"] = np.where((m["dem_void_cells"] == 0) & (m["cop_srtm_mad_m"] <= 5), 3,
                            np.where(m["cop_srtm_mad_m"] <= 10, 2, 1))
    n = m["n_nodes"]
    s["network_size"] = np.select([(n >= 20) & (n <= 300), ((n >= 10) & (n < 20)) | ((n > 300) & (n <= 600)), n >= 1], [3, 2, 1], 0)
    s["events"] = np.minimum(m["events_with_obs"], 1)
    s["independent_evidence"] = m["s1_post_event_available"].astype(int)
    s["weighted_total"] = sum(s[k] * w for k, w in WEIGHTS.items())
    s["max_possible"] = 3 * sum(WEIGHTS.values())
    return m.merge(s, on="cand_id")
