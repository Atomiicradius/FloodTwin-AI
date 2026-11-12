# data/ (owner: Role A)

Only `MANIFEST.yaml`, `MANIFEST.lock.yaml`, `curated/` and this README are tracked. Everything
else is regenerated:

```bash
PYTHONPATH=src python -m floodtwin.geo.fetch      # raw/  (17 public sources, hash-locked)
PYTHONPATH=src python -m floodtwin.geo.pipeline   # interim/ and processed/
```

| Path | Contents |
|---|---|
| `raw/<source_id>/` | untouched downloads listed in `MANIFEST.yaml` |
| `curated/news_flood_reports.yaml` | hand-curated, **cited** event reports (place names quoted from articles) |
| `interim/terrain/` | AOI DEMs (Copernicus, SRTM) on the EPSG:32643 30 m grid, conditioned DEM, D8/D-inf routing, sink depth, candidate basins |
| `interim/geocode_cache.json`, `interim/sentinel1_availability.csv` | cached responses from external services (Nominatim, ASF) |
| `processed/bengaluru/` | city layers: `network_city_v1.gpkg`, `flood_locations.gpkg`, `rain_stations.gpkg`, `flood_observations.parquet`, `event_candidates.csv`, `sentinel1_availability.csv`, `candidate_catchments.gpkg` |
| `processed/<catchment_id>/` | Role B handoff: `network_v1.gpkg` (nodes, links, rejected, catchment), `terrain/`, observations, `manifest.json`, `README.md` |

All vector and raster products use EPSG:32643 and SI units. Timestamps are UTC.
