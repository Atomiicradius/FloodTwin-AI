# domlur_a25_b13: Role A → Role B handoff (network_v1)

**Status: PROVISIONAL.** This is the top-ranked candidate catchment. It is not yet an approved Gate 1 choice. See `reports/01_data_audit.md` §7 and Decision Log D-002.

| Item | Value |
|---|---|
| Catchment | DEM-derived basin (Copernicus GLO-30, D8). Watershed of the cell where upstream area first reaches 25 km²; outlet in BBMP ward "Domlur". Area 27.49 km² |
| network_version | `3216f260ee12d4ee` (content hash of nodes + links; see `manifest.json`) |
| CRS / units | EPSG:32643, metres |
| Layers | `nodes` (66), `links` (59: 8 primary, 51 secondary), `rejected` (1), `catchment` (1) |
| Evidence status (links) | SUPPORTED 30 · DISPUTED 14 · UNVERIFIED 15 · VERIFIED 0 |
| Terrain support (`terrain/`) | conditioned DEM, sink depth (depression map), D8 flow direction, D8 and D-inf upstream area, catchment mask. All clipped to catchment + 500 m |
| Observations | `flood_observations.parquet` (2 news reports, both "Indiranagar", events 20220905 and 20250518, confidence low); `flood_locations.gpkg` (31 official flood-location records within 500 m, undated) |

## What the source data do NOT contain (do not assume)
- No diameter, width, depth, invert, roughness, capacity or material for any drain. Every hydraulic parameter must come from `configs/params/ranges.yaml`, with a provenance tag.
- No flow direction. `direction_provenance = INFERRED` for every link (`direction_basis`: 52 by DEM elevation drop ≥ 1 m, 7 by upstream area).
- Node `elev_m` is the conditioned DSM **surface** elevation at the node cell (`provenance_elev = ESTIMATED`). It is not an invert. The Copernicus DEM is a surface model, so buildings and trees can bias it upward.

## Known issues for Role B
1. **Fragmented network: 7 connected components.** The 12 `outfall` nodes are network termini after inferred orientation. They are not all real outfalls, and Role B decides the boundary conditions. Gaps in the source data are larger than the snap tolerance (median dangling-end gap city-wide is 191 m), so snapping cannot close them. They are left open, not invented.
2. 14 DISPUTED secondary links: the terrain runs across them, not along them. Many have terrain_index exactly 0.30 (the threshold), which is a boundary case. This is a terrain-scale inconsistency worth investigating. It does **not** show that the drain is missing or blocked. One likely explanation is that these drains follow roads rather than valley lines. Keep them in the model and treat their capacity or connectivity as an uncertain parameter (technical-specs §5.5).
3. Tertiary drains are not in this network. They are in `data/processed/bengaluru/network_city_v1.gpkg`, layer `tertiary_evidence_only`. The audit found they look like CAD/toposheet "Line_Water" features and are only 2.6 % co-located with primary or secondary drains.
4. Link membership uses the midpoint-inside rule. Links that cross the basin boundary are kept whole.

## Reproduce
```bash
PYTHONPATH=src python -m floodtwin.geo.fetch --verify
PYTHONPATH=src python -m floodtwin.geo.pipeline --catchment domlur_a25_b13
```
