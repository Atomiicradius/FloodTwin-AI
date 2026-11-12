"""Read-only inventory of every raw file: existence, size, SHA-256, MD5, parsed contents."""
import base64, datetime as dt, gzip, hashlib, io, json, sys
from pathlib import Path

import yaml

ROOT = Path(sys.argv[1])
sys.path.insert(0, str(ROOT / "src"))
from floodtwin.geo.kml import read_kml  # noqa: E402

m = yaml.safe_load((ROOT / "data/MANIFEST.yaml").read_text(encoding="utf-8"))
lock = yaml.safe_load((ROOT / "data/MANIFEST.lock.yaml").read_text(encoding="utf-8"))
out = {"checked_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "files": {}}


def digests(p):
    s, m5 = hashlib.sha256(), hashlib.md5()
    with open(p, "rb") as f:
        while b := f.read(1 << 20):
            s.update(b); m5.update(b)
    return s.hexdigest(), m5.hexdigest()


for src in m["sources"]:
    p = ROOT / "data/raw" / src["id"] / src["filename"]
    r = {"path": str(p.relative_to(ROOT)), "exists": p.exists()}
    if p.exists():
        r["bytes"] = p.stat().st_size
        r["sha256"], r["md5"] = digests(p)
        r["md5_b64"] = base64.b64encode(bytes.fromhex(r["md5"])).decode()
        r["sha256_equals_lock"] = r["sha256"] == lock.get(src["id"], {}).get("sha256")
        try:
            fn = src["filename"]
            if fn.endswith(".kml"):
                head = p.read_bytes()[:300].decode("utf-8", "replace")
                g = read_kml(p)
                r["content"] = {
                    "placemarks": len(g),
                    "geom_types": {str(k): int(v) for k, v in g.geom_type.fillna("None").value_counts().items()},
                    "bounds_lonlat": [round(float(x), 4) for x in g.total_bounds],
                    "attributes": [c for c in g.columns if c not in ("geometry", "kml_index")],
                    "kml_namespace_ok": "http://www.opengis.net/kml/2.2" in head,
                    "crs_note": "KML spec: WGS84 lon/lat (EPSG:4326); no CRS override in file",
                }
            elif fn.endswith(".tif"):
                import rasterio
                with rasterio.open(p) as d:
                    tags = d.tags()
                    r["content"] = {"driver": d.driver, "crs": str(d.crs), "size": [d.width, d.height],
                                    "res_deg": list(d.res), "bounds": [round(x, 5) for x in d.bounds],
                                    "dtype": d.dtypes[0], "nodata": d.nodata,
                                    "tags": {k: v for k, v in tags.items()}}
            elif fn.endswith(".hgt.gz"):
                raw = gzip.decompress(p.read_bytes())
                import numpy as np
                n = int(round((len(raw) / 2) ** 0.5))
                a = np.frombuffer(raw, dtype=">i2").reshape(n, n)
                r["content"] = {"decompressed_bytes": len(raw), "grid": [n, n],
                                "expected_SRTM1_grid": [3601, 3601], "void_cells(-32768)": int((a == -32768).sum()),
                                "elev_min_max_m": [int(a[a > -32768].min()), int(a[a > -32768].max())],
                                "crs_note": "SRTM .hgt: geographic WGS84, EGM96 heights; tile SW corner from filename"}
            elif fn.endswith(".csv"):
                txt = p.read_bytes().decode("utf-8-sig", "replace")
                lines = [l for l in txt.splitlines() if l.strip()]
                r["content"] = {"lines": len(lines), "first_lines": lines[:3], "last_line": lines[-1]}
            elif fn.endswith(".json"):
                d = json.loads(p.read_text(encoding="utf-8"))
                from collections import Counter
                r["content"] = {"generator": d.get("generator"), "osm_base": d["osm3s"]["timestamp_osm_base"],
                                "copyright": d["osm3s"].get("copyright"), "elements": len(d["elements"]),
                                "waterway_counts": dict(Counter(e["tags"].get("waterway") for e in d["elements"])),
                                "sample_way_ids": [e["id"] for e in d["elements"][:: max(1, len(d["elements"]) // 5)]][:5]}
            r["readable"] = True
        except Exception as e:  # report, never hide
            r["readable"] = False
            r["error"] = repr(e)
    out["files"][src["id"]] = r

# curated + interim external-service caches
for rel in ["data/curated/news_flood_reports.yaml", "data/interim/geocode_cache.json",
            "data/interim/sentinel1_availability.csv"]:
    p = ROOT / rel
    out["files"][rel] = {"exists": p.exists(), "bytes": p.stat().st_size if p.exists() else None,
                         "sha256": digests(p)[0] if p.exists() else None}
print(json.dumps(out, indent=1, default=str))
