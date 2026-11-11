# Role B Phase 1 — Draft hydraulic parameter ranges

**Status:** DRAFT — not frozen, not calibrated
**Owner:** Role B
**File:** `configs/params/ranges.yaml`
**Schema:** `context/reference/technical-specs.md` §5.5
**Purpose:** fix the parameter groups, units, ranges and provenance before any real
catchment model exists, so later sampling cannot quietly become data fitting.

## Model assumption

Every group below is a **range**, not a single value. `provenance` uses the project
vocabulary only (`MEASURED`, `DOCUMENTED`, `ESTIMATED`, `ASSUMED`, `INFERRED`).
`ASSUMED` means the number is a placeholder justified in the source note, not a
literature value. No range is a probability and no range is a posterior.

## Parameter groups

| Group | Unit | Min | Max | Provenance | Basis |
|---|---|---|---|---|---|
| `conduit_diameter_m` | m | 0.30 | 2.00 | `ASSUMED` | No diameter attribute exists in the public KML; placeholder pending A's audit or field data |
| `invert_elevation_offset_m` | m | −0.30 | 0.30 | `ASSUMED` | Inverts absent; offset for DEM error and unknown burial depth |
| `conduit_manning_n` | s/m^(1/3) | 0.013 | 0.035 | `ESTIMATED` | Concrete sewer / cemented rubble masonry values (Chow 1959 via SWMM Ref. Manual Vol. 2), plus debris |
| `blockage_fraction` | fraction | 0.00 | 0.60 | `ASSUMED` | No blockage inventory; clear-to-obstructed range, not a probability |
| `imperviousness` | fraction | 0.40 | 0.95 | `ESTIMATED` | Land-use guideline values (MHFD 2024, Table 6-2) |
| `infiltration_green_ampt_conductivity_mm_per_hr` | mm/hr | 0.3 | 29.9 | `ESTIMATED` | USDA texture range (Rawls et al. 1983), trimmed for compacted urban soils |
| `infiltration_green_ampt_suction_mm` | mm | 49.5 | 316.3 | `ESTIMATED` | USDA texture range (Rawls et al. 1983) |
| `infiltration_green_ampt_initial_deficit` | fraction | 0.05 | 0.40 | `ASSUMED` | Porosity range is documented; antecedent moisture is not |
| `rainfall_scale` | fraction | 0.70 | 1.30 | `ASSUMED` | Gauge representativeness / 15-min aggregation; not a calibrated multiplier |
| `outlet_condition_stage_m` | m | 0.00 | 1.00 | `ASSUMED` | Outfall condition unknown; free to submerged |
| `status_capacity_factor` | fraction | 0.20 | 1.00 | `ASSUMED` | Schema-only placeholder for `DISPUTED` / `UNVERIFIED` links |

All groups use `distribution: uniform` as the default. Per-segment overrides are
allowed by the schema but none are defined yet.

## What is documented and what is not

**Documented:** Manning's n material values, Green-Ampt soil parameters, and
land-use imperviousness come from sources actually read; see
`context/reference/sources.md` (Role B rows). The source note in each YAML group
names the table and the value used.

**Not documented:** conduit diameters, invert offsets, blockage, antecedent
moisture, rainfall scaling and outfall stage have no local data yet. They are marked
`ASSUMED` and must be replaced, not defended.

## Open items before the ranges can be frozen

1. **Role A:** diameter/capacity, invert, blockage and land-cover evidence from the
   audit. Without these, groups 1, 2, 4 and 5 stay `ASSUMED`.
2. **Role C:** review sampling ranges, independence assumptions and the interaction
   with `ScenarioSpec` before any ensemble is run.
3. **Role D:** decide whether to keep the `_meta` block in the YAML or strip it when
   the ranges schema validator lands. The draft status is also stated here and in a
   header comment.
4. **Rainfall analysis:** replace the 0.70–1.30 placeholder with a gauge
   representativeness check once Role A supplies station data.

## Limitation

The ranges are wide by design because the underlying infrastructure is undocumented.
Wide ranges are honest here, but they are not evidence of model skill. Identifiability
cannot be assessed until calibration; until then, no parameter should be reported as
"the" value.
