# floodtwin.geo — Role A (GIS & Data)

Turns public raw data into versioned, analysis-ready layers. Owner: Role A.

## Run

```bash
pip install geopandas pyogrio shapely pyproj rasterio pysheds matplotlib pytest   # until Role D pins an env
PYTHONPATH=src python -m floodtwin.geo.fetch            # download + hash-lock every source in data/MANIFEST.yaml
PYTHONPATH=src python -m floodtwin.geo.fetch --verify   # offline hash check
PYTHONPATH=src python -m floodtwin.geo.pipeline         # audit -> terrain -> observations -> evidence -> ranking -> export
PYTHONPATH=src python -m floodtwin.geo.pipeline --catchment <cand_id>   # export a different candidate
PYTHONPATH=src python -m pytest tests/geo tests/evidence
```

`make data` (Role D) should call the first and third commands.

## Modules

| Module | Does |
|---|---|
| `fetch.py` | manifest-driven downloader; writes `data/MANIFEST.lock.yaml` (sha256, bytes, access date); refuses silent upstream changes |
| `kml.py` | streaming KML reader (no GDAL KML driver needed); keeps degenerate geometries for the audit |
| `audit.py` | technical-specs §5.1 checklist: geometry, attributes, duplicates, connectivity vs tolerance, OSM agreement, spot-check sample |
| `network.py` | explode → reject degenerate/duplicates → split T-junctions → snap endpoints → orient by terrain (`INFERRED`) |
| `terrain.py` | DEM mosaic/reprojection to EPSG:32643 30 m, conditioning, D8 + D-inf routing (pysheds), sink depth |
| `catchments.py` | non-nested terrain basins (head-cell rule) and §5.2 scoring |
| `observations.py` | official flood-location lists, KSNDMC gauge register, cited news reports (Nominatim geocoding), Sentinel-1 availability (ASF) |
| `pipeline.py` | runs everything, writes `reports/01_data_audit_numbers.json`, tables and figures |

## Assumptions (all in `configs/geo.yaml`)
- Snap tolerance 5 m; link membership by midpoint; tertiary lines excluded from the model network (evidence only).
- Copernicus GLO-30 selected (DSM: includes buildings/canopy); SRTM kept as comparison.
- Node elevations are DEM *surface* values (`ESTIMATED`), never inverts.
- Flow direction is not in the source data; all directions are `INFERRED` from terrain.
- `floodtwin.common` does not exist yet: `config.py` holds minimal path/hash helpers to be replaced by Role D's `common`.
