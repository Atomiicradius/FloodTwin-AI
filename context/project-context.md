# FloodTwin-AI — Project Context (Scientific Source of Truth)

> Scientific principles in this file win over execution details in `team-plan.md`. Conflicts go in `decisions-and-progress.md`.

## 1. Project identity

**Working name:** FloodTwin-AI  
**Recommended technical description:** Physics-based urban flood simulation and decision-support framework  
**Primary domain:** SDG 11 — Sustainable Cities and Communities  
**Target SDG themes:** Urban flood resilience, disaster-risk reduction, resilient infrastructure, evidence-based urban planning

> **Important framing:** “FloodTwin-AI” can remain the project name, but the system should not be presented as a true live digital twin unless it eventually includes live-data assimilation and state updating. The technically safer description is a physics-based urban flood model / decision-support framework.

---

## 2. Central thesis

Urban flood predictions are only as reliable as the representation of both:

1. the **physical drainage infrastructure**, and
2. the **uncertainty in that representation and its parameters**.

FloodTwin-AI investigates whether incomplete municipal drainage records can be systematically cross-checked using terrain and observational evidence, represented as uncertainty inside a physics-based drainage model, and then used for counterfactual diagnosis of flood mechanisms.

A machine-learning component is added only where it provides a measurable computational benefit: a physics-guided graph neural network (GNN) is evaluated as a surrogate for large-scale scenario exploration rather than being treated as the source of physical truth.

### Core pipeline

**Infrastructure evidence audit → drainage reconciliation → uncertainty-aware SWMM → held-out event validation → counterfactual diagnosis → GNN scalability experiment → optional intervention optimization → decision dashboard**

---

# 3. Problem statement

Bengaluru has a complex urban drainage system containing natural terrain-driven flow paths, engineered stormwater drains, culverts, covered channels and modified urban surfaces. Public drainage datasets may provide useful network geometry, but they should not automatically be treated as a complete or hydraulically authoritative representation of the real system.

At the same time, urban flood events are driven by interacting factors:

- rainfall intensity and spatial distribution,
- terrain,
- drainage connectivity,
- drain capacity,
- roughness,
- blockage/encroachment,
- imperviousness,
- infiltration,
- downstream conditions,
- and uncertainty in the available data.

The project therefore asks:

> **Can incomplete drainage information be reconciled with independent physical and observational evidence, propagated as uncertainty through a hydraulic model, and used to explain which infrastructure factors contribute to observed flooding?**

The goal is **not** to claim that terrain can prove whether an engineered drain exists or works. Terrain is one evidence source among several.

---

# 4. Research questions

### RQ1 — Infrastructure reconstruction
Can terrain-derived evidence and other observations identify inconsistencies or uncertainty in publicly available drainage maps?

### RQ2 — Hydraulic reliability
How does representing drainage uncertainty affect simulated flood behaviour compared with using a single deterministic drainage network?

### RQ3 — Historical validation
Can the resulting model reproduce observed flood behaviour on historical events, including at least one event held out from calibration?

### RQ4 — Counterfactual diagnosis
For an observed flood location, which factors produce the largest change in simulated flooding when modified independently?

### RQ5 — Interaction effects
When multiple factors interact, do their combined effects differ substantially from the sum of their individual effects?

### RQ6 — Computational scalability
At what scenario volume does a physics-guided GNN surrogate become computationally useful compared with running SWMM directly?

### Optional RQ7 — Intervention planning
Under a fixed intervention budget, which combinations of parameter changes provide the greatest simulated flood-risk reduction?

---

# 5. Scope

## Recommended scope

Do **not** attempt high-resolution hydraulic modelling of all Bengaluru.

Use Bengaluru as the application context and develop a reusable methodology, but perform the high-fidelity experiments on **1–3 representative catchments**.

The catchment should be selected primarily based on:

- availability of drainage data,
- rainfall observations,
- historical flood observations,
- usable terrain data,
- manageable network size,
- and availability of enough information for calibration/validation.

Flood-proneness alone should not determine the study area.

---

# 6. Evidence philosophy

The project must explicitly distinguish between different types of evidence.

## 6.1 Terrain evidence

A DEM can reveal:

- broad flow directions,
- depressions,
- accumulation corridors,
- watershed boundaries,
- terrain-scale drainage structure.

However, a 30 m DEM generally cannot reliably resolve:

- individual roadside drains,
- small culverts,
- covered drains,
- narrow channels,
- recent engineered modifications,
- or individual blockages.

Therefore:

> **DEM disagreement with an official drain is evidence of a terrain/network inconsistency, not proof that the drain is nonexistent or nonfunctional.**

Terrain should be used to generate independent evidence and identify locations worth further investigation.

---

## 6.2 Official drainage evidence

Public drainage data should be treated as a valuable but potentially incomplete infrastructure record.

Current OpenCity resources include Bengaluru primary, secondary, tertiary and all-drain KML datasets sourced from KSRSAC.

Before modelling, the team must audit:

- geometry,
- hierarchy/class,
- connectivity,
- available attributes,
- coordinate system,
- duplicate/overlapping segments,
- missing endpoints,
- and whether hydraulic properties are actually provided.

Do **not** assume that a line in a KML contains diameter, invert level, roughness or hydraulic capacity.

If these attributes are unavailable, the hydraulic network is a **conceptually parameterized model**, with estimated/assumed attributes represented by ranges.

---

## 6.3 Citizen/field observations

Citizen drain-condition information, known encroachment cases, flood complaints and other verified observations can provide labels for validating the reconciliation system.

These observations should be used wherever available rather than assigning arbitrary probability values.

---

## 6.4 Historical flood observations

Possible sources include:

- KSNDMC records,
- flood-vulnerable-area information,
- citizen reports,
- municipal complaints/helplines,
- traffic disruption records,
- credible news reports,
- geolocated photographs,
- other timestamped observations.

Historical observations should be converted into a consistent event/location dataset where possible.

---

## 6.5 Sentinel-1 SAR

Sentinel-1 may provide an independent flood-observation layer, but it is **not guaranteed to work well for Bengaluru pluvial flooding**.

Potential limitations include:

- 10 m spatial resolution,
- short-lived street flooding,
- shallow water,
- double-bounce behaviour in built-up areas,
- layover/shadow,
- and acquisition timing relative to the rainfall/flood event.

For every candidate event:

1. check whether a suitable Sentinel-1 acquisition exists,
2. check acquisition timing relative to the event,
3. inspect image quality and urban artefacts,
4. only use the event for SAR validation if the evidence is genuinely useful.

If no suitable acquisition exists, do not force Sentinel-1 into the validation pipeline.

---

# 7. Drainage reconciliation

The reconciliation stage should produce an **evidence status/confidence index**, not an uncalibrated probability such as “0.64 functional.”

Unless ground-truth labels are sufficient to calibrate probabilities, avoid presenting arbitrary numerical probabilities as statistically meaningful.

## Suggested evidence categories

Each drainage segment can be classified as:

- **Supported** — multiple independent evidence sources agree.
- **Disputed** — evidence sources disagree materially.
- **Unverified** — insufficient independent evidence.
- **Observed/verified** — supported by a sufficiently reliable direct observation.

The exact labels can be adjusted during implementation.

## Evidence sources may include

- official drainage geometry,
- DEM-derived terrain flow,
- satellite imagery,
- street-level imagery where available,
- citizen/field audits,
- historical flood behaviour,
- connectivity analysis,
- known encroachment/land-use information.

## Structured scoring

A score can combine evidence sources using a transparent rule:

`EvidenceScore = f(terrain, official_map, imagery, observations, connectivity, historical_behavior)`

The score should be:

- documented,
- reproducible,
- sensitivity-tested,
- and validated against whatever verified subset exists.

The team must not imply that the score represents a calibrated probability unless calibration is actually performed.

---

# 8. DEM-derived drainage analysis

Possible methods:

- D8 flow direction,
- D-infinity flow direction,
- flow accumulation,
- watershed delineation,
- depression/sink analysis,
- terrain-derived drainage corridors.

Potential tools:

- QGIS,
- GDAL/rasterio,
- GeoPandas,
- Shapely,
- pysheds,
- RichDEM.

## Key interpretation

The DEM provides an **independent terrain-scale perspective**.

It should answer questions such as:

- Does the mapped drain broadly align with terrain flow?
- Does the network terminate in a terrain location that appears hydraulically implausible?
- Are there major terrain flow corridors not represented in the mapped network?
- Does the network connectivity conflict with watershed structure?

It should **not** answer:

- “Does this roadside drain physically exist?”
- “Is this drain blocked?”
- “Is this drain hydraulically functional?”

Those require additional evidence.

---

# 9. Hydraulic modelling

## Primary model

Use **EPA SWMM** for the 1D drainage-network component.

SWMM can represent:

- rainfall,
- subcatchments,
- runoff,
- junctions,
- conduits,
- outfalls,
- storage,
- infiltration,
- roughness,
- surcharge,
- node flooding,
- and related drainage dynamics.

## Critical limitation

SWMM does not automatically provide a complete 2D flood-extent map from node flooding.

Therefore the pipeline must explicitly distinguish:

**Rainfall → runoff → SWMM → node surcharge/flooding → surface inundation representation → flood extent/depth comparison**

### Possible surface representation

For the MVP, use a defensible DEM-based surface-spreading approach if feasible:

1. obtain flood volume/depth information from SWMM,
2. associate it with appropriate nodes/locations,
3. spread inundation over the terrain subject to elevation/connectivity constraints,
4. generate a predicted inundation layer,
5. compare against observations.

If this proves inadequate, consider coupling to a 2D model such as:

- HEC-RAS 2D,
- LISFLOOD-FP,
- or another appropriate surface-flow model.

A full 2D coupling should be considered an extension, not a mandatory requirement for the first vertical slice.

---

# 10. Hydraulic parameter uncertainty

Public drainage geometry is unlikely to contain all parameters required by SWMM.

Potential uncertain parameters include:

- conduit diameter/capacity,
- invert elevation,
- roughness,
- blockage fraction,
- imperviousness,
- infiltration parameters,
- rainfall scaling/spatial distribution,
- outlet conditions.

Instead of assigning one falsely precise value, use plausible ranges where the data justify them.

Example:

`capacity ∈ [C_min, C_max]`

rather than:

`capacity = C_exact`

The ranges must be documented and their source identified as:

- measured,
- sourced from documentation,
- estimated,
- assumed,
- or inferred.

---

# 11. Calibration and validation

This is a major methodological requirement.

## Calibration

Use selected historical flood events to estimate/adjust uncertain parameters.

Possible calibration targets:

- known flooded locations,
- observed flood extent,
- flood depth where available,
- node flooding,
- event timing,
- drainage response.

## Held-out validation

At least one different historical event should be held out from calibration.

The workflow should be:

**Calibration events → parameter estimation → frozen model → held-out event → independent evaluation**

This prevents the project from reporting a model that merely fits the events used to tune it.

---

# 12. Identifiability and sensitivity

Multiple parameter combinations can produce similar flood outputs.

For example:

- higher rainfall + higher drainage capacity,
- lower rainfall + lower drainage capacity,
- different roughness/infiltration combinations

may produce similar observed flooding.

Therefore, calibration alone does not prove that the estimated physical parameters are correct.

Perform sensitivity/identifiability analysis for important parameters such as:

- drainage capacity,
- roughness,
- infiltration,
- imperviousness,
- rainfall scaling.

The project should report which parameters are:

- strongly constrained,
- weakly constrained,
- or effectively non-identifiable from the available observations.

This is more scientifically useful than pretending every calibrated value is uniquely determined.

---

# 13. Avoiding calibration confounds

If the project compares:

1. the original official network, and
2. the reconciled/uncertainty-aware network,

both must use the **same calibration protocol**.

Otherwise, any improvement may simply result from giving one model additional degrees of freedom.

A strong experiment is:

- identical rainfall input,
- identical calibration procedure,
- identical parameter search budget,
- identical validation events,
- only the drainage representation differs.

Then compare held-out validation performance.

---

# 14. Uncertainty propagation

Instead of producing one deterministic flood map, sample uncertain inputs.

Potential uncertainty sources:

- drain capacity,
- blockage,
- roughness,
- rainfall magnitude,
- rainfall spatial distribution,
- infiltration,
- DEM uncertainty,
- disputed drainage connectivity.

Run multiple plausible scenarios.

Report:

- median/central estimate,
- spread or interval,
- scenario frequency,
- sensitive locations,
- robust vs uncertain conclusions.

Do not claim:

`Risk_A ≤ actual risk ≤ Risk_B`

unless the required assumptions have been demonstrated.

Flood response may be non-monotonic: restoring upstream capacity can sometimes shift or worsen downstream flooding.

Therefore use the term:

> **scenario envelope**

rather than guaranteed lower/upper risk bounds.

---

# 15. Counterfactual root-cause engine

The project should diagnose flood mechanisms through controlled interventions.

For a baseline event:

`Baseline = observed/reconstructed system under event rainfall`

Then modify one factor at a time.

Examples:

- restore capacity of disputed drain segment,
- reduce blockage,
- normalize rainfall to a reference level,
- alter roughness,
- alter infiltration,
- restore/modify a drainage connection.

For each counterfactual:

`ΔFlood = Flood_baseline − Flood_counterfactual`

This quantifies the simulated effect of that factor.

## Important distinction

Counterfactuals should primarily be executed directly in **SWMM**.

The GNN should not replace SWMM for final causal/engineering claims.

The GNN can later screen a large number of candidate scenarios, after which important candidates are verified with SWMM.

---

# 16. Interaction effects

Flood causes may interact.

For a small number of factors, evaluate all combinations directly:

`2^k scenarios`

This may be computationally practical for a catchment-scale model.

For larger numbers of factors, use approximate Shapley-style attribution or other interaction-aware methods.

The objective is to distinguish:

- individual effects,
- combined effects,
- interaction effects.

Do not force a single “root cause” when the model indicates multiple interacting contributors.

---

# 17. Synthetic experiments vs real validation

Synthetic experiments are useful but must not be described as historical validation.

Maintain three distinct experiment classes:

### A. Unit tests
Artificial cases designed to verify that the implementation behaves correctly.

Example:
- deliberately reduce one drain capacity,
- verify that the counterfactual engine detects a change.

### B. Synthetic scenario experiments
Controlled experiments used to study sensitivity, interactions, or algorithm behaviour.

### C. Historical-event validation
Real rainfall/flood events used for calibration and held-out evaluation.

Only category C supports claims about historical predictive performance.

---

# 18. Physics-guided GNN

## Why include AI?

A GNN is not necessary to solve one small SWMM catchment.

For a network containing hundreds of nodes, direct SWMM execution may be fast enough.

Therefore the AI component must answer a real computational question:

> **When does a learned surrogate become faster/useful enough for large-scale scenario exploration?**

The GNN is a **scalability experiment**, not the physical foundation of the project.

---

# 19. GNN formulation

Represent the drainage system as a graph.

## Nodes

Possible nodes:

- junctions,
- manholes,
- outfalls,
- storage nodes,
- subcatchments.

Node features may include:

- elevation,
- contributing area,
- imperviousness,
- rainfall,
- local terrain features,
- baseline water level,
- drainage class,
- evidence/confidence status.

## Edges

Edges represent:

- pipes,
- channels,
- drainage connections.

Edge features may include:

- length,
- slope,
- capacity/diameter,
- roughness,
- blockage,
- drainage class,
- evidence status.

## Outputs

Possible predictions:

- node flooding volume,
- water depth,
- surcharge state,
- selected flood-risk indicators.

The exact output should be chosen based on what can be reliably generated from SWMM.

---

# 20. Physics-guided training

Generate physically meaningful training scenarios with SWMM.

For example, vary:

- rainfall,
- drain capacity,
- blockage,
- roughness,
- infiltration,
- other uncertain parameters.

Train the GNN to reproduce SWMM outputs.

A possible loss is:

`L = L_prediction + λ1 L_physics + λ2 L_constraint`

where:

- `L_prediction` measures agreement with SWMM,
- `L_physics` penalizes physically implausible behaviour,
- `L_constraint` encodes relevant hydraulic/network constraints.

The exact physics terms should be chosen only after identifying constraints that can actually be justified for the selected model.

---

# 21. GNN benchmark

The GNN experiment must report:

### Direct SWMM cost

`SWMM scenario generation + N × SWMM inference/runtime`

### GNN cost

`SWMM training-data generation + GNN training + N × GNN inference + verification`

Then calculate the approximate break-even scenario count.

For example:

`T_SWMM(N) = T_generation + N*T_single_SWMM`

`T_GNN(N) = T_training_data + T_training + N*T_inference`

Find the region where:

`T_GNN(N) < T_SWMM(N)`

Also report prediction error.

A faster model with unacceptable error is not useful.

---

# 22. GNN intervention constraints

Keep the graph topology fixed for the first version.

Interventions should primarily modify parameters such as:

- capacity,
- roughness,
- blockage,
- rainfall assumptions,
- other node/edge attributes.

Do not initially train a GNN to handle arbitrary topology-changing interventions such as:

- adding new drains,
- reconnecting the network,
- deleting entire network branches.

Those require a more sophisticated graph-generalization setup.

---

# 23. Optional intervention optimization

If the core system is stable, add a decision layer.

Example objective:

> Maximize expected flood-risk reduction subject to a fixed intervention budget.

Candidate actions could include:

- restoring a blocked segment,
- increasing capacity,
- reducing blockage,
- improving selected infrastructure.

For a fixed graph, optimization can operate over parameter modifications.

Possible methods:

- MILP where the formulation permits,
- Bayesian optimization,
- evolutionary optimization such as NSGA-II.

The GNN can make large scenario searches cheaper, but important candidate solutions should be re-evaluated with SWMM.

---

# 24. Rainfall data

Bengaluru rainfall is spatially variable, particularly during convective events.

Prefer high-frequency local observations where available.

KSNDMC documents a large telemetric monitoring network with 15-minute rainfall measurements and Bengaluru-area hydrology resources including rain gauges and stormwater-drain monitoring.

The team should verify:

- exact stations available for the selected catchment,
- timestamps,
- missing data,
- spatial coverage,
- event completeness.

Potential supplementary data:

- IMERG or another gridded precipitation product,
- IMD datasets where suitable,
- other validated precipitation sources.

Do not automatically assume city-average rainfall is representative of a small catchment.

---

# 25. Catchment selection criteria

Score candidate catchments based on:

1. drainage-network availability,
2. rainfall-gauge availability,
3. historical flood observations,
4. terrain quality,
5. manageable network complexity,
6. ability to define calibration/validation events,
7. availability of independent evidence.

The final selection should be **data-driven**.

A smaller catchment with good evidence is preferable to a larger catchment where every hydraulic parameter is guessed.

---

# 26. One vertical slice first

Before implementing the full architecture, build:

**one catchment + one historical event + one complete end-to-end pipeline**

Minimum vertical slice:

1. obtain DEM,
2. obtain official drain network,
3. audit geometry/attributes,
4. delineate catchment,
5. derive terrain-flow evidence,
6. reconcile a subset of the network,
7. construct conceptual SWMM model,
8. obtain event rainfall,
9. run SWMM,
10. produce flood-location/depth representation,
11. compare against observations,
12. run one or two counterfactuals.

Only after this works should the team expand into:

- Bayesian calibration,
- uncertainty propagation,
- multiple events,
- GNN,
- optimization.

This protects the project against discovering late that the fundamental data/model link does not work.

---

# 27. Revised development priorities

## P0 — Must work

- Data audit
- Catchment selection
- DEM-derived terrain analysis
- Drainage reconciliation
- Conceptual SWMM network
- Parameter ranges/uncertainty
- One end-to-end historical event
- Calibration + at least one held-out event
- Basic flood observation comparison

## P1 — Strong extensions

- Counterfactual root-cause engine
- Independent flood observations
- Interaction analysis
- GNN scalability benchmark

## P2 — Research extensions

- Bayesian calibration
- More formal uncertainty quantification
- Shapley-style attribution
- Intervention optimization

## P3 — Only if time remains

- Agentic monitoring
- Automated rainfall-triggered simulation
- Rainfall forecasting
- U-Net/SAR flood segmentation
- Full 2D hydraulic coupling

---

# 28. Killer demonstration

The final demo should be a concrete investigation rather than a generic dashboard.

### Example workflow

**1. Select a historical flood location**

Show:

- event date/time,
- rainfall,
- catchment,
- terrain,
- relevant drainage segments.

**2. Show infrastructure evidence**

For the relevant drainage segment:

- official geometry,
- terrain-derived evidence,
- imagery/observation evidence,
- evidence status,
- uncertainty.

**3. Show baseline simulation**

Display:

- simulated node flooding/depth,
- affected locations,
- comparison with observed flood information.

**4. Run counterfactual**

Example:

> “What if this disputed/blocked drainage segment had its assumed capacity restored?”

Show:

- new simulated flood depth/volume,
- difference from baseline.

**5. Test interactions**

Show whether:

- rainfall,
- blockage,
- capacity,
- and other factors

produce additive or interacting effects.

**6. Show uncertainty**

Instead of one absolute answer:

> “Across plausible parameter scenarios, this intervention reduces simulated flooding in X% of scenarios and produces a median reduction of Y.”

Only report such statistics if actually computed.

**7. Show AI scalability**

Demonstrate:

- SWMM runtime,
- GNN inference runtime,
- GNN error,
- training cost,
- estimated break-even scenario count.

This makes the AI component defensible.

---

# 29. Dashboard architecture

## Backend

Potential stack:

- FastAPI
- Python
- GeoPandas
- rasterio/GDAL
- Shapely
- NetworkX
- pysheds/RichDEM
- SWMM/pyswmm
- PyTorch Geometric or DGL for GNN
- PostgreSQL/PostGIS

## Frontend

Potential stack:

- React / Next.js
- Leaflet or Mapbox

## Core dashboard layers

1. Catchment boundaries
2. Official drainage network
3. Terrain-derived flow/accumulation
4. Reconciliation status
5. Uncertainty/confidence
6. Historical flood observations
7. Rainfall
8. Simulated flood output
9. Counterfactual results
10. Intervention scenarios
11. GNN benchmark

The dashboard is the visualization layer, not the research contribution by itself.

---

# 30. Data model concept

A useful database design can contain:

### `catchments`
- catchment_id
- geometry
- area
- source

### `drain_segments`
- segment_id
- geometry
- hierarchy
- source
- connectivity
- known_attributes

### `drain_evidence`
- segment_id
- terrain_score/evidence
- imagery_evidence
- observation_evidence
- historical_evidence
- status
- evidence_notes

### `hydraulic_parameters`
- segment_id
- capacity_range
- roughness_range
- invert_range
- parameter_source
- assumption_flag

### `rainfall_events`
- event_id
- timestamp
- station/source
- rainfall
- quality_flag

### `flood_observations`
- event_id
- location
- timestamp
- observation_type
- source
- confidence/quality

### `simulation_runs`
- run_id
- event_id
- parameter_set
- model_version
- output_location

### `counterfactual_runs`
- baseline_run_id
- modified_factor
- modification
- output_change

This schema should evolve after the first vertical slice rather than being over-engineered in advance.

---

# 31. Evaluation metrics

## Drainage reconciliation

Depending on available labels:

- precision,
- recall,
- F1,
- confusion matrix,
- agreement with verified observations.

If labels are insufficient, report:

- agreement rates,
- expert/verified subset performance,
- sensitivity to scoring assumptions.

Do not report classification metrics without suitable ground truth.

## Hydraulic model

Possible metrics:

- RMSE/MAE for depth where observations exist,
- flooded/non-flooded classification,
- precision/recall/F1 for observed flood locations,
- intersection-over-union for valid flood extents,
- event timing error,
- total flooded volume where measurable.

## GNN

Report:

- MAE/RMSE,
- relative error,
- inference time,
- training cost,
- memory/use of resources where useful,
- SWMM verification agreement,
- break-even scenario count.

## Decision layer

Report:

- simulated flood reduction,
- cost,
- robustness across uncertainty scenarios,
- sensitivity to assumptions.

---

# 32. Novelty positioning

Do not claim:

> “We invented GNN flood prediction.”

That is not novel.

Do not claim:

> “DEM proves missing drains.”

That is too strong.

A more defensible contribution is the **integration and uncertainty-aware methodology**:

> A framework for auditing incomplete urban drainage representations using independent terrain and observational evidence, propagating drainage uncertainty through physics-based hydraulic simulation, validating on held-out historical events, and performing counterfactual infrastructure diagnosis, with a physics-guided GNN evaluated specifically as a scalable scenario surrogate.

Potential novelty areas to investigate through prior-art search:

- incomplete/uncertain urban drainage-network reconstruction,
- terrain-informed drainage-network auditing,
- uncertainty propagation from infrastructure mapping into hydraulic simulation,
- counterfactual flood diagnosis,
- surrogate modelling for scenario exploration.

A formal prior-art/literature search should be performed before making strong novelty claims.

---

# 33. Main failure modes and safeguards

| Failure mode | Safeguard |
|---|---|
| DEM treated as proof of drain absence | Describe DEM as terrain-scale evidence |
| False numerical probabilities | Use evidence scores unless calibrated |
| Drain KML assumed to contain hydraulic data | Audit attributes first |
| SWMM output called a flood map | Add explicit surface-spreading/2D step |
| Model fits only calibration events | Hold out at least one event |
| Parameters treated as uniquely identified | Perform sensitivity/identifiability analysis |
| Sentinel-1 forced onto unsuitable event | Check acquisition/timing/quality first |
| GNN added without computational justification | Benchmark runtime and break-even |
| GNN used for causal conclusions | Use SWMM for final counterfactual verification |
| Intervention changes topology unexpectedly | Keep graph topology fixed initially |
| Risk envelope assumed monotonic | Test monotonicity; use scenario envelopes |
| Synthetic experiments presented as validation | Separate unit/synthetic/historical experiments |
| One “root cause” forced from interacting causes | Use interaction/Shapley analysis |
| Full Bengaluru model becomes unmanageable | Use 1–3 data-rich catchments |
| Dashboard becomes the project | Keep modelling/validation as the core contribution |

---

# 34. Suggested implementation sequence

## Phase 1 — Data audit

- Download candidate DEM.
- Obtain OpenCity/KSRSAC drainage datasets.
- Inspect actual KML attributes.
- Identify candidate catchments.
- Locate available KSNDMC rainfall stations.
- Compile historical flood events.
- Check possible Sentinel-1 acquisitions.
- Identify verified drain/flood observations.

**Go/no-go decision:** choose the catchment only after this audit.

---

## Phase 2 — Vertical slice

Build one complete event:

`DEM + drainage → reconciliation → rainfall → SWMM → flood representation → observation comparison`

Do not build the GNN yet.

---

## Phase 3 — Calibration and validation

- Select calibration events.
- Define parameter ranges.
- Calibrate using a documented procedure.
- Freeze the resulting model.
- Evaluate on held-out event(s).
- Perform sensitivity/identifiability analysis.

---

## Phase 4 — Counterfactual diagnosis

Implement:

- single-factor interventions,
- scenario comparison,
- uncertainty propagation,
- interaction analysis where feasible.

Verify important conclusions directly in SWMM.

---

## Phase 5 — GNN scalability experiment

- Generate SWMM scenario dataset.
- Train graph surrogate.
- Measure prediction error.
- Measure training cost.
- Benchmark inference.
- Calculate break-even scenario count.
- Verify selected GNN scenarios using SWMM.

---

## Phase 6 — Optional optimization

If the core model is stable:

- define intervention candidates,
- assign costs,
- optimize under budget,
- evaluate robustness under uncertain scenarios,
- verify final candidates in SWMM.

---

## Phase 7 — Dashboard and final evaluation

Build the final interface around the killer demonstration.

The final report should clearly distinguish:

- observed facts,
- model assumptions,
- inferred evidence,
- simulation results,
- uncertainty,
- and limitations.

---

# 35. Minimum viable research contribution

If time becomes constrained, protect these components:

### Must retain

1. Drainage data audit
2. Terrain-based evidence reconciliation
3. Uncertainty-aware SWMM model
4. Historical-event calibration
5. Held-out validation
6. Counterfactual analysis

### Can be reduced

- number of catchments,
- number of historical events,
- sophistication of dashboard,
- Bayesian machinery,
- optimization.

### Can be dropped first

- agentic monitoring,
- rainfall forecasting,
- U-Net flood segmentation,
- full 2D coupling,
- large-scale GNN architecture experiments.

### GNN fallback

If time is tight, retain a **small benchmark** showing:

- SWMM scenario runtime,
- surrogate training,
- GNN inference,
- prediction error,
- and whether a computational break-even point exists.

Do not let the GNN consume time needed to establish the physical model and validation.

---

# 36. Team roles

### GIS / data engineer
- DEM preprocessing
- catchment delineation
- drainage network cleaning
- terrain-flow analysis
- geospatial database

### Hydraulic modelling
- SWMM network
- rainfall/runoff
- parameter ranges
- calibration
- validation
- counterfactual simulations

### ML / research
- scenario generation
- GNN architecture
- physics-aware loss
- benchmark
- uncertainty/sensitivity experiments

### Backend / systems
- PostGIS
- FastAPI
- simulation orchestration
- model/version tracking
- APIs

### Frontend / visualization
- map interface
- event investigation
- simulation comparison
- uncertainty visualization
- counterfactual controls
- benchmark dashboard

Roles can overlap; the project should still maintain a single shared data/model specification.

---

# 37. Key principles for the team

1. **Data availability determines scope.**
2. **Do not convert assumptions into facts.**
3. **Do not use DEM evidence beyond its resolution/physical meaning.**
4. **Do not claim probabilities without calibration.**
5. **Do not call SWMM node flooding a flood-extent map without an explicit mapping step.**
6. **Always separate calibration from held-out validation.**
7. **Treat parameter identifiability as a research result, not an inconvenience.**
8. **Use SWMM as the physical reference for counterfactual conclusions.**
9. **Use the GNN only where it provides measurable computational value.**
10. **Synthetic experiments are tests, not historical validation.**
11. **Do not force a single root cause when interactions are evident.**
12. **Prefer a smaller defensible experiment over a larger speculative one.**
13. **Every major output should expose uncertainty and assumptions.**
14. **Run a prior-art search before claiming novelty.**
15. **Build the one-catchment vertical slice before adding advanced components.**

---

# 38. One-sentence project description

> **FloodTwin-AI is an uncertainty-aware urban flood modelling framework that audits incomplete drainage maps using terrain and observational evidence, propagates infrastructure uncertainty through physics-based hydraulic simulation, diagnoses flood mechanisms through counterfactuals, and evaluates physics-guided GNNs as scalable surrogates for large scenario exploration.**

