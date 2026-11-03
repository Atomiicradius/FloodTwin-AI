# Decisions & Progress

> Anything affecting scientific claims, catchment choice, event split, parameter ranges, schemas or scope goes in the Decision Log. Update the status table weekly.

## Status

| Gate | Due | Status | Notes |
|---|---|---|---|
| Gate 1 — Data go/no-go | End of week 2 | Not started | |
| Gate 2 — Vertical slice works | End of week 5 | Not started | |
| Gate 3 — Validated physical core | End of week 8 | Not started | |
| Gate 4 — GNN verdict | End of week 12 | Not started | |

| Role | Owner | Current focus | Blockers |
|---|---|---|---|
| A — GIS & Data | TBD | | |
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
