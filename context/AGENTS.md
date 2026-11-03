# AGENTS.md — Briefing for AI agents and new teammates

> Read this first. Then read the rest of the context in the order given below.

## Reading order

1. `context/AGENTS.md` (this file)
2. `context/project-context.md` — scientific spec (source of truth for principles)
3. `context/team-plan.md` — roles, phases, gates, dashboard spec
4. `context/data-and-contracts.md` — schemas, interfaces, conventions (CRS, units, UTC, enums, manifests)
5. `context/code-standards.md` — layout, tooling, testing, git, PR checklist, language rules
6. `context/reference/technical-specs.md` — per-workstream technical specs (audit, evidence, surface spreading, calibration, counterfactuals, GNN)
7. `context/decisions-and-progress.md` — decision log and current status
8. The module's own `README.md` and tests; `configs/` for thresholds and ranges (never hardcode them)

If `team-plan.md` and `project-context.md` conflict, the spec's *scientific principles* win and the plan's *execution details* win. Raise the conflict in the Decision Log.

## Non-negotiable scientific principles

A pull request that violates one is rejected regardless of code quality.

| # | Principle | In practice |
|---|-----------|-------------|
| P1 | Data availability determines scope | Catchment chosen only after the Phase 1 audit |
| P2 | Never convert assumptions into facts | Every parameter carries a provenance tag (data-and-contracts.md §7.5) |
| P3 | DEM evidence is terrain-scale only | A DEM mismatch means "inconsistent / worth investigating", never "drain does not exist" or "drain is blocked" |
| P4 | No probabilities without calibration | We output an **evidence status**, not "0.64 functional" |
| P5 | SWMM node flooding is not a flood map | An explicit surface-spreading step (technical-specs.md §5.4) is mandatory before any extent/depth comparison |
| P6 | Calibration and validation are separate | At least one event is frozen out of calibration; no peeking |
| P7 | Identifiability is a result | Report which parameters are constrained / weakly constrained / non-identifiable |
| P8 | Fair comparison | Official-network vs reconciled-network models use identical rainfall, calibration procedure, search budget, and validation events |
| P9 | SWMM is the physical reference | Final counterfactual and engineering claims come from SWMM, never from the GNN |
| P10 | GNN must earn its place | It is reported with runtime, error, training cost and break-even count, or it is dropped |
| P11 | Synthetic ≠ historical | Every experiment is tagged class A (unit), B (synthetic) or C (historical); only C supports predictive-performance claims |
| P12 | Do not force one root cause | Interaction analysis is mandatory before naming a dominant factor |
| P13 | "Scenario envelope", not "bounds" | Flood response can be non-monotonic; we never claim guaranteed lower/upper risk |
| P14 | Sentinel-1 only if genuinely usable | Check acquisition timing/quality per event; skip if unsuitable |
| P15 | Prior-art search before novelty claims | Nobody writes "novel" in a report until the literature note exists |
| P16 | Smaller and defensible beats larger and speculative | When in doubt, cut scope, not rigor |

**Claims we must never make:** "DEM proves missing drains"; "we invented GNN flood prediction"; "the model predicts floods in Bengaluru" (it is validated on specific catchments/events only); "this is a digital twin".

## What this project is (and is not)

- It **is** an uncertainty-aware, physics-based urban flood simulation and decision-support framework that audits incomplete drainage maps, simulates with EPA SWMM, validates on historical events (with a held-out event), diagnoses flood mechanisms through counterfactual SWMM runs, and tests a GNN purely as a speed-up surrogate.
- It is **not** a live digital twin, not an ML-first flood predictor, and not a claim that terrain can prove a drain exists or works.

## Hard rules (do not break even if asked casually)

1. Never present an evidence score as a probability.
2. Never state that a DEM comparison proves a drain missing, blocked or non-functional.
3. Never output a flood extent/depth without the surface-spreading step; never call raw SWMM node flooding a "flood map".
4. Never tune on, look at for tuning purposes, or leak held-out events into calibration. Respect `configs/events.yaml`.
5. Never use the GNN for final counterfactual or intervention conclusions; always verify in SWMM.
6. Never label a synthetic experiment as validation; always set `exp_class`.
7. Never invent data, parameter values, citations, station IDs or event records. If a value is missing, mark it `ASSUMED` with a `source_note`, or ask.
8. Never change an interface/schema silently; update `context/data-and-contracts.md` and notify consumers.
9. Never claim novelty or "state of the art". Use neutral language until the prior-art note says otherwise.
10. Do not expand scope (more catchments, 2D coupling, forecasting, U-Net, agentic monitoring) unless the Decision Log explicitly approves it.
11. Never hand-edit generated files (`.inp`, processed layers); change the generator and regenerate.
12. Do not use the global RNG; always seed.

## Working method

- Identify which role/owner the task belongs to; do not edit another role's directory without a PR that tags the owner.
- Prefer the smallest change that satisfies the acceptance criteria; write or update tests first for algorithmic work.
- Keep units SI, CRS EPSG:32643 internally, timestamps in UTC.
- When something is ambiguous (e.g., catchment not yet chosen, parameter source unknown), state your assumption in the PR description and keep it configurable.
- After producing results, output a run manifest and a short "assumptions and limitations" note; use the six report labels from code-standards.md §7.9.
- When reporting numbers, include sample size, ensemble size, and whether the numbers are class A, B or C.
- If asked for something that conflicts with the principles above, explain the conflict and propose a compliant alternative instead of silently complying or silently refusing.

## Module import rules

`common` ← everyone. `geo`, `evidence` (A) ← `common`. `swmm`, `surface`, `calib`, `cf` (B) ← `common`, may read A's outputs via files only. `uncertainty`, `gnn`, `optim` (C) ← `common`, call B only through `run_scenario`. `api` (D) ← `common`, reads results via the run registry. **No circular imports; no module imports from `api`.**
