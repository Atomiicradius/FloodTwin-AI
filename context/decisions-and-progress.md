# Decisions & Progress

> Anything affecting scientific claims, catchment choice, event split, parameter ranges, schemas or scope goes in the Decision Log. Update the status table weekly.

## Status

| Gate | Due | Status | Notes |
|---|---|---|---|
| Gate 1 — Data go/no-go | End of week 2 | Audit done; criteria NOT met | See reports/01_data_audit.md §5.3 and D-002 (proposed) |
| Gate 2 — Vertical slice works | End of week 5 | Not started | |
| Gate 3 — Validated physical core | End of week 8 | Not started | |
| Gate 4 — GNN verdict | End of week 12 | Not started | |

| Role | Owner | Current focus | Blockers |
|---|---|---|---|
| A — GIS & Data | TBD | Audit, network_v1 + evidence v0 for provisional catchment domlur_a25_b13 | No KSNDMC 15-min series; too few event observations |
| B — Hydraulic Modelling | TBD | | |
| C — ML, Uncertainty & Experiments | TBD | | |
| D — Platform & Dashboard | TBD | | |

## Decision Log

Template:

```
## D-<number>: <short title>   (date, owner)
Context:
Options considered:
Decision:
Reason:
Impact on scope/claims:
Reversible? (Y/N):
```

### D-001: Adopt `context/` folder layout   (2026-11-04, TBD)
Context: The spec and team plan were split into a context/ folder for agent and teammate use.
Options considered: Keep two monolithic files; split by topic.
Decision: Split by topic; UI rules/tokens/registry and library docs deferred until decided.
Reason: Agents can load only what they need; the interface file (data-and-contracts.md) can be guarded separately.
Impact on scope/claims: None.
Reversible? Y

### D-002: Provisional catchment for Phase 2 terrain/network work — PROPOSED by Role A, needs Gate 1 approval   (2026-11-11, Role A)
Context: Phase 1 audit (reports/01_data_audit.md) ranked 75 terrain-defined candidate basins (4/10/25 km² head-area scales) with the technical-specs §5.2 criteria. No candidate meets Gate 1: no openly available KSNDMC 15-min series; at most 2 events with 1 locality-level report each per candidate.
Options considered: (a) stop until data arrive; (b) proceed provisionally on rank 1 for event-independent work only; (c) pick a larger basin to capture more reports (rejected: more nodes, more guessed parameters, P16).
Decision (proposed): (b). domlur_a25_b13 (27.5 km², 66 nodes / 59 links, 13 gauge locations within 2 km, 25 official flood-location clusters, reports for events 20220905 and 20250518, Sentinel-1 S1A pass +12 h after the 2022-09-04/05 night). No calibration, validation or event modelling until Gate 1 passes. Runner-up for fallback: dodda_nekkundi_a25_b12.
Reason: terrain/network/evidence work does not depend on event data; delaying it gains nothing.
Impact on scope/claims: none on claims; Gate 1 remains open. Actions: request KSNDMC series for the four candidate events; extend event curation; inspect 2022-09-05 S1 scene.
Reversible? Y

### D-003: Additive columns in the A → B network contract and observation table — PROPOSED by Role A, needs Role D + B review   (2026-11-11, Role A)
Context: data-and-contracts.md §6.1/§6.4 define minimum columns. Role A outputs extra, additive columns so that evidence stays traceable.
Decision (proposed): links add `direction_basis`, `dz_m`, the six indicator columns, `historical_count`, `terrain_index`, `snap_shift_m`, `source_id`, `src_objectid`; nodes add `degree`, `elev_note`, `node_type_note`; flood_observations keeps timestamp precision in `quality_notes` (`publication_time_upper_bound` / `date_only`). Evidence settings in configs/evidence.yaml: official map counts as a source; terrain decisive for primary+secondary only (both structural; see report §6.3 sensitivity: 56 % / 49 % of statuses depend on them).
Reason: P2 (provenance) and reproducibility. No existing column changes meaning.
Impact on scope/claims: none. Role D to fold into data-and-contracts.md if accepted.
Reversible? Y
