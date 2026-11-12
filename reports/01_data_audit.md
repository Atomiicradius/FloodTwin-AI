# 01 — Data Audit, Catchment Ranking and Evidence Layer v0 (Role A)

**Owner:** Role A (GIS & Data) · **Phase:** 1 (weeks 1–2), with Phase 2 items started · **RQ addressed:** RQ1 (and inputs to RQ3)
**Experiment class:** all numbers come from real public data (class C data products). Nothing here is a predictive-performance claim, and nothing is synthetic. The unit tests (`tests/geo`, `tests/evidence`) are class A and use tiny hand-built geometries only.
**Reproduce:** `PYTHONPATH=src python -m floodtwin.geo.fetch --verify && PYTHONPATH=src python -m floodtwin.geo.pipeline` (≈ 75–110 s). Every number below is in `reports/01_data_audit_numbers.json`. The tables are in `reports/tables/`.

---

## 1. Inputs and versions

**Observed fact.** 17 public sources are registered in `data/MANIFEST.yaml` and hash-locked in `data/MANIFEST.lock.yaml` (SHA-256, byte size, access date 2026-11-11 UTC). One hand-curated file, `data/curated/news_flood_reports.yaml`, quotes place names from 4 cited articles.

| Group | Sources | Licence (per publisher) |
|---|---|---|
| Drainage (KSRSAC via OpenCity, 2022) | primary, secondary, tertiary, all-drain KML | OpenCity "Other (Public Domain)" |
| DEM | Copernicus GLO-30 N12/N13 E077 (AWS Open Data); SRTM GL1 N12/N13 E077 (AWS terrain tiles) | Copernicus DEM licence; SRTM public domain |
| Flood locations (OpenCity) | KGIS flood-vulnerable locations (200), flood-prone locations (70), BBMP low-lying areas (129) | Public Domain |
| Rainfall stations (OpenCity, KSNDMC) | 185 telemetric rain-gauge locations, Bengaluru Urban; AWS/TRG commissioning list (CSV) | Public Domain |
| Rainfall context | IMD Bengaluru monthly totals 1901–2025 | Public Domain |
| Admin | BBMP zones 2022, wards 2022 (243) | **not stated**, confirm before redistribution |
| Independent mapping | OpenStreetMap waterways (Overpass snapshot, OSM base 2026-11-11T14:41Z, 2,838 ways) | ODbL |
| External services queried | ASF Sentinel-1 search API; OSM Nominatim geocoder (place-name strings only) | — |

Config: `configs/geo.yaml`, `configs/evidence.yaml`. Selected-catchment `network_version` = `3216f260ee12d4ee`.

---

## 2. Drainage data audit (technical-specs §5.1)

### 2.1 Checklist results — **Observed fact**

| Check | Primary | Secondary | Tertiary | All-drain |
|---|---|---|---|---|
| Features | 163 | 870 | 5,806 | 6,839 |
| Geometry type | MultiLineString (single-part) | MultiLineString (single-part) | 5,794 LineString, 8 Multi, **4 null** | 5,798 LineString, 1,041 Multi |
| Total length (km) | 328.5 | 438.8 | 1,219.0 | 1,988.5 |
| Zero-length parts (< 1 m) | 0 | 6 | 12 | 18 |
| Non-simple (self-intersecting) parts | 0 | 0 | 6 | 7 |
| Invalid geometries | 0 | 0 | 0 | 0 |
| Exact / near duplicates (≤ 5 m Hausdorff) | 0 / 0 | 0 / 0 | 0 / 10 | 0 / 9 |
| Source CRS → target | EPSG:4326 → EPSG:32643 (all) | | | |
| Hierarchy attribute | implicit (one file per class) | implicit | implicit | `Type` = Primary 163 / Secondary 870 / Tertiary 5,806 |
| **Hydraulic attributes** | **none** | **none** | **none** | **none** |
| Flow direction encoded | no | no | no | no |

**Attributes that exist.** Primary and secondary have only `OBJECTID`, `OBJECTID_1`, `Length`, `SHAPE_Leng` and `Shape.STLength()`. Secondary also has a constant `…SWD_Secondary.area` (0.01507 or 0). Tertiary has CAD metadata: `Layer = Line_Water` for all, `Entity` = LWPolyline/Spline/Line/2DPolyline, and `Linetype` includes FOOTPATH-1/2/3 and CART-TRACK-2 on 8 features. Its `Elevation` field is 0 except for two values of −3.2. That is a CAD artefact, not an invert level. **There is no diameter, width, depth, invert, roughness, capacity, material or direction anywhere.** The hydraulic network is therefore a conceptually parameterised model. Every hydraulic property must come from ranges with provenance tags (Role B).

**All-drain file.** It is exactly the union of the three class files (163 + 870 + 5,806 = 6,839). It adds no information, so it is used only as a consistency check. Its `OBJECTID` is not unique across classes.

### 2.2 Connectivity — **Observed fact**, with the tolerance choice a **Model assumption**

Primary + secondary network after T-junction splitting and endpoint snapping (`reports/tables/01_connectivity_sensitivity_primary_secondary.csv`, figure `01_connectivity_sensitivity.png`):

| Snap tol (m) | Nodes | Links | Components | Largest-component length share | Dangling nodes | T-splits |
|---|---|---|---|---|---|---|
| 1 | 1,381 | 1,293 | 104 | 0.325 | 785 | 267 |
| 2 | 1,381 | 1,294 | 104 | 0.325 | 784 | 268 |
| **5 (chosen)** | 1,379 | 1,299 | **100** | 0.325 | 775 | 273 |
| 10 | 1,369 | 1,294 | 95 | 0.325 | 766 | 273 |
| 20 | 1,351 | 1,285 | 90 | 0.326 | 745 | 275 |
| 50 | 1,277 | 1,249 | 73 | 0.325 | 666 | 285 |

- The largest connected component holds only **32.5 %** of the primary + secondary length at every tolerance from 1 to 50 m. The disconnection is structural: it is not something snapping can fix.
- Gap from each dangling end to the nearest non-incident drain: median **191 m**, inter-quartile range 98–356 m. Only 7 of 775 dangling ends lie within 10 m, and 106 within 50 m. Many dangling ends are legitimate upstream heads. The rest are mapping gaps, culverts or covered sections the map does not record. We cannot tell which from these data.
- With tertiary included (all classes): 2,628 components at 5 m and 2,207 at 10 m. The largest-component share is only 0.16–0.19.
- **The 5 m tolerance is ASSUMED.** It lies on the plateau from 1 to 10 m, where components change from 104 to 95. Going above 10 m starts collapsing short links into self-loops (63 at 50 m).

### 2.3 Class overlap and positional agreement — **Observed fact / Inferred evidence**

- 1.1 % of secondary length is within 10 m of a primary drain. 2.6 % of tertiary length is within 10 m of a primary or secondary drain. The classes are mostly disjoint lines, not nested duplicates.
- Agreement with OpenStreetMap waterways, which are independent crowd mapping and **not ground truth**:

| Class | within 15 m | within 30 m | within 60 m |
|---|---|---|---|
| Primary | 0.51 | 0.67 | 0.80 |
| Secondary | 0.24 | 0.33 | 0.42 |
| Tertiary | 0.08 | 0.14 | 0.22 |

  **Inferred evidence:** primary drains are largely confirmed in position by an independent mapping source. Secondary drains are much less so. Tertiary lines rarely coincide with OSM waterways, which together with their CAD/footpath linetypes is why they are excluded from the model network (`network.hierarchies_for_model`). Low OSM agreement can also mean OSM is incomplete. It is not evidence that a drain is absent.
- **Manual spot-check (≥ 30 segments).** A seeded sample of 30 primary/secondary segments (seed 20261111) with map links is in `reports/tables/01_spot_check_sample.csv`. **This check has not been done yet.** The result columns are deliberately empty and must be filled by a person looking at imagery.

### 2.4 Cleaning outcome (city-wide, primary + secondary, 5 m) — **Observed fact**

1,033 input parts → 6 rejected `ZERO_LENGTH`, 0 duplicates, 273 T-junction splits, 1 rejected `SELF_LOOP_AFTER_SNAP` → **1,299 links, 1,379 nodes** (`data/processed/bengaluru/network_city_v1.gpkg`). Nothing is deleted silently: every removed item is in layer `rejected` with a `reason_code`. One flood-location record (BBMP low-lying list, OBJECTID 83, "KARAMCHAND LAYOUT NEAR KARIYANNA PALYA") has the literal coordinates `nan,nan` in the source. It is excluded and logged.

**Direction (Model assumption).** No direction exists in the data. Links are oriented downhill when the conditioned-DEM drop is ≥ 1 m (1,049 links), otherwise toward the larger upstream area (225), otherwise in digitising order (25). Every link is tagged `direction_provenance = INFERRED`.

---

## 3. DEM audit and terrain analysis

### 3.1 Candidates — **Observed fact**

| | Copernicus GLO-30 | SRTM GL1 |
|---|---|---|
| Type | **DSM** (includes buildings and canopy), TanDEM-X 2010–2015 | SRTM C-band, February 2000 |
| Resolution | 1″ (≈ 30 m) → resampled bilinear to 30 m EPSG:32643 | same |
| Vertical datum | EGM2008 | EGM96 |
| Voids in AOI | 0 | 0 |
| AOI elevation range (m) | 704–992 | 706–1,002 |

Copernicus minus SRTM inside BBMP (796,575 cells): median −0.91 m, median absolute difference 1.82 m, 5th–95th percentile −5.2 to +3.6 m (figure `01_dem_difference.png`). Different vertical datums contribute a small offset, which we have not separated out.

**Decision (Model assumption):** use Copernicus GLO-30. It is more recent (it post-dates most of the urban expansion since 2000), it has no voids, and it agrees with SRTM to within a few metres. SRTM is kept for comparison and sensitivity checks. **Limitation:** both are 30 m surface models with no stated vertical accuracy specific to Bengaluru. **A 30 m DEM cannot resolve roadside drains, small culverts or covered drains**, and buildings in the DSM raise local "ground".

### 3.2 Terrain products — **Simulation result** (deterministic terrain processing)

pysheds 0.5 was used for pit filling, depression filling, flat resolution, D8 and D-infinity flow direction, and accumulation. Grid: 1,373 × 1,341 cells (BBMP bbox + 3 km). The depressions that filling removed cover 62,461 cells inside BBMP at ≥ 0.5 m depth and 16,207 cells at ≥ 2 m (maximum 23.9 m). These include real tanks and lakes as well as DSM artefacts such as buildings and flyovers, and are written to `sink_depth.tif` for Role B's surface-spreading step. Terrain corridor = D8 upstream area ≥ 0.25 km² (ASSUMED; sensitivity tested at 0.1 and 1.0 km²).

---

## 4. Rainfall stations, flood observations and Sentinel-1

### 4.1 Rain gauges — **Observed fact / Limitation**

185 KSNDMC telemetric rain-gauge locations are known for Bengaluru Urban, 99 of them inside BBMP. **Only their locations are openly available.** The 15-minute time series KSNDMC records are not downloadable from any open source we found, so station completeness and timestamps **cannot be verified**. Every candidate catchment has ≥ 4 gauges within 2 km, so gauge *density* does not separate the candidates. Data *access* is the binding constraint. Action: Role A/B to request event time series from KSNDMC.

IMD monthly city totals show all four candidate event months were well above the 1991–2020 normal: Aug 2017 351.8 mm (normal 160.2), Sep 2022 353.0 (198.4), Oct 2024 306.2 (180.7), May 2025 315.0 (133.0). This is context only. City-month totals must never be used as catchment event forcing.

### 4.2 Flood observations — **Observed fact**, with geocoding **Inferred evidence**

- **Undated official location lists:** 398 usable records forming 385 distinct locations (50 m clustering); 396 lie inside BBMP. They are stored separately as `flood_locations.gpkg` and are **not** event observations.
- **Event-tagged reports** (`flood_observations.parquet`, contract §6.4): 27 reports are curated from 4 cited articles. 23 were geocoded with OSM Nominatim. 2 were skipped on purpose: "Sarjapur road" (a linear feature over 10 km) and "Kamaraj Nagar" (ambiguous; OSM returns a different place). 2 failed to geocode (DivyaSree Technopolis, Basava Samithi Layout). One query was corrected after QC: plain "Kodigehalli" resolved to a different village of the same name in the east of the city.

| event_id | Reports | Geocoded | Depth stated |
|---|---|---|---|
| 20170815_bengaluru | 1 | 1 | ≥ 0.30 m (S.T. Bed Layout main road) |
| 20220905_bengaluru | 10 | 8 | none numeric |
| 20241021_bengaluru | 7 | 6 | up to 1.83 m (Kendriya Vihar), up to 1.22 m (Vidyaranyapura) |
| 20250518_bengaluru | 9 | 8 | none numeric |

  All are `confidence = low`. The coordinates are locality or road centroids, not the flooded spot. Timestamps are article publication times, which are upper bounds on the observation time. `depth_m` values are "up to" figures as quoted.

### 4.3 Sentinel-1 (P14) — **Observed fact**, verdict **Uncertainty**

ASF search for S1 IW GRD-HD over the BBMP bbox, in a window from 24 h before to 72 h after a nominal start of 18:00 IST on the event night (ASSUMED):

| Event | Acquisition (UTC) | Lag from nominal start | Orbit | Verdict |
|---|---|---|---|---|
| 20170815 | 2017-08-14 00:39 | −11.8 h | S1A desc., path 165 | pre-event only; could serve as a reference image, not as a flood observation |
| **20220905** | **2022-09-05 00:40** | **+12.2 h** | S1A desc., path 165 | acquired the morning after the night's rain; **candidate**, quality not yet inspected |
| 20241021 | 2024-10-24 00:40 | +60.2 h | S1A desc., path 165 | late; street water has likely receded, though lakes or low-lying areas may still show water |
| 20250518 | none | — | — | no acquisition in window, so SAR is not used |

None of these is marked usable. Inspection for urban double-bounce, layover and shadow is still required (project-context §6.5).

---

## 5. Catchment selection (technical-specs §5.2)

### 5.1 Method — **Model assumption**

Candidates are terrain-defined, non-nested basins at three scales. A candidate is the watershed of each cell where D8 upstream area first reaches A = 4, 10 or 25 km². Basins at the same scale never overlap; the different scales are alternatives to each other. 75 candidates are ≥ 90 % inside BBMP: 48 at 4 km², 18 at 10 km², 9 at 25 km². Areas range from 4.0 to 31.6 km². Scoring rules, with all cut-offs ASSUMED, are in `src/floodtwin/geo/catchments.py::score_candidates`. Two criteria are capped because the open data cannot support a higher score:
- Rain gauges are capped at 2, because 15-minute completeness cannot be verified.
- Events are capped at 1, because no event rainfall series is available.

The maximum possible score is 54.

### 5.2 Ranking (top 5 of 75; full table in `reports/tables/01_catchment_ranking.csv`) — **Inferred evidence**

| Rank | Candidate | Area km² | P+S drain km | Nodes | Components | Largest-component share | Gauges ≤ 2 km | Flood-location clusters | Event reports (events) | Score /54 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **domlur_a25_b13** | 27.5 | 30.3 | 66 | 7 | 0.87 | 13 | 25 | 2 (2) | **38** |
| 2 | dodda_nekkundi_a25_b12 | 25.0 | 25.0 | 54 | 4 | 0.95 | 13 | 11 | 1 (1) | 36 |
| 3 | kodigehalli_a25_b7 | 30.3 | 25.7 | 34 | 3 | 0.85 | 15 | 16 | 2 (1) | 35 |
| 4 | deen_dayalu_ward_a10_b33 | 10.0 | 14.3 | 33 | 2 | 0.99 | 10 | 2 | 1 (1) | 33 |
| 5 | hosahalli_a25_b11 | 25.2 | 30.5 | 57 | 7 | 0.83 | 17 | 38 | 0 | 33 |

Rank 1 is the only candidate that has both news reports from two different events and a post-event Sentinel-1 acquisition (2022-09-05). Both of its event reports, however, are the same locality-level point, "Indiranagar". Ranks 2–10 differ by only 1–5 points, so **the ranking is sensitive to the assumed cut-offs.**

### 5.3 Gate 1 check (team-plan §8) — **Uncertainty / Limitation**

| Gate 1 criterion | Status for domlur_a25_b13 |
|---|---|
| Usable drainage network | **Partly met**: 59 links and 66 nodes, but 7 components and no hydraulic attributes |
| ≥ 1 rain station with usable 15-min data nearby | **Not met**: 13 gauge locations are within 2 km, but no time series is in hand |
| ≥ 3 events with ≥ 5 geolocated observations each | **Not met**: 2 events, each with 1 locality-level report |
| DEM usable | Met, with the 30 m DSM caveat |

**Recommendation for the Gate 1 meeting.** Neither this candidate nor any other meets Gate 1 with open data alone. Per the team plan, the choice is to widen the evidence before modelling, not to start modelling anyway:
1. request KSNDMC 15-minute series for the 13 gauges near rank 1 and rank 2, for the four candidate events;
2. extend event curation (BBMP control-room or helpline logs, traffic-police advisories, more articles) for the 20220905 and 20250518 events in the eastern and central basins;
3. inspect the 2022-09-05 Sentinel-1 scene.

Phase 2 terrain and network work can go ahead on domlur_a25_b13 **provisionally**, because it does not depend on the event data. Proposed as Decision Log D-002.

---

## 6. Evidence layer v0 (technical-specs §5.3)

### 6.1 Rule — **Model assumption** (`configs/evidence.yaml`)

The indicators are computed per link and stored separately:
- `terrain_alignment`: share of the link within 45 m of a corridor;
- `terminal_plausibility`: whether the downstream end continues into another drain, or ends on a corridor or in a depression ≥ 0.5 m; NaN within 500 m of the edge of the mapped network;
- `connectivity_consistency`: whether D8 flow traced from the upstream end reaches the downstream end;
- `historical_evidence`: official flood locations within 250 m. This is a behavioural hint with weight 0.

`imagery_evidence` and `observation_evidence` are **not assessed** (NaN).

`evidence_score` is an **index** (a weighted mean of 0.4/0.3/0.3 over the available terrain indicators). **It is not a probability.** The three DEM indicators together count as **one** independent source.

Status rule:
- SUPPORTED = official map + terrain agree (terrain_index ≥ 0.6);
- DISPUTED = terrain_index ≤ 0.3;
- tertiary drains always UNVERIFIED;
- VERIFIED requires a direct observation.

### 6.2 Results — **Inferred evidence**

City-wide (1,299 primary + secondary links): **SUPPORTED 724, DISPUTED 231, UNVERIFIED 344, VERIFIED 0.**

| Class | SUPPORTED | DISPUTED | UNVERIFIED |
|---|---|---|---|
| Primary (428) | 273 | 45 | 110 |
| Secondary (871) | 451 | 186 | 234 |

Selected catchment (59 links): SUPPORTED 30, DISPUTED 14, UNVERIFIED 15. All 14 DISPUTED links there are secondary. Most have terrain_alignment = 0 and connectivity_consistency = 0, meaning the terrain runs across them rather than along them. Nine sit exactly on the 0.30 threshold.

**Wording rule (P3).** DISPUTED means a *terrain-scale inconsistency worth investigating*. It does **not** mean a drain is missing, blocked or non-functional. A likely explanation for many of these secondary drains is that they follow roads rather than valley lines, which a 30 m DSM cannot represent.

### 6.3 Sensitivity — **Uncertainty** (`reports/tables/01_evidence_sensitivity_city.csv`, figure `01_evidence_sensitivity.png`)

Share of the 1,299 links whose status changes under a one-at-a-time change:

| Variant | Changed |
|---|---|
| Any terrain weight ±20 % | 6.0–20.1 % |
| Agree threshold +0.1 / −0.1 | 18.1 % / 7.9 % |
| Disagree threshold +0.1 / −0.1 | 8.9 % / 11.8 % |
| Corridor buffer 30 m / 60 m | 5.3 % / 5.0 % |
| Stream threshold 0.1 / 1.0 km² | 6.5 % / 10.5 % |
| Official map not counted as a source | **55.7 %** (no link can be SUPPORTED) |
| Terrain decisive for primary only | **49.0 %** |

**Reading:** the statuses hold up reasonably well against the numeric choices (most variants change 5–20 % of links). They depend much more on two *structural* choices: whether the official map counts as an evidence source, and whether terrain is allowed to judge secondary drains. Those two choices should be decided explicitly at the Gate 1 meeting.

### 6.4 Validation — **Limitation**

The verified label set is **empty**: there are no field or citizen drain audits and no imagery review. Precision, recall and F1 therefore cannot be computed and are not reported (technical-specs §5.3 iii). The only external comparison available is the OSM positional agreement in §2.3, which is not a functional label.

---

## 7. Limitations (consolidated) — **Limitation**

1. The drainage data have no hydraulic attributes and no direction. Directions are terrain-INFERRED, and node elevations are DSM surface values, not inverts.
2. The network is fragmented: 100 components city-wide and 7 in the selected catchment. Gaps are larger than any defensible snap tolerance, and we have not invented connections.
3. A 30 m DSM cannot resolve street-scale drains, culverts or covered drains. Buildings bias "ground" elevation. Terrain evidence is all from one DEM and so is a single source.
4. Event observations are few, locality-level and low-confidence. Undated location lists are not event observations.
5. No 15-minute rainfall series are available yet, which blocks Gate 1.
6. Sentinel-1 timing is checked; image quality is not.
7. Catchment-score cut-offs and evidence weights and thresholds are ASSUMED. Sensitivity is reported above.
8. The ward-boundary licence is not stated by the publisher.
9. `floodtwin.common` (Role D) does not exist yet. Role A uses small local helpers in `geo/config.py`, to be replaced later. The working copy is not a git repository, so `git_commit` in manifests is null.

## 8. Handoffs

| To | Artifact | Path |
|---|---|---|
| B | network_v1 (nodes, links, rejected, catchment) + terrain clip + observations | `data/processed/domlur_a25_b13/` (see its README) |
| B, C, D | city network + evidence, flood locations, rain stations, observations, event candidates, S1 table, candidate catchments | `data/processed/bengaluru/` |
| D | contract additions proposed: extra link columns (indicators, `direction_basis`, `terrain_index`, `snap_shift_m`), node columns `degree`, `elev_note`, `node_type_note`; observation `quality_notes` carries timestamp precision | Decision Log D-003 |

Figures (each caption: class C data product, Bengaluru / catchment as titled, no scenarios, 30 m DEM assumption):
`01_inventory_map.png`, `01_connectivity_sensitivity.png`, `01_dem_difference.png`, `01_catchment_candidates.png`, `01_evidence_status_city.png`, `01_selected_catchment.png`, `01_evidence_sensitivity.png`.
