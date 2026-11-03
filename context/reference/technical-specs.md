# Technical Specifications by Workstream

> Owner roles are noted per section. Referenced from `team-plan.md`.

### 5.1 Data audit checklist (Role A, Phase 1)

For each drainage dataset (primary / secondary / tertiary / all-drain):

- [ ] File format, number of features, geometry types (LineString vs MultiLineString)
- [ ] Source CRS (KML is typically EPSG:4326); reprojection target recorded
- [ ] Invalid, empty or zero-length geometries
- [ ] Duplicate / overlapping segments (exact and near-duplicate within tolerance)
- [ ] Endpoint connectivity: number of connected components, dangling ends, gaps below snap tolerance (try 1, 2, 5, 10 m and record sensitivity)
- [ ] Hierarchy/class attribute present? values?
- [ ] **Which hydraulic attributes exist** (diameter, invert, roughness, capacity, flow direction)? Expect none. State this explicitly.
- [ ] Is flow direction encoded? If not, how will direction be inferred (terrain) and flagged as `INFERRED`?
- [ ] Spatial coverage vs candidate catchments; positional accuracy vs imagery (visual spot-check of ≥ 30 segments)
- [ ] Licence and attribution terms

For DEM: resolution, vertical datum, void/sink counts, vertical-accuracy statement if provided. State clearly that a 30 m DEM cannot resolve roadside drains, small culverts or covered drains.

### 5.2 Catchment selection scoring (Role A, go/no-go input)

Score each candidate 0–3 on each criterion (0 = unavailable, 3 = strong). Report raw evidence behind each score.

| Criterion | Weight |
|---|---|
| Drainage network availability and connectivity quality | 3 |
| Rainfall gauge coverage (stations inside/near, 15-min completeness) | 3 |
| Number and quality of historical flood observations | 3 |
| Terrain data quality | 2 |
| Manageable network size (target: tens to a few hundred nodes) | 2 |
| Ability to define ≥ 2 calibration events + ≥ 1 held-out event | 3 |
| Availability of independent evidence (imagery, field/citizen audits, optional Sentinel-1) | 2 |

Flood-proneness is **not** a criterion on its own. Rule: choose a smaller catchment with good evidence over a larger one where parameters would be guessed.

### 5.3 Reconciliation / evidence engine (Role A)

Indicators per segment (each recorded separately, never only the aggregate):

| Indicator | Computation | Meaning |
|---|---|---|
| `terrain_alignment` | Overlap/angle agreement between segment and DEM-derived flow corridor within a buffer | Terrain-scale consistency |
| `terminal_plausibility` | Is the downstream end at a terrain-plausible low point / outfall / larger drain? | Network ends make hydraulic sense |
| `connectivity_consistency` | Does network connectivity respect watershed structure? | Topological consistency |
| `imagery_evidence` | Manual/assisted check on satellite or street imagery | Visible channel / cover / encroachment |
| `observation_evidence` | Verified citizen/field audit, known encroachment | Direct observation |
| `historical_evidence` | Recurrent flooding near the segment in past events | Behavioural hint |

Combine through a **documented, deterministic rule** (weights in `configs/evidence.yaml`) into `evidence_score` ∈ [0, 1] (label this "index", never "probability"), then map to status:

- `VERIFIED`: ≥ 1 sufficiently reliable direct observation, not contradicted
- `SUPPORTED`: ≥ 2 independent sources agree
- `DISPUTED`: sources disagree materially
- `UNVERIFIED`: insufficient independent evidence

Required analyses: (i) sensitivity of status to ±weights and thresholds; (ii) agreement with the verified subset; (iii) classification metrics (precision/recall/F1/confusion matrix) **only** if enough verified labels exist, otherwise report agreement rates and say why.

Terrain evidence is correlated with itself (same DEM). Do not count multiple DEM-derived indicators as independent sources when assigning `SUPPORTED`.

### 5.4 Surface spreading: node flooding → inundation layer (Role B)

SWMM gives flood volume/rate per node, **not** a flood extent. MVP method (document every assumption):

1. For each flooding node, extract flood volume time series and peak/total flooded volume (`pyswmm` node `flooding` / report).
2. Locate the node's cell on the conditioned DEM (document the snapping rule).
3. Spread volume with a **volume-fill / priority-flood** approach: raise a local water level from the node cell outward over hydrologically connected cells until the filled volume equals the SWMM volume; depth = water level − ground elevation.
4. Merge overlapping nodes; handle adjacent depressions explicitly (merge when water level exceeds the spill height).
5. Output: max depth raster, extent mask, per-node depth summary, plus the assumptions used.
6. Report the **resolution limit** (30 m DEM vs street-scale flooding) next to every comparison figure. If evaluation shows the method is inadequate, document why before considering HEC-RAS 2D or LISFLOOD-FP (extension only).

This is a quasi-static approximation (no momentum, no inflow routing across the surface). Say so.

### 5.5 Hydraulic parameter handling (Role B)

`configs/params/ranges.yaml` schema (one entry per parameter group; per-segment overrides allowed):

```yaml
conduit_manning_n:
  unit: "s/m^(1/3)"
  min: 0.013
  max: 0.035
  distribution: uniform
  provenance: ESTIMATED          # MEASURED | DOCUMENTED | ESTIMATED | ASSUMED | INFERRED
  source_note: "Typical range for concrete/masonry drains; cite reference in context/reference/sources.md"
  scope: all_links
```

Rules: ranges are justified in writing; never use a single value where a range is defensible; disputed segments get a separate parameter `status_capacity_factor` (e.g., capacity multiplier range) conditional on evidence status. Connectivity of `DISPUTED` links can itself be a sampled binary variable in uncertainty runs (documented probability **is not** claimed; use equal-weight or scenario-frequency reporting and say so).

### 5.6 Calibration protocol (Role B)

Fixed procedure, written down **before** looking at held-out results:

1. Split events into **calibration set** and **held-out set**. Record the split in `configs/events.yaml` and do not change it after seeing results.
2. Define the objective (e.g., combination of flooded-location F1/critical success index and depth MAE where depth observations exist, plus timing error). Write the formula in the config.
3. Search method: seeded Latin-hypercube/random search with a fixed budget (e.g., N_cal runs), optionally followed by a refinement step. Bayesian calibration is a P2 extension, not a prerequisite.
4. Select an *ensemble of acceptable parameter sets* (not a single "best" set) using a documented acceptance threshold.
5. **Freeze** the parameter ensemble and model version (tag in git + hash in manifest).
6. Evaluate once on held-out events. Do not iterate after viewing held-out results; if a bug is found, document it, fix it, and re-run the whole calibration with the fixed code.
7. **Fair-comparison rule (P8):** run steps 1–6 for the *official-network model* and *reconciled/uncertainty-aware model* with identical rainfall, objective, search budget, events and seeds. Only the drainage representation differs.

### 5.7 Metrics (Role B)

- Flooded/non-flooded classification at observed locations: precision, recall, F1, CSI.
- Extent (where a valid observed extent exists): intersection-over-union.
- Depth (where measured): MAE, RMSE.
- Event timing error (peak or onset), total flooded volume (if measurable).
- Report each metric with its sample size and uncertainty across the accepted parameter ensemble.
- Identifiability table: for each key parameter, classify `STRONGLY_CONSTRAINED`, `WEAKLY_CONSTRAINED` or `NON_IDENTIFIABLE`, with the evidence (posterior-like range narrowing, sensitivity indices, parameter trade-off plots such as rainfall scale vs capacity).

### 5.8 Counterfactual engine (Role B builds, Role C designs interaction layer)

- A **baseline** = reconstructed system under event rainfall (a specific parameter set or ensemble member).
- A **Modification** edits exactly one factor (restore capacity of segment X, reduce blockage by Y, normalize rainfall to reference, change roughness/infiltration, restore a connection).
- Metric: `ΔFlood = Flood_baseline − Flood_counterfactual` for chosen outputs (node flood volume, max depth at the observed flood location, flooded area).
- Run each counterfactual across the accepted ensemble: report the median ΔFlood, interval and the **fraction of scenarios where flooding decreased** (only if computed).
- Watch for non-monotonic effects: restoring upstream capacity can worsen downstream flooding. Always report downstream nodes, not just the target node.
- Interactions: for k ≤ 6 factors use full 2^k factorial; interaction effect = combined effect − sum of single effects. For k > 6 use permutation-based Shapley approximation (Role C).
- The GNN is **never** used to produce the final numbers here.

### 5.9 GNN surrogate and benchmark (Role C)

- **Graph:** nodes = junctions/outfalls/storage (optionally subcatchments); edges = conduits. Topology fixed in v1.
- **Node features:** elevation, contributing area, imperviousness, event rainfall features (total, peak intensity, timing), baseline water level, drainage class, evidence status (one-hot).
- **Edge features:** length, slope, capacity/diameter, roughness, blockage, class, evidence status.
- **Targets:** choose only what SWMM reliably outputs: e.g., total node flood volume, max depth/head, surcharge flag. Start with one or two targets.
- **Data:** SWMM scenarios from the generator, split by *scenario* AND hold out whole rainfall events or parameter regions to test extrapolation. Report learning curves at multiple dataset sizes (e.g., 200 / 1,000 / 5,000).
- **Loss:** `L = L_prediction + λ1·L_physics + λ2·L_constraint`. Only include terms we can justify for the model (examples: non-negativity of flood volume; no flooding at nodes with zero inflow; monotone response to rainfall scaling if empirically verified). Run an ablation without physics terms. Each term gets a one-paragraph justification in the report.
- **Benchmark (mandatory):**
  - `T_SWMM(N) = T_gen_setup + N · T_single_SWMM`
  - `T_GNN(N) = T_training_data + T_training + N · T_inference + T_verification`
  - Report both curves, the break-even `N*` (or "no break-even in tested range"), MAE/RMSE/relative error per target, memory/hardware notes, and agreement on SWMM re-verification of a sampled subset of GNN-screened scenarios.
- **Interventions:** parameter changes only (capacity, roughness, blockage, rainfall). No adding/removing drains or reconnecting topology in v1.
- **Time guard:** the GNN gets a hard time-box. If the physical model is not validated by week 9, GNN work shrinks to the minimal benchmark described in team-plan.md §8.

### 5.10 Optional intervention optimization (Role C)

Only if the team-plan.md §8 gate passes. Objective: maximize expected simulated flood-risk reduction (e.g., total flooded volume at selected locations, averaged over the scenario ensemble) subject to a fixed budget. Actions: restore a blocked segment, increase capacity, reduce blockage. Methods: Bayesian optimization or NSGA-II (MILP if the formulation permits). Costs are assumptions; label them. GNN may screen; **every shortlisted solution is re-evaluated in SWMM**; report robustness across scenarios and sensitivity to cost assumptions.
