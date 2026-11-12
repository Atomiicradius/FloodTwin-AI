"""Read-only checks of inputs that came from external services or curation."""
import datetime as dt, io, json, re, sys, time, unicodedata
from pathlib import Path

import pandas as pd
import requests
import yaml

ROOT = Path(sys.argv[1])
UA = {"User-Agent": "floodtwin-provenance-audit/0.1 (academic)"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
now = lambda: dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
out = {}

# 1. Sentinel-1: compare our stored granules with (a) a fresh ASF query by granule name and
#    (b) the Copernicus Data Space Ecosystem (ESA) catalogue, an independent publisher.
s1 = pd.read_csv(ROOT / "data/interim/sentinel1_availability.csv", dtype={"event_ref": str})
res = []
for _, r in s1.dropna(subset=["granule"]).iterrows():
    g = r["granule"]
    rec = {"granule": g, "stored_start_utc": r["acq_start_utc"], "checked_utc": now()}
    try:
        a = requests.get("https://api.daac.asf.alaska.edu/services/search/param",
                         params={"granule_list": g, "output": "json"}, timeout=120, headers=UA).json()
        items = [x for sub in a for x in sub] if a and isinstance(a[0], list) else a
        rec["asf_found"] = len(items) > 0
        rec["asf_start"] = items[0].get("startTime") if items else None
    except Exception as e:
        rec["asf_error"] = repr(e)[:150]
    try:
        q = requests.get("https://catalogue.dataspace.copernicus.eu/odata/v1/Products",
                         params={"$filter": f"startswith(Name,'{g}')", "$top": "5"}, timeout=120, headers=UA).json()
        v = q.get("value", [])
        rec["cdse_found"] = len(v) > 0
        rec["cdse_name"] = v[0]["Name"] if v else None
        rec["cdse_start"] = v[0]["ContentDate"]["Start"] if v else None
    except Exception as e:
        rec["cdse_error"] = repr(e)[:150]
    res.append(rec)
# the no-acquisition verdict for 20250518: re-check in CDSE independently (S1A and S1C)
try:
    w = "POLYGON((77.46 12.83,77.79 12.83,77.79 13.15,77.46 13.15,77.46 12.83))"
    q = requests.get("https://catalogue.dataspace.copernicus.eu/odata/v1/Products", timeout=120, headers=UA, params={
        "$filter": ("Collection/Name eq 'SENTINEL-1' and OData.CSC.Intersects(area=geography'SRID=4326;" + w + "') "
                    "and ContentDate/Start gt 2025-05-17T12:30:00.000Z and ContentDate/Start lt 2025-05-21T12:30:00.000Z"),
        "$top": "50"}).json()
    res.append({"check": "CDSE: any S1 product over BBMP bbox 2025-05-17T12:30Z..2025-05-21T12:30Z",
                "checked_utc": now(), "n_products": len(q.get("value", [])),
                "names": [x["Name"] for x in q.get("value", [])][:10]})
except Exception as e:
    res.append({"check": "CDSE 2025 window", "error": repr(e)[:150]})
out["sentinel1"] = res

# 2. Geocodes: re-query a sample of cached queries and compare OSM ids
cache = json.loads((ROOT / "data/interim/geocode_cache.json").read_text(encoding="utf-8"))
geo = []
for q in sorted(cache)[:]:
    v = cache[q]
    if v is None:
        geo.append({"query": q, "cached": None}); continue
    try:
        r = requests.get("https://nominatim.openstreetmap.org/search", timeout=60, headers=UA,
                         params={"q": q, "format": "jsonv2", "limit": 1, "bounded": 1,
                                 "viewbox": "77.40,13.20,77.85,12.78"}).json()
        geo.append({"query": q, "cached_osm": f"{v['osm_type']}/{v['osm_id']}",
                    "now_osm": f"{r[0]['osm_type']}/{r[0]['osm_id']}" if r else None,
                    "same": bool(r) and str(r[0]["osm_id"]) == str(v["osm_id"])})
    except Exception as e:
        geo.append({"query": q, "error": repr(e)[:120]})
    time.sleep(1.2)
out["geocodes"] = geo

# 3. Curated news reports: does each cited article (still) contain the quoted place name?
cur = yaml.safe_load((ROOT / "data/curated/news_flood_reports.yaml").read_text(encoding="utf-8"))
pages = {}
def norm(s):
    s = unicodedata.normalize("NFKD", s).lower()
    return re.sub(r"[^a-z0-9]+", " ", s)
for url in sorted({r["source_url"] for r in cur["reports"]}):
    t = now()
    try:
        r = requests.get(url, timeout=60, headers=BROWSER_UA)
        pages[url] = {"checked_utc": t, "status": r.status_code, "text": norm(re.sub(r"<[^>]+>", " ", r.text)) if r.ok else ""}
    except Exception as e:
        pages[url] = {"checked_utc": t, "status": None, "error": repr(e)[:120], "text": ""}
rep = []
for r in cur["reports"]:
    p = pages[r["source_url"]]
    place = norm(r["place"]).strip()
    tokens = [w for w in place.split() if len(w) > 2 and w not in ("in", "the", "road", "layout", "bengaluru")]
    full = place in p["text"]
    rep.append({"event_ref": r["event_ref"], "place": r["place"], "url": r["source_url"], "http": p["status"],
                "exact_phrase_found": full,
                "all_key_tokens_found": all(t in p["text"] for t in tokens) if p["text"] else None,
                "depth_m_reported": r.get("depth_m_reported")})
out["articles"] = {"pages": {u: {k: v for k, v in d.items() if k != "text"} for u, d in pages.items()}, "reports": rep}

# 4. OSM snapshot: do sampled way ids exist in the live OSM API with the same waterway tag?
osm = json.loads((ROOT / "data/raw/osm_waterways_snapshot/osm_waterways.json").read_text(encoding="utf-8"))
els = osm["elements"]
sample = [els[i] for i in range(0, len(els), max(1, len(els) // 10))][:10]
chk = []
for e in sample:
    try:
        r = requests.get(f"https://api.openstreetmap.org/api/0.6/way/{e['id']}.json", timeout=60, headers=UA)
        tags = r.json()["elements"][0].get("tags", {}) if r.ok else {}
        chk.append({"way": e["id"], "http": r.status_code, "snapshot_waterway": e["tags"].get("waterway"),
                    "live_waterway": tags.get("waterway")})
    except Exception as ex:
        chk.append({"way": e["id"], "error": repr(ex)[:100]})
    time.sleep(1)
out["osm_sample"] = chk
print(json.dumps(out, indent=1, default=str))
