# Data, Contracts & Conventions

> The shared data/model specification. **A schema change requires a PR touching this file, approved by the producer and every consumer.** Role D is the contract guardian.

Role D owns `context/data-and-contracts.md`; the summaries below are authoritative until superseded there. **A schema change requires a PR touching `context/data-and-contracts.md`, approved by the producer and every consumer.**

### 6.1 Network handoff (A → B)

File: `data/processed/<catchment_id>/network_v<N>.gpkg` with layers:

- `nodes`: `node_id` (str, unique), `geometry` (Point), `elev_m` (float, nullable), `node_type` (`junction|outfall|storage`), `provenance_elev`
- `links`: `link_id` (str, unique), `from_node`, `to_node`, `geometry` (LineString), `hierarchy` (`primary|secondary|tertiary|other`), `length_m`, `evidence_score` (float), `evidence_status` (enum), `direction_provenance` (`DOCUMENTED|INFERRED`), `evidence_notes`
- `rejected`: removed/merged features with `reason_code`
- `catchment`: boundary polygon

All CRS = project metric CRS (data-and-contracts.md §7.4).

### 6.2 Scenario specification (B ↔ C ↔ D)

```python
@dataclass(frozen=True)
class Modification:
    kind: str               # e.g. "capacity_factor", "blockage", "rainfall_scale", "roughness", "connection"
    target: str             # link_id / node_id / "global"
    value: float | bool
    note: str = ""

@dataclass(frozen=True)
class ScenarioSpec:
    scenario_id: str
    exp_class: str          # "A_unit" | "B_synthetic" | "C_historical"
    catchment_id: str
    event_id: str
    network_version: str    # content hash of network gpkg
    model_version: str      # git tag / hash of model builder
    params: dict[str, float]  # fully sampled values, SI units
    modifications: list[Modification]
    seed: int
```

Runner signature (Role B provides, Roles C/D consume):

```python
def run_scenario(spec: ScenarioSpec, out_dir: Path) -> RunResult: ...
# RunResult: run_id, status, runtime_s, continuity_errors, paths to node_summary.parquet,
#            node_timeseries.parquet (optional), inundation.tif (optional), manifest.json
```

### 6.3 Output tables

`node_summary.parquet`: `run_id, node_id, max_depth_m, flood_volume_m3, flood_duration_min, surcharged (bool)`.
`inundation.tif`: max depth (m), same grid/CRS as the DEM used, nodata = -9999.

### 6.4 Flood observation table (A → B, C, D)

`flood_observations.parquet` / table `flood_observations`:
`obs_id, event_id, geometry (Point or Polygon), timestamp_utc, observation_type (complaint|news|photo|gauge|sar|survey), depth_m (nullable), source, source_url, confidence (low|medium|high), quality_notes`.

### 6.5 Rainfall events

`rainfall_events`: `event_id, station_id, timestamp_utc, rain_mm_per_interval, interval_min, quality_flag`. Events metadata in `configs/events.yaml`: `event_id, start_utc, end_utc, role (calibration|heldout|synthetic), notes`.

### 6.6 Identifier rules

`catchment_id`: lowercase slug, e.g. `koramangala_v`. `event_id`: `YYYYMMDD_<catchment>`; `run_id`: ULID or timestamp + short hash. Segment/node IDs never change between network versions unless the geometry changed; keep a `id_map` file when they must.

---

## Geospatial and unit conventions

- **Storage and computation CRS:** EPSG:32643 (WGS 84 / UTM zone 43N) for Bengaluru metric work. **Web/API output:** EPSG:4326 (convert only at the API boundary). Never mix CRS silently: every loader asserts the CRS.
- Units: **SI only** (m, m³, s, m³/s, mm for rainfall depth). Put the unit in column/variable names where ambiguous (`depth_m`, `flow_cms`, `rain_mm`). Convert at the edges only.
- Time: store **UTC** (ISO 8601), display in IST (UTC+05:30) in the dashboard. Never store naive timestamps.
- Raster: GeoTIFF, nodata explicit, same grid as the conditioned DEM for model outputs.
- Tabular outputs: Parquet. Vector: GeoPackage (not shapefile).

## Provenance and evidence vocabulary (enforced by schema validators)

- `provenance` ∈ {`MEASURED`, `DOCUMENTED`, `ESTIMATED`, `ASSUMED`, `INFERRED`}
- `evidence_status` ∈ {`VERIFIED`, `SUPPORTED`, `DISPUTED`, `UNVERIFIED`}
- `exp_class` ∈ {`A_unit`, `B_synthetic`, `C_historical`}
- `identifiability` ∈ {`STRONGLY_CONSTRAINED`, `WEAKLY_CONSTRAINED`, `NON_IDENTIFIABLE`}

No free-text variants. Add new values only through the Decision Log.

## Reproducibility and run manifests

- **Seeds:** every stochastic function takes an explicit `seed` argument or a `numpy.random.Generator`; no use of the global RNG. Record seeds in the manifest.
- **Run manifest (`manifest.json`)** written by every run/experiment: `run_id, exp_class, git_commit, git_dirty (bool), config_hash, network_version, model_version, param_set_hash, input_file_hashes, seed, software_versions (swmm, pyswmm, torch, gdal), hardware (CPU/GPU), start/end times, runtime_s`.
- Experiments must not run from a dirty git tree for anything that is reported.
- Data files are never committed. `data/MANIFEST.yaml` (URL, access date, licence, SHA-256, CRS) is the source of truth. Use DVC or a simple download script; either way `make data` must recreate `data/` from the manifest (or document manual download steps for gated sources).
