"""Flood observations, rain-gauge register and Sentinel-1 availability (Role A).

Three distinct products, never mixed:

* `flood_locations`   official lists of flood-vulnerable / flood-prone / low-lying LOCATIONS
                      (no dates): a behavioural hint, not event observations.
* `flood_observations` event-tagged reports (data-and-contracts.md §6.4) built from the
                      hand-curated, cited file `data/curated/news_flood_reports.yaml`,
                      geocoded with OpenStreetMap Nominatim (locality level -> low confidence).
* `sentinel1_availability` real acquisition metadata from the ASF search API per event.
"""

from __future__ import annotations

import datetime as dt
import io
import json
import logging
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
import shapely
import yaml

from floodtwin.geo.config import REPO_ROOT, raw_path
from floodtwin.geo.kml import read_kml

log = logging.getLogger(__name__)
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
USER_AGENT = "floodtwin-research/0.1 (academic flood-data audit)"

LOCATION_SOURCES = {
    "flood_vulnerable_locations": ("LocationName", "KGIS flood-vulnerable location list"),
    "flood_prone_locations": ("kml_name", "flood-prone location list"),
    "bbmp_low_lying_areas": ("kml_name", "BBMP low-lying area list"),
}


def build_flood_locations(crs: str, dedup_m: float) -> gpd.GeoDataFrame:
    """Merge the three official location lists, keeping every record.

    Records within `dedup_m` of each other (single linkage) share a `location_cluster`.
    """
    frames = []
    for sid, (name_col, label) in LOCATION_SOURCES.items():
        g = read_kml(raw_path(sid))
        frames.append(gpd.GeoDataFrame({
            "loc_id": [f"{sid}:{i}" for i in g["kml_index"]],
            "source_id": sid,
            "source_label": label,
            "name": g[name_col].fillna("").str.strip() if name_col in g else "",
            "ward": g["WARD_NAME"] if "WARD_NAME" in g else None,
            "zone": g["ZONE"] if "ZONE" in g else None,
        }, geometry=g.geometry, crs=g.crs))
    loc = pd.concat(frames, ignore_index=True).to_crs(crs)
    loc = gpd.GeoDataFrame(loc, geometry="geometry", crs=crs)
    bad = loc.geometry.is_empty | loc.geometry.isna()
    if bad.any():
        log.warning("%d flood-location record(s) without usable coordinates: %s", int(bad.sum()),
                    "; ".join(loc.loc[bad, "loc_id"] + " " + loc.loc[bad, "name"]))
    loc.attrs["rejected_no_coordinates"] = loc.loc[bad, ["loc_id", "name"]].to_dict("records")
    loc = loc[~bad].reset_index(drop=True)
    from floodtwin.geo.network import _cluster_points  # union-find clustering
    xy = shapely.get_coordinates(loc.geometry.values)
    loc["location_cluster"] = _cluster_points(xy, dedup_m)
    loc["has_date"] = False
    loc["quality_notes"] = "official location list without event dates; behavioural hint only"
    return loc


def build_rain_stations(crs: str) -> gpd.GeoDataFrame:
    """KSNDMC telemetric rain-gauge locations (Bengaluru Urban)."""
    g = read_kml(raw_path("ksndmc_trg_bengaluru_urban"))
    st = gpd.GeoDataFrame({
        "station_id": "KSNDMC_" + g["DepartmentCode"].astype(str),
        "station_name": g["TM_RainGauge_LocationName"],
        "kgis_code": g["KGISCode"],
        "source_id": "ksndmc_trg_bengaluru_urban",
        "data_access": "location only; 15-min time series not openly downloadable (request from KSNDMC)",
    }, geometry=g.geometry, crs=g.crs).to_crs(crs)
    return st


def read_curated(path: Path | None = None) -> dict:
    """Load the curated news report file."""
    path = path or REPO_ROOT / "data" / "curated" / "news_flood_reports.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def geocode(queries: list[str], cfg: dict, cache_path: Path) -> dict[str, dict | None]:
    """Geocode place names with Nominatim, caching results (one request per second).

    Only the place-name string is sent. Returns query -> {lat, lon, display_name, osm_type,
    osm_id, class, type} or None if not found inside the Bengaluru viewbox.
    """
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    vb = cfg["geocode_viewbox"]
    for q in queries:
        if q in cache:
            continue
        for attempt in range(4):
            r = requests.get(cfg["geocoder_url"], timeout=60, headers={"User-Agent": USER_AGENT},
                             params={"q": q, "format": "jsonv2", "limit": 1, "bounded": 1,
                                     "viewbox": ",".join(str(v) for v in vb)})
            if r.status_code < 500:
                break
            time.sleep(5 * (attempt + 1))  # transient server error: back off and retry
        r.raise_for_status()
        res = r.json()
        cache[q] = ({k: res[0].get(k) for k in ("lat", "lon", "display_name", "osm_type", "osm_id",
                                               "category", "type", "addresstype")} if res else None)
        _save_cache(cache_path, cache)
        time.sleep(cfg["geocoder_min_interval_s"])
    _save_cache(cache_path, cache)
    return cache


def _save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=1, ensure_ascii=False), encoding="utf-8")


def _to_utc(ts: str) -> tuple[pd.Timestamp, str]:
    if "T" in ts:
        t = dt.datetime.fromisoformat(ts).replace(tzinfo=IST)
        return pd.Timestamp(t.astimezone(dt.timezone.utc)), "publication_time_upper_bound"
    t = dt.datetime.fromisoformat(ts).replace(tzinfo=IST)
    return pd.Timestamp(t.astimezone(dt.timezone.utc)), "date_only"


def build_flood_observations(curated: dict, geocodes: dict, crs: str) -> gpd.GeoDataFrame:
    """Event-tagged observation table (contract §6.4) from curated reports.

    `event_id` is `<YYYYMMDD>_bengaluru` (city-level; catchment-specific ids are assigned
    after catchment selection). Rows whose geocode failed are kept with empty geometry and
    `confidence = low` so the gap is visible.
    """
    rows, geoms = [], []
    for k, rep in enumerate(curated["reports"]):
        gc = geocodes.get(rep["query"]) if rep.get("query") else None
        ts, prec = _to_utc(rep["timestamp_ist"])
        notes = [f"timestamp={prec}", "geocoded to OSM feature (locality/road level), not the exact flooded spot"]
        if rep.get("geocode_note"):
            notes.append("geocode note: " + rep["geocode_note"])
        if rep.get("depth_note"):
            notes.append("depth note: " + rep["depth_note"])
        if gc:
            notes.append(f"OSM {gc['osm_type']}/{gc['osm_id']} {gc.get('addresstype')}: {gc['display_name']}")
            geoms.append(shapely.Point(float(gc["lon"]), float(gc["lat"])))
        else:
            notes.append("GEOCODE_SKIPPED" if not rep.get("query") else "GEOCODE_FAILED")
            geoms.append(shapely.Point())
        rows.append({
            "obs_id": f"news_{rep['event_ref']}_{k:03d}",
            "event_id": f"{rep['event_ref']}_bengaluru",
            "timestamp_utc": ts,
            "observation_type": rep["observation_type"],
            "depth_m": rep.get("depth_m_reported"),
            "source": rep["place"],
            "source_url": rep["source_url"],
            "confidence": "low",
            "quality_notes": "; ".join(notes),
        })
    g = gpd.GeoDataFrame(rows, geometry=geoms, crs="EPSG:4326").to_crs(crs)
    g["depth_m"] = g["depth_m"].astype("float64")
    return g


def sentinel1_availability(curated: dict, aoi_wkt: str, cfg: dict) -> pd.DataFrame:
    """Query ASF for Sentinel-1 GRD acquisitions around each event (real metadata only).

    Window = [nominal_start - window_before_h, nominal_start + window_after_h]. The verdict
    never says "usable": image quality and urban artefacts require visual inspection.
    """
    rows = []
    for ev in curated["events"]:
        t0 = dt.datetime.fromisoformat(ev["nominal_start_ist"]).replace(tzinfo=IST).astimezone(dt.timezone.utc)
        start = t0 - dt.timedelta(hours=cfg["window_before_h"])
        end = t0 + dt.timedelta(hours=cfg["window_after_h"])
        params = {"platform": "SENTINEL-1", "processingLevel": cfg["processing_level"],
                  "intersectsWith": aoi_wkt, "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"), "output": "csv"}
        r = requests.get(cfg["asf_search_url"], params=params, timeout=cfg["request_timeout_s"],
                         headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text)) if r.text.strip() else pd.DataFrame()
        if df.empty:
            rows.append({"event_ref": ev["event_ref"], "granule": None, "verdict": "NO_ACQUISITION_IN_WINDOW",
                         "window_start_utc": start.isoformat(), "window_end_utc": end.isoformat()})
            continue
        for _, a in df.drop_duplicates("Granule Name").iterrows():
            ta = pd.Timestamp(a["Start Time"]).tz_localize("UTC") if pd.Timestamp(a["Start Time"]).tzinfo is None else pd.Timestamp(a["Start Time"])
            lag = (ta - pd.Timestamp(t0)).total_seconds() / 3600
            rows.append({
                "event_ref": ev["event_ref"], "granule": a["Granule Name"], "platform": a["Platform"],
                "acq_start_utc": ta.isoformat(), "lag_h_from_nominal_start": round(lag, 1),
                "flight_direction": a.get("Ascending or Descending?"), "path": a.get("Path Number"),
                "frame": a.get("Frame Number"), "beam_mode": a.get("Beam Mode"),
                "window_start_utc": start.isoformat(), "window_end_utc": end.isoformat(),
                "timing": ("PRE_EVENT" if lag < 0 else "POST_START_WITHIN_24H" if lag <= 24 else "POST_START_AFTER_24H"),
                "verdict": "ACQUISITION_IN_WINDOW_QUALITY_NOT_INSPECTED",
            })
    return pd.DataFrame(rows)
