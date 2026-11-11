# Role B — SWMM builder notes (Phase 1, not implemented)

**Status:** design note only. No builder, surface-spreading, calibration or
counterfactual code exists in this drop.
**Contract read:** `context/data-and-contracts.md` §6.1–6.3, §6.5
**Rule:** the contract is owned by Role D. This note does not change it.

## Purpose

Record how Role A's network handoff and Role C's scenario spec will map to a
generated SWMM `.inp` in Phase 2, and list the decisions that must be made before
the builder is written. The real builder will generate `.inp` files from the network
artifact and a config; `.inp` files will not be hand-edited.

## Input contract (as written)

`data/processed/<catchment_id>/network_v<N>.gpkg`, project CRS EPSG:32643:

- `nodes`: `node_id`, `geometry` (Point), `elev_m` (nullable), `node_type`
  (`junction|outfall|storage`), `provenance_elev`
- `links`: `link_id`, `from_node`, `to_node`, `geometry` (LineString), `hierarchy`,
  `length_m`, `evidence_score`, `evidence_status`, `direction_provenance`,
  `evidence_notes`
- `rejected`, `catchment`

## Planned mapping

| Contract input | SWMM `.inp` | Open issue |
|---|---|---|
| `nodes.node_type = junction` | `[JUNCTIONS]` with `elev_m` as invert, max depth from a config rule | `elev_m` may be ground elevation, not invert; contract does not distinguish them |
| `nodes.node_type = outfall` | `[OUTFALLS]`, stage from `outlet_condition_stage_m` range | Which node is the real outfall, and is it free or submerged? |
| `nodes.node_type = storage` | `[STORAGE]` | Storage geometry is not in the contract |
| `nodes.elev_m` null | infer from DEM, tag `INFERRED` | Must be recorded per node, not silently filled |
| `links.from_node` / `to_node` | `[CONDUITS]`, orientation follows the contract direction | `direction_provenance = INFERRED` links may need reversing in a sensitivity run |
| `links.length_m` | conduit length | Confirm it is plan length, not 3D length |
| `links.hierarchy` | cross-section shape / roughness group | Not a hydraulic attribute; do not map it to capacity |
| `links.evidence_status` | sampling condition for `status_capacity_factor` | `DISPUTED` links may also be a binary connection variable; equal-weight only |
| (absent) diameter / capacity | `[XSECTIONS]` `Geom1` from `conduit_diameter_m` | **No data.** Expected per audit §5.1 |
| (absent) roughness | conduit `Roughness` from `conduit_manning_n` | Range only |
| `catchment` polygon + DEM | `[SUBCATCHMENTS]` area, width, slope | Requires A's watershed/delineation products |
| (absent) imperviousness | `%Imperv` from `imperviousness` range | Needs land cover or imagery |
| `rainfall_events` (UTC) | `[TIMESERIES]` + `[RAINGAGES]` | 15-min KSNDMC record; never assume city-average rainfall |
| `ScenarioSpec.params` | per-run overrides before generation | One sampled value per run; hash the generated model |
| `Modification` list | targeted field edits before generation | One factor per counterfactual; check downstream nodes too |

## Planned pipeline (Phase 2, not built)

1. Read the network GeoPackage, assert CRS and schema.
2. Resolve node inverts: use `elev_m` where present, DEM otherwise, and record
   provenance per node.
3. Assign cross-sections and roughness from `ranges.yaml`, or from sampled values
   when a `ScenarioSpec` supplies them.
4. Build subcatchments from A's terrain products and rainfall series from the event
   config.
5. Render the `.inp` from a template; hash the rendered file and record the hash in
   the run manifest.
6. Run via `pyswmm`, parse the `.rpt` continuity errors, write `node_summary.parquet`.
7. Surface spreading is a separate module; node flooding is never reported as a map.

## Open questions for Role A / Role D

1. Is `elev_m` ground elevation or invert elevation? The builder cannot guess.
2. How should a null `elev_m` be flagged downstream: a per-node column or a
   separate provenance table?
3. Which node is the outfall when the network has several dangling ends?
4. Does `length_m` come from geometry or a surveyed attribute?
5. For `direction_provenance = INFERRED`, should the builder expose a per-link
   reversal flag, or is that a Role C sensitivity dimension?

## Not in this drop

- No builder implementation, no surface spreading, no calibration, no
  counterfactual engine.
- No edit to `context/data-and-contracts.md` or `configs/events.yaml`.
