# floodtwin.evidence — drainage reconciliation engine (Role A)

Rule and thresholds: `configs/evidence.yaml` (cross-role review required to change).

**`evidence_score` is an index, not a probability.** No calibration has been done, and the
verified label set is empty, so no precision/recall can be reported.

## Indicators (per link, stored separately)
| Indicator | Group | Value |
|---|---|---|
| `terrain_alignment` | terrain | share of the link within 45 m of a D8 corridor (area ≥ 0.25 km²) |
| `terminal_plausibility` | terrain | 1 if downstream end continues, or ends on a corridor / in a depression ≥ 0.5 m; 0 otherwise; NaN near network-extent edge |
| `connectivity_consistency` | terrain | 1 if terrain flow traced from the upstream end reaches the downstream end |
| `historical_evidence` | historical | official flood-location records within 250 m (behavioural hint, weight 0) |
| `imagery_evidence` | imagery | **not assessed** (NaN) |
| `observation_evidence` | observation | **none available** (NaN) |

All terrain indicators come from one DEM and count as **one** source.

## Status rule
- `SUPPORTED`: official map + terrain agree (terrain_index ≥ 0.6), nothing disagrees.
- `DISPUTED`: terrain_index ≤ 0.3, i.e. a terrain-scale inconsistency worth investigating. It is **not** proof that a drain is missing, blocked or non-functional.
- `UNVERIFIED`: anything else, including all tertiary drains (below 30 m DEM resolution).
- `VERIFIED`: only from a reliable direct observation. There are none yet.

Sensitivity: `sensitivity.py` does a one-at-a-time sweep over weights (±20 %), thresholds (±0.1), the official-map flag, the tertiary rule, corridor buffer (30/45/60 m) and stream threshold (0.1/0.25/1 km²).
