"""Read-only remote checks: URL status, server-side checksums, independent copies."""
import datetime as dt, json, sys, time
from pathlib import Path

import requests
import yaml

ROOT = Path(sys.argv[1])
local = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))["files"]
m = yaml.safe_load((ROOT / "data/MANIFEST.yaml").read_text(encoding="utf-8"))
UA = {"User-Agent": "floodtwin-provenance-audit/0.1"}
now = lambda: dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
out = {"url_checks": [], "independent": {}}


def probe(url, attempts=2):
    last = None
    for k in range(attempts):
        t = now()
        try:
            with requests.get(url, stream=True, timeout=45, headers=UA, allow_redirects=True) as r:
                first = next(r.iter_content(512), b"")
                return {"url": url, "checked_utc": t, "status": r.status_code,
                        "content_type": r.headers.get("Content-Type"), "content_length": r.headers.get("Content-Length"),
                        "final_url": r.url, "first_bytes": first[:80].decode("latin-1")}
        except Exception as e:
            last = {"url": url, "checked_utc": t, "status": None, "error": type(e).__name__ + ": " + str(e)[:160]}
        time.sleep(3)
    return last


for s in m["sources"]:
    for kind in ("url", "dataset_page"):
        r = probe(s[kind])
        r.update(source_id=s["id"], kind=kind)
        out["url_checks"].append(r)
for extra in ["https://data.opencity.in", "https://olddata.opencity.in",
              "https://data.opencity.in/api/3/action/status_show"]:
    r = probe(extra); r.update(source_id="(site)", kind="site"); out["url_checks"].append(r)

# --- S3 server-side ETag (single-part uploads: ETag == MD5 of object) for DEM tiles
for s in m["sources"]:
    if s["kind"] != "dem":
        continue
    t = now()
    try:
        h = requests.head(s["url"], timeout=60, headers=UA)
        etag = h.headers.get("ETag", "").strip('"')
        out["independent"].setdefault(s["id"], {})["aws_head"] = {
            "checked_utc": t, "status": h.status_code, "etag": etag,
            "content_length": h.headers.get("Content-Length"), "last_modified": h.headers.get("Last-Modified"),
            "etag_is_md5_form": "-" not in etag and len(etag) == 32,
            "etag_equals_local_md5": etag == local[s["id"]]["md5"],
            "length_equals_local": str(local[s["id"]]["bytes"]) == h.headers.get("Content-Length")}
    except Exception as e:
        out["independent"].setdefault(s["id"], {})["aws_head"] = {"checked_utc": t, "error": repr(e)}

# --- Microsoft Planetary Computer: separate distribution of Copernicus GLO-30
for sid, item in [("dem_cop30_n12e077", "Copernicus_DSM_COG_10_N12_00_E077_00_DEM"),
                  ("dem_cop30_n13e077", "Copernicus_DSM_COG_10_N13_00_E077_00_DEM")]:
    t = now()
    rec = {"checked_utc": t}
    try:
        it = requests.get(f"https://planetarycomputer.microsoft.com/api/stac/v1/collections/cop-dem-glo-30/items/{item}",
                          timeout=60, headers=UA).json()
        href = it["assets"]["data"]["href"]
        rec["stac_item"] = item
        rec["asset_href"] = href
        rec["stac_properties"] = {k: it["properties"].get(k) for k in ("datetime", "platform", "gsd", "proj:epsg")}
        signed = requests.get("https://planetarycomputer.microsoft.com/api/sas/v1/sign", params={"href": href},
                              timeout=60, headers=UA).json()["href"]
        h = requests.head(signed, timeout=60, headers=UA)
        rec.update(status=h.status_code, content_md5_b64=h.headers.get("Content-MD5"),
                   content_length=h.headers.get("Content-Length"), etag=h.headers.get("ETag"))
        rec["md5_equals_local"] = h.headers.get("Content-MD5") == local[sid]["md5_b64"]
        rec["length_equals_local"] = h.headers.get("Content-Length") == str(local[sid]["bytes"])
    except Exception as e:
        rec["error"] = repr(e)
    out["independent"].setdefault(sid, {})["planetary_computer"] = rec

print(json.dumps(out, indent=1, default=str))
