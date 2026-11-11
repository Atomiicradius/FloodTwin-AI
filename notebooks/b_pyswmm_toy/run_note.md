# Role B Phase 1 — pyswmm toolchain check (toy model)

**Experiment class:** `A_unit` (unit/toolchain check only; not a validation result)
**Catchment:** none — synthetic toy network, not the shared `tests/fixtures/` pipeline
**Date:** 2026-11-11
**Owner:** Role B

## Model assumption

A five-subcatchment, six-node toy drainage network built only to exercise the SWMM
engine through `pyswmm`. It is not derived from Role A's data and contains no
Bengaluru geometry.

| Item | Value |
|---|---|
| Subcatchments | 5 (S1–S5), total 13.0 ha, 50–75 % impervious |
| Nodes | 5 junctions (J1–J5) + 1 free outfall (O1) |
| Conduits | 5 circular (0.6, 0.8, 0.8, 1.0, 1.2 m), n = 0.014–0.015 |
| Infiltration | Green-Ampt (suction 88.9–166.8 mm, Ksat 1.0–10.9 mm/hr, IMD 0.18–0.30) |
| Routing | DYNWAVE, 10 s routing step, 1 min wet/report step |
| Rainfall | synthetic 30 mm in 30 min (5 mm per 5-min interval), gage G1 |
| Simulation | 2024-06-15 00:00–02:00, no ponding, no evaporation |

The `.inp` is committed as a fixture; it is not a generated model.
Content hash (SHA-256):

```
9d90783fb3087bf59d794a9704c4c925c5b28a3c17e62049a5194c8ad2adf68b
```

## Toolchain

| Component | Version |
|---|---|
| Python | 3.12.7 |
| pyswmm | 2.2.0 |
| SWMM engine | 5.2.4 |
| Platform | Windows 11 (10.0.26300) |

`pyswmm` was installed into a throwaway virtual environment outside the repository;
no environment files are committed.

## Simulation result

Run with:

```
python notebooks/b_pyswmm_toy/run_toy.py
```

Full machine-readable output is in `run_results.json`.

| Check | Value | Threshold | Verdict |
|---|---|---|---|
| Runoff continuity error (`.rpt`) | −0.046 % | \|error\| < 5 % | PASS |
| Flow-routing continuity error (`.rpt`) | −0.008 % | \|error\| < 5 % | PASS |
| Simulated duration | 7,191 s | — | — |

Peak node depths and link flows:

| Node | Peak depth (m) | | Link | Peak flow (m³/s) |
|---|---|---|---|---|
| J1 | 0.476 | | C1 | 0.368 |
| J2 | 0.530 | | C2 | 0.631 |
| J3 | 1.010 | | C3 | 0.894 |
| J4 | 0.608 | | C4 | 1.113 |
| J5 | 0.608 | | C5 | 1.507 |
| O1 | 0.607 | | | |

No node flooded in this event: `node_flood_volume_m3` is 0.0 everywhere. The node
flooding read path was therefore exercised only as a zero check, not as a real
flood-volume extraction.

## Uncertainty

None quantified. This is a single deterministic run with one synthetic hyetograph.
There is no parameter ensemble, no calibration and no comparison with observations.

## Limitation

- Synthetic network and synthetic rainfall: **cannot** support any statement about
  Bengaluru flooding, drain capacity or model skill (P11).
- The toy is a toolchain check only, not the team toy pipeline and not a substitute
  for Role D's `tests/fixtures/` fixture.
- `pyswmm` 2.2.0 `Simulation.runoff_error` and `Simulation.flow_routing_error`
  returned `0.0` when queried after the step loop, while the `.rpt` report gave
  −0.046 % and −0.008 %. The pass/fail check uses the `.rpt` values, which are the
  project's reference measure. This behaviour should be re-checked when the real
  runner is built.
- No surface spreading, no subcatchment delineation, no real rainfall series, no
  network builder: all Phase 2 work.
