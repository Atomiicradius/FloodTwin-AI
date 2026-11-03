# Team Plan — Roles, Phases, Gates, Dashboard

> Living document. Changes go through a pull request and are logged in `decisions-and-progress.md`.
> Related: `project-context.md` (science), `data-and-contracts.md` (interfaces), `code-standards.md` (conventions), `reference/technical-specs.md` (per-workstream specs).

**Timeline assumption:** this plan assumes a **14-week** schedule. No deadline was specified, so scale week numbers proportionally if your real deadline differs. The *order* of phases and the *go/no-go gates* must not change; only durations may.

---

## 1. Project in one page

**Name:** FloodTwin-AI (see the naming caveat below)
**Domain:** SDG 11 — urban flood resilience, Bengaluru as application context.

**Central thesis.** Urban flood predictions are only as reliable as (a) the representation of the drainage infrastructure and (b) the uncertainty in that representation and its parameters. Public drainage maps are incomplete and carry no hydraulic attributes. We:

1. audit those maps against independent evidence (terrain, imagery, observations),
2. represent the remaining uncertainty explicitly as parameter ranges in a physics model (EPA SWMM),
3. validate on historical flood events, including at least one **held-out** event,
4. diagnose flood mechanisms through **counterfactual** simulations,
5. and evaluate a **physics-guided GNN** purely as a *scalable surrogate* for scenario exploration.

**Pipeline:**

```
Data audit → Drainage reconciliation → Uncertainty-aware SWMM → Surface inundation mapping
→ Calibration + held-out validation → Counterfactual diagnosis (+ interactions)
→ GNN scalability benchmark → (optional) intervention optimization → Dashboard
```

**Naming caveat.** The name "FloodTwin-AI" is fine, but in every report, slide and README we describe the system as a *physics-based urban flood simulation and decision-support framework*. It is **not** a live digital twin because it does not assimilate live data or update its state.

**Scope rule.** High-fidelity experiments run on **1–3 data-rich catchments**, not all of Bengaluru. The methodology is reusable; the experiments are small and defensible.

---

## 3. Glossary

| Term | Meaning in this project |
|------|-------------------------|
| **Catchment** | The study area whose drainage network we model |
| **SWMM** | EPA Storm Water Management Model, the 1D drainage simulator (run through `pyswmm`) |
| **Node flooding** | Water leaving the drainage system at a junction when it surcharges |
| **Surface spreading** | Our step that converts node flood volumes into a terrain-based inundation depth/extent layer |
| **Evidence status** | `SUPPORTED`, `DISPUTED`, `UNVERIFIED`, `VERIFIED`, a categorical label per drain segment |
| **Evidence score** | Transparent rule-based number behind the status; **not** a probability |
| **Provenance tag** | `MEASURED`, `DOCUMENTED`, `ESTIMATED`, `ASSUMED`, `INFERRED`, the origin of a parameter value or range |
| **Counterfactual** | A SWMM run with one factor modified relative to baseline; ΔFlood = Flood_baseline − Flood_counterfactual |
| **Scenario envelope** | Spread of outcomes across plausible parameter sets; not a guaranteed bound |
| **Vertical slice** | One catchment + one event + the full pipeline end to end |
| **Held-out event** | A historical event never used during calibration |
| **Surrogate** | The GNN that imitates SWMM outputs for fast screening |
| **Break-even N** | Scenario count above which GNN total cost < direct SWMM total cost |
| **Experiment class** | A = unit test, B = synthetic, C = historical |

---

## 4. Team roles (4 members)

Roles can overlap on tasks, but **each directory and each deliverable has exactly one owner** who is accountable for it. Pairing buddies are listed so nobody is a single point of failure.

### Role A — GIS & Data Lead (Geospatial Data, Terrain and Evidence)

**Mission:** turn raw public data into a trustworthy, versioned, analysis-ready network and evidence layer.

**Owns:** `src/floodtwin/geo/`, `src/floodtwin/evidence/`, `data/`, `data/MANIFEST.yaml`, the data audit report.

**Responsibilities**
1. **Data acquisition and register.** Download DEM candidates, OpenCity/KSRSAC drainage KMLs (primary, secondary, tertiary, all-drain), rainfall station metadata (KSNDMC), historical flood sources. Record every source in `data/MANIFEST.yaml` (URL, date accessed, licence, CRS, SHA-256, notes).
2. **Drainage data audit** (checklist in technical-specs.md §5.1): geometry validity, CRS, hierarchy/class, duplicates and overlaps, missing endpoints, snapping tolerance, which hydraulic attributes actually exist. Output: `reports/01_data_audit.md` plus figures.
3. **Network cleaning and graph construction.** Convert KML lines into a directed graph (nodes, links), snap endpoints with a documented tolerance, remove duplicates, flag dangling ends, never silently delete anything (write removed items to a `rejected` layer with reason codes).
4. **Terrain analysis.** DEM conditioning, D8 / D-infinity flow direction, flow accumulation, watershed delineation, sink analysis, terrain-derived drainage corridors (tools: `pysheds`, `richdem`, `rasterio`, `geopandas`).
5. **Catchment selection.** Score candidates on the criteria in technical-specs.md §5.2; deliver a ranked table and recommendation for the go/no-go meeting.
6. **Drainage reconciliation / evidence engine.** Compute evidence indicators per segment (terrain alignment, terminal-point plausibility, connectivity vs watershed, imagery/field audit flags, historical flooding proximity). Combine them with a documented rule into `evidence_score` and `evidence_status`. Run sensitivity tests on the weights/thresholds. Validate only against whatever verified subset exists; report agreement rates if labels are too few for precision/recall.
7. **Flood observation dataset.** Build the consistent event/location table (data-and-contracts.md §6.4) from KSNDMC, complaints, news, geolocated photos, etc., with a quality flag per record. Check Sentinel-1 acquisition availability and timing per event; record the verdict.
8. **Terrain support for Role B's surface spreading** (DEM tiles, depression maps, flow-connectivity masks).

**Key deliverables**
- Week 2: data audit report + catchment ranking + MANIFEST.
- Week 4: clean network GeoPackage + evidence layer v0 for the vertical-slice catchment.
- Week 8: evidence layer v1 with sensitivity analysis; observation dataset for all calibration and held-out events.

**Definition of done:** every layer loads with the standard loader, passes schema validation, has a documented CRS (data-and-contracts.md §7.4), is reproducible from `make data` using only `data/raw` and the config, and has a short README describing assumptions.

**Not responsible for:** SWMM parameterization, calibration, ML.
**Buddy:** Role B (network handoff), Role D (data → database/API).

---

### Role B — Hydraulic Modelling Lead (SWMM, Calibration, Validation, Counterfactuals)

**Mission:** a defensible, reproducible SWMM model with explicit uncertainty, validated on held-out events, plus the counterfactual engine.

**Owns:** `src/floodtwin/swmm/`, `src/floodtwin/surface/`, `src/floodtwin/calib/`, `src/floodtwin/cf/`, `configs/params/`, the model validation report.

**Responsibilities**
1. **Network → SWMM translation.** Build `.inp` files programmatically from Role A's network (never hand-edit `.inp` files; hand edits are lost on regeneration). Use `swmmio`/`pyswmm` or direct text templating. Version each generated model by content hash.
2. **Parameter ranges.** Maintain `configs/params/ranges.yaml`: for every uncertain parameter (conduit diameter/capacity, invert elevation, Manning roughness, blockage fraction, imperviousness, infiltration, rainfall scaling, outlet conditions) give `min`, `max`, `distribution` (default uniform), `unit`, `provenance`, `source_note`. Where the data justify a range, use it; where not, say `ASSUMED` and justify with a literature/design-guideline reference.
3. **Rainfall pipeline.** Convert KSNDMC 15-min gauge data (and optional IMERG/IMD supplements) into SWMM rainfall time series. Verify station coverage, timestamps (store UTC), missing data, event completeness. Never assume city-average rainfall represents a small catchment.
4. **Subcatchments/runoff.** Delineate with Role A's terrain products, estimate area, slope, imperviousness (ranges), infiltration (ranges).
5. **Surface spreading (technical-specs.md §5.4).** Implement and document the node-flood-volume → inundation depth/extent method. Own its limitations section.
6. **Calibration protocol (technical-specs.md §5.6).** One documented procedure used for **both** the official-network model and the reconciled-network model, same budget.
7. **Held-out validation + metrics** (technical-specs.md §5.7), sensitivity and identifiability analysis for drainage capacity, roughness, infiltration, imperviousness, rainfall scaling.
8. **Counterfactual engine (technical-specs.md §5.8).** Single-factor modifications executed directly in SWMM; ΔFlood reporting.
9. **Hydraulic sanity checks:** continuity error from SWMM report must be below the project threshold (default |continuity error| < 5% for runoff and flow routing; flag and investigate otherwise).

**Key deliverables**
- Week 5: vertical-slice SWMM model, one event, flood representation, comparison with observations, ≥ 2 counterfactuals.
- Week 8: calibrated and frozen models (official vs reconciled), held-out results, identifiability table.
- Week 10: counterfactual engine v1 with interaction runs.

**Definition of done:** `python -m floodtwin.swmm.run --scenario <spec.yaml>` reproduces a result bit-for-bit given the same seed and inputs; model file hash and parameter set are recorded in the run manifest; continuity errors logged.

**Not responsible for:** raw data cleaning, GNN training, dashboard.
**Buddy:** Role A (network handoff), Role C (scenario execution API).

---

### Role C — ML, Uncertainty & Experiments Lead

**Mission:** uncertainty propagation, interaction analysis, the GNN scalability experiment, and (optionally) intervention optimization, without letting any of it compromise the physical core.

**Owns:** `src/floodtwin/uncertainty/`, `src/floodtwin/gnn/`, `src/floodtwin/optim/`, `experiments/`, the benchmark report.

**Responsibilities**
1. **Scenario generator.** Sample from `ranges.yaml` using Latin hypercube or Sobol sequences (seeded). Emit `ScenarioSpec` files (data-and-contracts.md §6.2). Start building and testing this in **week 3** on a *toy* network (clearly labelled class A/B) so it is ready when the real model arrives.
2. **Uncertainty propagation.** Run ensembles via Role B's runner; compute median, interval (e.g., 5–95%), scenario frequency of flooding per node, sensitive locations, and "robust vs uncertain" conclusions. Terminology: *scenario envelope*, never guaranteed bounds. Test monotonicity explicitly instead of assuming it.
3. **Sensitivity support:** global sensitivity (e.g., Sobol indices or Morris screening via `SALib`) in collaboration with Role B.
4. **Interaction analysis.** For k ≤ 6 factors, run the full 2^k factorial directly in SWMM; compute individual, combined and interaction effects (combined − sum of individual). For k > 6, approximate Shapley-style attribution via permutation sampling.
5. **GNN surrogate (technical-specs.md §5.9).** Fixed topology; PyTorch Geometric; physics-guided loss with only *justifiable* physics terms; benchmark with the break-even formulation.
6. **Optional optimization (technical-specs.md §5.10)** under a fixed budget, only if the P0 + P1 gate in team-plan.md §8 is passed. Final candidates always re-evaluated in SWMM.
7. **Experiment tracking:** every run writes a manifest (data-and-contracts.md §7.6). Maintain `experiments/README.md` indexing experiments by class (A/B/C).

**Key deliverables**
- Week 6: scenario generator + ensemble runner validated on toy and vertical-slice models.
- Week 10: uncertainty and interaction results for the real catchment.
- Week 12: GNN benchmark report with break-even N and error metrics.

**Definition of done:** an experiment is done when it can be re-run from a single config file, logs seeds and versions, and writes metrics + figures to `results/<exp_id>/`.

**Not responsible for:** GIS cleaning, building the SWMM model itself, frontend.
**Buddy:** Role B (SWMM runs), Role D (benchmark/API/dashboard).

---

### Role D — Platform, Backend & Dashboard Lead

**Mission:** make everything reproducible, integrated and presentable; keep the shared data/model specification consistent; build the investigation dashboard around the killer demonstration.

**Owns:** repo scaffolding, CI, `src/floodtwin/common/`, `src/floodtwin/api/`, `web/`, `Makefile`, `docker/`, release tagging, `context/`.

**Responsibilities**
1. **Repository and tooling (week 1):** repo layout (code-standards.md §7.1), `pyproject.toml`, pinned environment, pre-commit hooks (ruff, black, mypy), pytest, GitHub Actions CI, PR templates, issue labels.
2. **Common library:** schemas (`pydantic`), CRS and unit helpers, standard loaders/writers, provenance and manifest utilities, logging config, seeding utility. Roles A–C *import* these; they do not reinvent them.
3. **Data/model contract guardian:** reviews every schema change; maintains `context/data-and-contracts.md`; runs `make validate` checks on handoff artifacts.
4. **Simulation orchestration:** job runner (multiprocessing or a simple queue) for ensembles and GNN training data; run registry (SQLite first; PostgreSQL/PostGIS only if the vertical slice shows it is needed).
5. **API (FastAPI):** endpoints for catchments, drain segments + evidence, observations, rainfall events, runs, counterfactual comparisons, uncertainty summaries, GNN benchmark. Read results from the run registry; never recompute physics inside the API.
6. **Dashboard (React/Next.js + Leaflet or Mapbox GL):** layers listed in team-plan.md §9; the investigation flow (team-plan.md §9.2). Start a skeleton in week 3 against fixture data; swap in real outputs as they arrive.
7. **Reproducibility audit:** every 2 weeks, clone the repo fresh, run `make all` on the toy example, report breakage.
8. **Final report assembly:** compiles the "observed facts / model assumptions / inferred evidence / simulation results / uncertainty / limitations" structure from each owner's reports.

**Key deliverables**
- Week 1: repo + CI + common library v0.
- Week 4: API v0 + dashboard skeleton with fixture data.
- Week 12: dashboard showing the full killer demo with real outputs.

**Definition of done:** a new teammate can go from `git clone` to a running toy pipeline and dashboard by following the README in under 30 minutes.

**Not responsible for:** scientific parameter choices (consult B), evidence rules (consult A), model design (consult C).
**Buddy:** Role C (benchmark/API), Role A (data → DB).

---

### Responsibility matrix (R = responsible/owner, S = support, C = consulted)

| Activity | A | B | C | D |
|---|---|---|---|---|
| Data audit and catchment ranking | **R** | C | C | S |
| DEM / terrain flow analysis | **R** | C | | |
| Reconciliation / evidence status | **R** | C | S | |
| Flood observation dataset | **R** | C | | S |
| SWMM model construction | S | **R** | | |
| Parameter ranges | C | **R** | C | |
| Rainfall pipeline | S | **R** | | |
| Surface spreading | S | **R** | | |
| Calibration and held-out validation | | **R** | S | |
| Sensitivity / identifiability | | **R** | S | |
| Uncertainty ensembles | | S | **R** | S |
| Counterfactual engine | | **R** | S | |
| Interaction / Shapley analysis | | S | **R** | |
| GNN surrogate and benchmark | | C | **R** | S |
| Intervention optimization (opt.) | | C | **R** | |
| Repo, CI, common library | | | | **R** |
| API and dashboard | C | C | C | **R** |
| Final report assembly | S | S | S | **R** |

---

## 8. Phased implementation plan (14 weeks)

### Gate definitions

- **Gate 1 (end of week 2) — Data go/no-go.** Choose the catchment only if: a usable drainage network exists; ≥ 1 rainfall station with usable 15-min data nearby; ≥ 3 historical flood events with ≥ 5 geolocated observations each (≥ 2 calibration + 1 held-out); DEM usable. If none qualifies: widen the candidate list or switch to the best-available alternative **before** modelling. Record the choice in `context/decisions-and-progress.md`.
- **Gate 2 (end of week 5) — Vertical slice works.** One event runs end to end and produces a comparison with observations (even if it is poor). If the data → model link fails, fix it before anything else.
- **Gate 3 (end of week 8) — Validated physical core.** Calibrated + frozen model and held-out results exist, identifiability table drafted. Failing this gate means weeks 9+ are spent repairing the core, not extending it.
- **Gate 4 (end of week 12) — GNN verdict.** Benchmark report exists with an honest conclusion (including "no break-even in tested range" if that is the result).

### Phase 1 — Data audit (weeks 1–2)

| Role | Tasks |
|---|---|
| A | Download DEM(s), KML drainage datasets; run audit checklist (5.1); compile candidate catchments; list KSNDMC stations; start event/observation compilation; check Sentinel-1 availability and timing for candidate events; catchment scoring (5.2) |
| B | Review audit outputs for hydraulic feasibility; draft parameter-range schema and source list; collect literature values for Manning n, infiltration, imperviousness; learn/verify `pyswmm` toolchain on a toy model |
| C | Design scenario-spec format with B; implement seeded LHS/Sobol generator on toy network; scaffold experiment-manifest utilities with D; start prior-art literature note (terrain-informed drainage auditing, uncertainty propagation, counterfactual flood diagnosis, GNN flood surrogates) |
| D | Repo scaffold, CI, pre-commit, common library v0 (CRS, units, manifest, seeds, schema validators), toy fixture, `make` targets, `context/data-and-contracts.md` v0 |

**Deliverables:** audit report, catchment ranking, MANIFEST, repo + CI, toy pipeline. **Gate 1 meeting** at end of week 2.

### Phase 2 — Vertical slice (weeks 3–5)

| Role | Tasks |
|---|---|
| A | Clean network for chosen catchment → `network_v1.gpkg`; DEM conditioning, flow direction/accumulation, watershed; first evidence indicators (terrain_alignment, terminal_plausibility); reconcile a subset of segments |
| B | Network → SWMM builder; subcatchments; rainfall series for one event; run SWMM; implement surface spreading v1; compare with observations; run 1–2 counterfactuals |
| C | Ensemble runner on toy and then real model (small N); toy-network GNN data-generation dry run to estimate SWMM cost per run; draft benchmark harness (timers, cost accounting) |
| D | API v0 (catchments, segments, observations), dashboard skeleton (map + layers with fixture data), run registry (SQLite) |

**Deliverable:** `reports/02_vertical_slice.md` containing the full chain for one event. **Gate 2.**

### Phase 3 — Calibration and validation (weeks 6–8)

| Role | Tasks |
|---|---|
| A | Evidence layer v1 incl. imagery/field/historical indicators; sensitivity analysis of scoring; finalize observation dataset for all events; verify Sentinel-1 usability per event (use only where valid) |
| B | Define param ranges (v1); implement calibration protocol (5.6) for both **official** and **reconciled** networks; freeze (git tag `model-v1`); held-out evaluation; sensitivity/identifiability analysis (5.7) |
| C | Global sensitivity (Sobol/Morris) with B; ensemble acceptance and envelope summaries; test non-monotonic behaviour; keep generator and runner efficient (parallelism) |
| D | API for runs and metrics; dashboard: observation + rainfall + simulated flooding views; CI regression test comparing frozen-model outputs to stored baseline |

**Deliverable:** `reports/03_calibration_validation.md` (fair-comparison results, held-out metrics, identifiability). **Gate 3.**

### Phase 4 — Counterfactual diagnosis and uncertainty (weeks 9–10)

| Role | Tasks |
|---|---|
| A | Provide the list of disputed/unverified segments and relevant candidate factors; sanity check physical meaning of modifications |
| B | Counterfactual engine v1 (single-factor), ΔFlood outputs, downstream-effect checks; verify key conclusions in SWMM across the ensemble |
| C | Factor set definition with B; full 2^k factorial (k ≤ 6) and interaction effects; Shapley approximation if needed; summary statistics (median ΔFlood, fraction of scenarios improved, only if computed) |
| D | Dashboard: counterfactual controls, ΔFlood display, additive vs interaction visualization, uncertainty visualization |

**Deliverable:** `reports/04_counterfactuals.md`.

### Phase 5 — GNN scalability experiment (weeks 10–12)

| Role | Tasks |
|---|---|
| A | Provide node/edge features for the final graph (elevation, area, class, evidence status); QA that the graph matches the SWMM model |
| B | Provide large-scale SWMM scenario generation support; verify GNN-screened scenarios in SWMM |
| C | Generate dataset; train baseline GNN (without physics terms) then physics-guided version; ablations; learning curves; benchmark with full cost accounting; compute break-even N; verification subset |
| D | Parallel job runner for dataset generation; benchmark panel in dashboard; timing instrumentation sanity check |

**Deliverable:** `reports/05_gnn_benchmark.md`. **Gate 4.**

**Minimum GNN fallback** (if behind schedule): one target, one architecture, three dataset sizes, measured T_SWMM and T_inference, MAE/RMSE, break-even statement.

### Phase 6 — Optional optimization (week 12–13, only if Gates 1–3 passed on time and Phase 4 is complete)

C defines candidates, costs (as labelled assumptions) and the optimizer; B verifies shortlisted solutions in SWMM; D adds the scenario viewer. If not on schedule, **skip this phase entirely**.

### Phase 7 — Dashboard, final evaluation, report (weeks 13–14)

- D integrates the "killer demonstration" flow (team-plan.md §9.2) with real outputs; the whole team rehearses it.
- All roles finalize their report sections using the six labels from code-standards.md §7.9.
- Run the prior-art note to completion; calibrate novelty wording to what the literature search shows.
- Final reproducibility check from a fresh clone; tag `report-v1`.

### Protect vs cut (if time is short)

**Must retain:** drainage data audit; terrain-based evidence reconciliation; uncertainty-aware SWMM; historical calibration; held-out validation; counterfactual analysis.
**Reduce first:** number of catchments/events, dashboard polish, Bayesian machinery, optimization.
**Drop first:** agentic monitoring, rainfall forecasting, U-Net/SAR segmentation, full 2D coupling, large GNN architecture sweeps.

---

---

## 9. Dashboard specification (Role D)

### 9.1 Layers

Catchment boundary · official drainage network · terrain-derived flow/accumulation · reconciliation status (colour by evidence status) · uncertainty/confidence · historical flood observations · rainfall · simulated flood output (depth/extent, with ensemble median and spread) · counterfactual results · intervention scenarios (if built) · GNN benchmark panel.

### 9.2 The "killer demonstration" flow (build the UI around this)

1. **Select a historical flood location** → show date/time, rainfall, catchment, terrain, relevant drain segments.
2. **Infrastructure evidence** for the relevant segment: official geometry, terrain evidence, imagery/observation evidence, evidence status and uncertainty.
3. **Baseline simulation**: simulated node flooding/depth vs observations (with the resolution caveat visible).
4. **Counterfactual**: "What if this disputed/blocked segment had its assumed capacity restored?" → new depth/volume and difference from baseline.
5. **Interactions**: additive vs interacting effects of rainfall, blockage, capacity, etc.
6. **Uncertainty**: statements such as "reduces simulated flooding in X% of scenarios; median reduction Y" **only when computed**.
7. **AI scalability**: SWMM runtime, GNN inference time, error, training cost, break-even N.

The dashboard is a visualization layer, not the research contribution. UI rules: show experiment class badge, provenance tags, and a "limitations" drawer for every view; never display a single number without its uncertainty where an ensemble exists.

### 9.3 API principles

Read-only over the run registry; responses include `exp_class`, `run_id`, `model_version`, `network_version`. GeoJSON in EPSG:4326, rasters served as tiles or PNG overlays with a documented colour scale.

---

---

## 10. Communication and project management

- **Weekly (60 min):** progress against the phase plan, gate status, blockers, decisions needed. Each role prepares a 3-line status: *done / next / risk*.
- **Twice-weekly 15-min sync** during phases 2–3 (handoff-critical).
- **Handoff protocol:** the producer posts the artifact path, version, a one-paragraph summary, known issues; the consumer confirms within 2 working days that it loads and validates. Handoffs are not complete until confirmed.
- **Decision Log (`context/decisions-and-progress.md`):** date, decision, alternatives considered, reason, owner, impact on scope. Anything affecting scientific claims, catchment choice, event split, ranges, schema, or scope goes here.
- **Issue tracking:** GitHub issues labelled by role (`role:A`…), phase (`phase:2`) and `blocker`. Each issue has an owner and acceptance criteria.
- **Risk review (weekly):** review the failure-mode table (team-plan.md §11).
- **Authorship/credit:** each role's reports carry the owner's name; the shared final report lists all contributors.

---

---

## 11. Failure modes and safeguards

| Failure mode | Safeguard (owner) |
|---|---|
| DEM treated as proof of drain absence | Wording rules, evidence categories, review of every figure caption (A, D) |
| False numerical probabilities | Evidence index only; schema field named `evidence_score`; no calibration claims (A) |
| KML assumed to contain hydraulic attributes | Audit checklist first (A) |
| SWMM output called a flood map | Surface-spreading step mandatory in code path for extent/depth outputs (B) |
| Model fits only calibration events | Frozen tag + held-out evaluation once (B) |
| Parameters treated as uniquely identified | Identifiability table required in report (B, C) |
| Unequal calibration freedom between models | Same config template and budget; checked in PR (B) |
| Sentinel-1 forced onto unsuitable event | Per-event verdict recorded in observation notes (A) |
| GNN without justification | Benchmark with break-even; time-box; fallback plan (C) |
| GNN used for causal conclusions | Counterfactual module only calls SWMM (B, C) |
| Topology changes sneak into interventions | Fixed-graph assertion in scenario validator (C, D) |
| Monotonicity assumed | Explicit monotonicity test; "scenario envelope" wording (C) |
| Synthetic results presented as validation | `exp_class` tag on every result; dashboard badge (D) |
| Single root cause forced | Interaction analysis required before any "dominant factor" statement (C) |
| Full Bengaluru scope creep | Scope rule enforced at Gate 1 (all) |
| Dashboard becomes the project | Dashboard effort capped; core science milestones come first (D) |
| Silent CRS/unit/time-zone errors | Loader assertions, SI-only rule, UTC storage (D, all) |
| Data-link failure discovered late | Vertical slice before everything else (all) |
| Bus-factor risk | Buddy pairs; docs for every module; fresh-clone audits (D) |

---

## Appendix A — Week-by-week checklist (compact)

| Week | A | B | C | D |
|---|---|---|---|---|
| 1 | Download data, start audit | Toolchain, range schema | Spec format, generator design | Repo, CI, common v0 |
| 2 | Audit report, catchment ranking | Literature ranges | Toy generator, lit note start | Contracts v0, toy fixture; **Gate 1** |
| 3 | Clean network, DEM conditioning | SWMM builder | Ensemble runner (toy) | API v0, dashboard skeleton |
| 4 | Flow direction/accumulation, evidence v0 | Subcatchments, rainfall | Cost-timing harness | Run registry |
| 5 | Reconcile subset, observation set (1 event) | Run, surface spreading, compare, 1–2 CFs | Benchmark harness draft | Slice demo view; **Gate 2** |
| 6 | Evidence v1 indicators | Ranges v1, calibration code | Sensitivity design | Metrics API |
| 7 | Sensitivity of scoring | Calibrate official + reconciled | Ensemble summaries | Observation/rainfall views |
| 8 | Final observations, S1 verdicts | Freeze, held-out, identifiability | Monotonicity tests | Regression CI; **Gate 3** |
| 9 | Candidate factor list | CF engine v1 | Factorial design | CF UI |
| 10 | QA of modifications | Ensemble CFs, verification | Interactions/Shapley | Uncertainty UI |
| 11 | Graph features QA | Scenario support | GNN train, ablations | Job runner, benchmark panel |
| 12 | — | Verify GNN-screened scenarios | Break-even, report; **Gate 4** | Full demo integration |
| 13 | Final evidence figures | Final model report | (Optional optimization) | Polish, limitations drawers |
| 14 | Report sections | Report sections | Report sections | Final report assembly, fresh-clone check |

## Appendix B — Research questions mapped to owners

| RQ | Question (short) | Primary owner | Supporting |
|---|---|---|---|
| RQ1 | Can terrain/observations reveal inconsistencies in drainage maps? | A | B |
| RQ2 | How does representing drainage uncertainty change simulated flooding? | B | C |
| RQ3 | Can the model reproduce historical events, incl. held-out? | B | A |
| RQ4 | Which factors change flooding most at an observed location? | B | C |
| RQ5 | Do factor interactions differ from the sum of single effects? | C | B |
| RQ6 | At what scenario count does the GNN beat direct SWMM? | C | D |
| RQ7 | Best budget-constrained interventions (optional) | C | B |
