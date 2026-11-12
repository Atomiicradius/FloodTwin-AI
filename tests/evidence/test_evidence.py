"""Class A unit tests for the evidence engine (synthetic geometry fixtures, not data)."""

import copy

import numpy as np
import pandas as pd
from rasterio.transform import from_origin
from shapely.geometry import LineString

from floodtwin.evidence import indicators as ind
from floodtwin.evidence.scoring import assign_status
from floodtwin.evidence.sensitivity import run_sensitivity
from floodtwin.geo.config import evidence_config
from floodtwin.geo.terrain import upstream_max

TR = from_origin(0, 300, 30, 30)  # 10x10 grid of 30 m cells, origin top-left


def _acc_with_valley():
    acc = np.full((10, 10), 0.01)
    acc[:, 5] = 1.0  # a north-south corridor in column 5 (x = 150..180)
    return acc


def test_terrain_alignment_on_and_off_corridor():
    dist = ind.distance_to_corridor(_acc_with_valley(), 0.25, 30.0)
    on = LineString([(165, 290), (165, 10)])
    off = LineString([(15, 290), (15, 10)])
    v = ind.terrain_alignment([on, off], dist, TR, 45.0, 15.0)
    assert v[0] == 1.0 and v[1] == 0.0


def test_terminal_plausibility_cases():
    acc = _acc_with_valley()
    sink = np.zeros((10, 10)); sink[8, 1] = 2.0
    to_xy = np.array([[165, 150], [45, 45], [255, 45], [255, 45]])
    term = np.array([True, True, True, False])
    edge = np.array([False, False, False, False])
    v = ind.terminal_plausibility(to_xy, term, edge, acc, sink, TR, 0.25, 0.5)
    assert list(v) == [1.0, 1.0, 0.0, 1.0]  # corridor, depression, neither, not-terminal
    edge[2] = True
    assert np.isnan(ind.terminal_plausibility(to_xy, term, edge, acc, sink, TR, 0.25, 0.5)[2])


def test_connectivity_consistency_trace():
    fdir = np.full((10, 10), 4, dtype=int)  # everything flows south (code 4)
    v = ind.connectivity_consistency(np.array([[165, 285], [165, 285]]), np.array([[165, 15], [15, 15]]),
                                     np.array([270.0, 270.0]), fdir, TR, 30.0, 3.0, 60.0)
    assert list(v) == [1.0, 0.0]


def test_upstream_max():
    acc = np.array([[1.0, 1.0], [1.0, 5.0]])
    fdir = np.array([[2, 4], [1, 0]])  # (0,0)->SE, (0,1)->S, (1,0)->E all into (1,1)
    up = upstream_max(acc, fdir)
    assert up[1, 1] == 1.0 and up[0, 0] == 0.0


def _table():
    return pd.DataFrame({
        "link_id": ["a", "b", "c", "d", "e"],
        "hierarchy": ["primary", "secondary", "primary", "tertiary", "primary"],
        "terrain_alignment": [0.9, 0.1, 0.5, 0.9, np.nan],
        "terminal_plausibility": [1.0, 0.0, 0.5, 1.0, np.nan],
        "connectivity_consistency": [1.0, 0.0, 0.5, 1.0, np.nan],
        "historical_count": [0, 2, 0, 0, 0],
    })


def test_status_rule_deterministic_and_conservative():
    cfg = evidence_config()
    a = assign_status(_table(), cfg)
    b = assign_status(_table(), cfg)
    assert list(a["evidence_status"]) == list(b["evidence_status"])
    assert list(a["evidence_status"]) == ["SUPPORTED", "DISPUTED", "UNVERIFIED", "UNVERIFIED", "UNVERIFIED"]
    assert set(a["evidence_status"]) <= {"VERIFIED", "SUPPORTED", "DISPUTED", "UNVERIFIED"}
    assert (a["evidence_score"].dropna().between(0, 1)).all()


def test_disputed_wording_never_claims_absence():
    a = assign_status(_table(), evidence_config())
    note = a.loc[a["evidence_status"] == "DISPUTED", "evidence_notes"].iat[0]
    assert "not proof" in note
    for bad in ("does not exist", "missing drain", "blocked", "probability"):
        assert bad not in note.lower()


def test_verified_needs_observation():
    t = _table()
    t["observation_evidence"] = [np.nan, np.nan, 1.0, np.nan, np.nan]
    assert assign_status(t, evidence_config())["evidence_status"].iat[2] == "VERIFIED"


def test_official_map_flag_removes_supported():
    cfg = copy.deepcopy(evidence_config())
    cfg["status_rule"]["count_official_map_as_source"] = False
    assert "SUPPORTED" not in set(assign_status(_table(), cfg)["evidence_status"])


def test_sensitivity_runs_and_baseline_zero():
    s = run_sensitivity(_table(), evidence_config())
    assert s.loc[s["variant"] == "baseline", "frac_status_changed"].iat[0] == 0.0
    assert len(s) > 5
