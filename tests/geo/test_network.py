"""Class A unit tests for floodtwin.geo.network (tiny geometric fixtures, not data)."""

import geopandas as gpd
import numpy as np
from shapely.geometry import LineString, MultiLineString

from floodtwin.geo import network as nw

CRS = "EPSG:32643"


def _segs(lines, hier="secondary"):
    return gpd.GeoDataFrame({
        "seg_id": [f"S{i}_0" for i in range(len(lines))], "hierarchy": hier, "source_id": "t",
        "src_objectid": [str(i) for i in range(len(lines))], "part": 0,
        "length_m": [g.length for g in lines]}, geometry=lines, crs=CRS)


def test_load_drainage_explodes_multilines_with_stable_ids():
    raw = gpd.GeoDataFrame({"kml_index": [0], "OBJECTID": ["7"]},
                           geometry=[MultiLineString([[(77.5, 12.9), (77.51, 12.9)], [(77.52, 12.9), (77.53, 12.9)]])],
                           crs="EPSG:4326")
    s = nw.load_drainage(raw, "primary", "src", CRS)
    assert list(s["seg_id"]) == ["P7_0", "P7_1"]
    assert (s["length_m"] > 1000).all()


def test_exact_and_reversed_duplicates_rejected_not_deleted():
    a = LineString([(0, 0), (100, 0)])
    segs = _segs([a, a.reverse(), LineString([(0, 50), (100, 50)])])
    keep, rej = nw.flag_duplicates(segs, 5.0, 0.8)
    assert len(keep) == 2 and len(rej) == 1
    assert rej["reason_code"].iat[0] == "DUPLICATE_EXACT"


def test_near_duplicate_detected():
    segs = _segs([LineString([(0, 0), (100, 0)]), LineString([(0, 2), (100, 2)])])
    keep, rej = nw.flag_duplicates(segs, 5.0, 0.8)
    assert list(rej["reason_code"]) == ["DUPLICATE_NEAR"]


def test_t_junction_split_and_snap_connects_network():
    main = LineString([(0, 0), (200, 0)])
    branch = LineString([(100, 80), (100, 3)])  # ends 3 m from the main line's interior
    net, counts = nw.build_network(_segs([main, branch]), 5.0, 1.0, 5.0, 0.8)
    assert counts["t_junction_splits"] == 1
    st = nw.connectivity_stats(net)
    assert st["n_components"] == 1 and st["n_junction_nodes"] == 1 and len(net.links) == 3


def test_gap_larger_than_tolerance_stays_disconnected():
    net, _ = nw.build_network(_segs([LineString([(0, 0), (100, 0)]), LineString([(108, 0), (200, 0)])]), 5.0, 1.0, 5.0, 0.8)
    assert nw.connectivity_stats(net)["n_components"] == 2


def test_snap_ids_deterministic():
    lines = [LineString([(0, 0), (100, 0)]), LineString([(100.5, 0), (200, 0)])]
    a, _ = nw.build_network(_segs(lines), 2.0, 1.0, 5.0, 0.8)
    b, _ = nw.build_network(_segs(lines), 2.0, 1.0, 5.0, 0.8)
    assert list(a.nodes["node_id"]) == list(b.nodes["node_id"])
    assert a.links["snap_shift_m"].max() <= 0.5


def test_orient_links_by_elevation_then_area():
    segs = _segs([LineString([(0, 0), (100, 0)]), LineString([(0, 10), (100, 10)])])
    segs["from_node"], segs["to_node"] = ["A", "C"], ["B", "D"]
    out = nw.orient_links(segs, np.array([10.0, 5.0]), np.array([20.0, 5.2]),
                          np.array([0.1, 2.0]), np.array([0.5, 1.0]), min_drop_m=1.0)
    # link 0: from-end lower -> flipped; link 1: dz < 1 m -> by area, from-end larger -> flipped
    assert list(out["from_node"]) == ["B", "D"]
    assert list(out["direction_basis"]) == ["dem_elevation_drop", "upstream_area"]
    assert (out["direction_provenance"] == "INFERRED").all()
    assert out.geometry.iat[0].coords[0] == (100.0, 0.0)
