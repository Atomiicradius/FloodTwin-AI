# 02 — Source Provenance and Authenticity Audit (Role A)

**Date of checks:** 2026-11-12, 10:14–10:35 UTC (times per check are in the evidence file)
**Scope:** all 17 raw sources in `data/MANIFEST.yaml`, the curated news file, the two cached external-service responses, and how each feeds the processed outputs.
**Method:** read-only. No raw file, config or processed output was created, changed, regenerated or deleted.
- Scripts: `reports/02_audit_scripts/`
- Raw evidence (HTTP statuses, headers, checksums, parse results, re-query results): `reports/02_source_provenance_evidence.json`
- Synthetic or placeholder data: none was found or used anywhere in the raw inputs.

## 0. Verification standard used

A checksum matching our own `MANIFEST.lock.yaml` only shows the file has not changed since we downloaded it. It is **not** treated as verification. A dataset is labelled:

| Label | Meaning |
|---|---|
| **VERIFIED (independent copy)** | Bytes or pixels are identical to a copy obtained independently from a different distributor of the same publisher's product |
| **VERIFIED (distributor checksum)** | Bytes match a checksum computed by the distributor's server (an S3 ETag). This confirms an exact copy of what that distributor serves; it does not check further upstream |
| **PARTIALLY VERIFIED** | A sample of the content was independently confirmed; the file as a whole cannot be |
| **UNVERIFIED** | No independent checksum or copy could be obtained. Everything else said about the file is plausibility evidence, not authentication |

## 1. Summary

| # | Dataset (manifest id) | Original publisher → distributor | Source URL status 2026-11-12 | Local file (bytes, SHA-256 prefix) | Independent evidence | **Verdict** |
|---|---|---|---|---|---|---|
| 1 | `swd_primary_2022` | KSRSAC → OpenCity | **502** (file), **502** (page) | 494,239 · `43063312663e` | Size equals OpenCity catalogue `size` (seen 2026-11-11, not archived); 67 % of length within 30 m of independent OSM waterways | **UNVERIFIED** |
| 2 | `swd_secondary_2022` | KSRSAC → OpenCity | **502** / timeout | 1,262,361 · `57bbe5346eb2` | Catalogue size match; 33 % within 30 m of OSM | **UNVERIFIED** |
| 3 | `swd_tertiary_2022` | KSRSAC → OpenCity | **502** / **502** | 24,737,864 · `6cc55e74b965` | Catalogue size match; 14 % within 30 m of OSM | **UNVERIFIED** |
| 4 | `swd_all_2022` | KSRSAC → OpenCity | **502** / **502** | 27,465,279 · `f6d58112c467` | Catalogue size match; feature counts equal the sum of rows 1–3 | **UNVERIFIED** |
| 5 | `dem_cop30_n12e077` | ESA/DLR/Airbus → AWS Open Data | **200** / **200** | 41,962,096 · `a58736cc901e` | AWS ETag (single-part MD5) = local MD5; pixels identical to Microsoft Planetary Computer copy over the Bengaluru window | **VERIFIED (independent copy)** |
| 6 | `dem_cop30_n13e077` | ESA/DLR/Airbus → AWS Open Data | **200** / **200** | 39,995,768 · `3bacdbc63c1a` | AWS ETag = local MD5; pixels identical to Planetary Computer copy | **VERIFIED (independent copy)** |
| 7 | `dem_srtm_n12e077` | NASA/USGS SRTM → Mapzen/AWS Terrain Tiles ("skadi") | **200** / **200** | 11,122,631 · `9485ba04696b` | S3 multipart ETag rebuilt from local bytes (8 MiB parts) and matches | **VERIFIED (distributor checksum)**; NASA original not checked |
| 8 | `dem_srtm_n13e077` | same | **200** / **200** | 8,955,167 · `9df6fb12a3a1` | multipart ETag match (8 MiB parts) | **VERIFIED (distributor checksum)**; NASA original not checked |
| 9 | `flood_vulnerable_locations` | KGIS/BBMP (per attributes) → OpenCity | **502** / **502** | 106,139 · `a10ee4c2b647` | Catalogue size match only | **UNVERIFIED** |
| 10 | `flood_prone_locations` | OpenCity (compiler) | **502** / timeout | 22,370 · `b9a2df47c412` | Catalogue size match only | **UNVERIFIED** |
| 11 | `bbmp_low_lying_areas` | BBMP → OpenCity | **502** / timeout | 40,900 · `72e0cea9feba` | Catalogue size match only; contains 1 record with `nan,nan` coordinates | **UNVERIFIED** |
| 12 | `ksndmc_trg_bengaluru_urban` | KSNDMC/KGIS → OpenCity | **502** / timeout | 145,024 · `ca32979be4f6` | Catalogue size match; KGIS codes present | **UNVERIFIED** |
| 13 | `ksndmc_aws_bengaluru_list` | KSNDMC → OpenCity | **502** / **502** | 13,661 · `f62be0a4dda5` | Catalogue size match | **UNVERIFIED** (not used by the pipeline) |
| 14 | `bbmp_zones_2022` | BBMP → OpenCity | **502** / timeout | 351,558 · `a4cb73bd5785` | Catalogue size match; 8 zones, as named in BBMP | **UNVERIFIED**; licence not stated |
| 15 | `bbmp_wards_2022` | BBMP → OpenCity | **502** / **502** | 2,093,582 · `8ee0268d9956` | Catalogue size match; 243 wards = the 2022 ward count | **UNVERIFIED**; licence not stated |
| 16 | `osm_waterways_snapshot` | OpenStreetMap contributors → Overpass API | **200** / **200** | 2,277,299 · `521784f992dd` | 10/10 sampled way IDs exist in the live OSM API with the same `waterway` tag | **PARTIALLY VERIFIED** (sample; snapshot bytes cannot be re-obtained) |
| 17 | `imd_bengaluru_monthly_rain` | IMD → OpenCity (compiled) | **502** / **502** | 9,155 · `dab8758dc9df` | Annual totals 2017 = 1,696.0 mm and 2022 = 1,957.7 mm agree with IMD figures reported by the press | **UNVERIFIED** (two values corroborated; not used by the pipeline) |
| — | `data/curated/news_flood_reports.yaml` | Role A curation from 5 cited articles | 5/5 articles **200** | 10,826 · `e2a573cc30c1` | 27/27 place names found in the cited article text; all quoted rainfall figures found verbatim | **VERIFIED against cited sources**, with 2 attribution issues (§4.3) |
| — | `data/interim/sentinel1_availability.csv` | ASF (NASA) query result | ASF **200** | 1,031 · `abe945676a11` | 3/3 granules re-found by name in ASF **and** in ESA Copernicus Data Space; ESA also has 0 products in the 2025 window | **VERIFIED (independent catalogue)** |
| — | `data/interim/geocode_cache.json` | OSM Nominatim responses | Nominatim **200** | 8,857 · `9603256c97c3` | 21/23 queries return the same OSM feature today; 2 now return a different node, 252 m and 59 m away | **PARTIALLY REPRODUCIBLE** (OSM changes over time) |

**Count:** 2 VERIFIED (independent copy) · 2 VERIFIED (distributor checksum) · 1 PARTIALLY VERIFIED · **12 UNVERIFIED**. All 12 UNVERIFIED files come from OpenCity, which was unreachable for the whole audit window. Of these, 10 feed the pipeline and 2 do not. Every raw file exists locally, opens, and parses (§3).

## 2. Broken links (2026-11-12)

| Host | Result | Affected manifest ids |
|---|---|---|
| `data.opencity.in` (file downloads, dataset pages, homepage, CKAN `status_show` API) | **HTTP 502 Bad Gateway** or read timeout after 45 s, on two attempts each | 1–4, 9–15, 17 (24 URLs) |
| `olddata.opencity.in` (OpenCity's legacy instance, tried as an alternative) | connect timeout | — |
| Wayback Machine (`archive.org/wayback/available` and the CDX index) | **no snapshot exists** for any of the 12 OpenCity file URLs | — |

The failure is host-wide (the homepage returns 502), so it is an outage, not a wrong path. The same URLs returned HTTP 200 and the files on 2026-11-11 14:02–14:04 UTC. However, the fetcher did **not** record HTTP status or response headers at download time. The only evidence of those 200 responses is this working session's log, not a file in the repository (issue I-2).

**Legitimate alternative sources searched:**
- OpenCity legacy instance: down.
- Web archive: no copies.
- GitHub/DataMeet: no copies found.

KSRSAC, KSNDMC and BBMP do not publish these exact files for direct download, as far as I could find. **No alternative source exists for rows 1–4 and 9–15, so they stay UNVERIFIED.** When `data.opencity.in` is back, re-download each file to a separate folder and compare SHA-256 with the lock (§6, action A-1).

## 3. Per-file content inspection (local, read-only)

All files exist and parse without error. The drain and location files (KML) state no CRS; the KML specification defines them as WGS 84 lon/lat (EPSG:4326), and every bounding box below is consistent with Bengaluru.

| id | Contents | CRS | Coverage (lon/lat bounds) | Attributes / metadata |
|---|---|---|---|---|
| swd_primary_2022 | 163 Placemarks, all MultiLineString (single part) | EPSG:4326 | 77.471–77.779 E, 12.840–13.142 N | `OBJECTID`, `Length`, `SHAPE_Leng`, `Shape.STLength()`; schema name `swd_primary` |
| swd_secondary_2022 | 870 MultiLineString | 4326 | 77.474–77.778, 12.839–13.133 | as above + `Bengaluru_GIS.DBO.SWD_Secondary.area` (an ArcSDE table name, consistent with a government GIS export) |
| swd_tertiary_2022 | 5,806: 5,794 LineString, 8 Multi, 4 null | 4326 | 77.461–77.781, 12.838–13.138 | CAD fields: `Layer=Line_Water`, `Entity`, `Linetype` (incl. FOOTPATH-*, CART-TRACK-2) |
| swd_all_2022 | 6,839 (= 163 + 870 + 5,806) | 4326 | union of the above | `Type` (Primary/Secondary/Tertiary) and `path` = "D:/OpenCity/Files to Upload/Uploaded Files/KSRSAC Maps/…": OpenCity's own record of the KSRSAC files it uploaded |
| dem_cop30_n12e077 | GeoTIFF COG 3600×3600 float32 | EPSG:4326 | 77.0–78.0 E, 12.0–13.0 N | Planetary Computer STAC: platform TanDEM-X, gsd 30 m; AWS Last-Modified 2022-05-09 |
| dem_cop30_n13e077 | same | 4326 | 77.0–78.0 E, 13.0–14.0 N | same; AWS Last-Modified 2022-05-09 |
| dem_srtm_n12e077 | gzip → 25,934,402 bytes = 3601×3601 int16 (the SRTM 1″ grid), 0 voids, 233–1,505 m | WGS 84 geographic, EGM96 | 77–78 E, 12–13 N | AWS Last-Modified 2016-04-26. Zero voids means this is a **void-filled product**, not raw SRTM GL1 (issue I-5) |
| dem_srtm_n13e077 | same grid, 0 voids, 579–1,474 m | same | 77–78 E, 13–14 N | AWS Last-Modified 2016-04-27 |
| flood_vulnerable_locations | 200 Points | 4326 | 77.478–77.747, 12.868–13.110 | `WARD_NAME`, `WARDNO`, `LocationName`, `KGISFVLID`, `ZONE` (a KGIS identifier) |
| flood_prone_locations | 70 Points | 4326 | 77.483–77.682, 12.871–13.048 | name + `OBJECTID` only |
| bbmp_low_lying_areas | 129 Points (1 with literal `nan,nan`) | 4326 | 77.482–77.763, 12.858–13.107 | name + `OBJECTID` |
| ksndmc_trg_bengaluru_urban | 185 Points | 4326 | 77.346–77.823, 12.671–13.199 (all of Bengaluru Urban district) | `KGISCode`, `DepartmentCode`, `TM_RainGauge_LocationName`, `KGISVillageID` |
| ksndmc_aws_bengaluru_list | CSV, 197 rows, no coordinates | — | Bengaluru Urban + Rural districts | Header reads "List of Telemetric Rain guages installed", **not** AWS (issue I-6) |
| bbmp_zones_2022 | 8 (5 Polygon, 3 MultiPolygon) | 4326 | 77.460–77.784, 12.834–13.143 | `Zone` names |
| bbmp_wards_2022 | 243 (242 Polygon, 1 Multi) | 4326 | 77.460–77.784, 12.834–13.143 | `WardName`, `WardNo`, `LGD_WardCode`, `TownCode=2003` |
| osm_waterways_snapshot | Overpass JSON, 2,838 ways (2,455 drain, 249 stream, 101 ditch, 33 river) | 4326 | query bbox 77.46–77.79, 12.83–13.15 | generator "Overpass API 0.7.62.11", `timestamp_osm_base` 2026-11-11T14:41:51Z, ODbL notice |
| imd_bengaluru_monthly_rain | CSV, 1901–2025 + two LPA rows | — | city (station not named in file) | monthly mm, totals, ENSO flags; the IMD station is not stated (issue I-7) |

## 4. Independent-verification details

### 4.1 Copernicus DEM (rows 5–6): VERIFIED
1. **AWS ETag.** A `HEAD` request returns a 32-hex ETag with no `-N` suffix, which means a single-part upload whose ETag is the object's MD5. N12: `1c604ac0b0d713916605b03ac7d9dcfd`. N13: `43352dd0417605e1a36cb51d64089770`. Both equal the local MD5 exactly, and the lengths match.
2. **Independent distributor.** Microsoft Planetary Computer, collection `cop-dem-glo-30`, items `Copernicus_DSM_COG_10_N1{2,3}_00_E077_00_DEM`. Its files are 360 bytes smaller (re-packaged COGs, so not a byte copy). Over the window 77.44–77.81 E, 12.81–13.17 N, which covers the entire area the pipeline uses, the pixel arrays are **identical** (max abs diff 0.0; 684×1332 and 612×1332 px) and the geotransforms are equal.

### 4.2 SRTM tiles (rows 7–8): VERIFIED against the distributor only
The S3 ETags are multipart (`…-2`). I rebuilt them from local bytes with 8 MiB parts and both match exactly, so the local files are byte-identical to what AWS Terrain Tiles serves. **Not verified against NASA/USGS:** the originals (LP DAAC, OpenTopography) need a login or an API key, which were not used. The files have 0 voids, so they are Mapzen's void-filled "skadi" derivative of SRTM, and the manifest title "SRTM GL1" is imprecise (I-5). These tiles are used only to compare against Copernicus, never for routing.

### 4.3 Curated news reports: VERIFIED against cited sources, with two attribution issues
All 5 article URLs returned HTTP 200 on 2026-11-12, and all 27 place names occur in the text of their cited article. These rainfall figures appear verbatim:
- 2022 article: 131 mm, 129 mm, 125 mm, 65 mm;
- 2025 article: 105.5 mm, 132 mm, 125.8 mm.

Depth statements:
- **S.T. Bed Layout:** "…submerged the main road leading into S.T. Bed Layout… at least a foot of water". Matches `depth_m_reported: 0.30` as a minimum.
- **Kendriya Vihar:** the article quotes "Inundation in Kendriya Vihar is up to six feet", which matches `1.83` as an upper bound. **Issue I-8:** our `depth_note` names the speaker as the BBMP Chief Commissioner, but I could not confirm the speaker from the article text in this audit.
- **Vidyaranyapura:** the sentence says lake overflow flooded "areas like Vidyaranyapura, where waterlogging reached up to four feet inside homes and on roads in Kuvempu Nagar and Basava Samithi…". **Issue I-9:** the 4 ft figure may refer to Kuvempu Nagar and Basava Samithi rather than Vidyaranyapura, so assigning `1.22 m` to Vidyaranyapura is one possible reading.
- Rainfall notes in the curated file marked "not verified here" (≈ 128.7 mm in 2017, ≈ 190 mm for Yelahanka in 2024) remain **UNVERIFIED**. They are not used in any computation.

### 4.4 Sentinel-1 availability: VERIFIED (independent catalogue)
All 3 stored granules (`…20170814T003947…04BC`, `…20220905T004028…85F8`, `…20241024T004029…8127`) were found again by exact name in ASF and in ESA's Copernicus Data Space Ecosystem, with start times matching to under 1 s. For 18–19 May 2025, ESA's catalogue independently returns **0** Sentinel-1 products over the BBMP bbox (2025-05-17T12:30Z to 2025-05-21T12:30Z), which confirms the "no acquisition" verdict.

### 4.5 Geocodes: PARTIALLY REPRODUCIBLE
21 of 23 cached queries return the same OSM object today. `Bhadrappa Layout, Bengaluru` now returns a different node 252 m away, and `Kodigehalli Gate, Bengaluru` one 59 m away, because OSM has been edited since. The cache is what the pipeline uses, so outputs stay reproducible from the repository. A fresh geocode would move these two points slightly. Every observation keeps `confidence = low` (locality level).

### 4.6 OSM snapshot: PARTIALLY VERIFIED
Overpass results reflect the live database and cannot be reproduced byte for byte later. A systematic sample of 10 way IDs (every ~283rd element) all exist in the live OSM API (`api.openstreetmap.org`) with the same `waterway` value.

### 4.7 OpenCity files (rows 1–4, 9–15, 17): UNVERIFIED
**What is known:**
- The files were downloaded from the publisher's own URLs on 2026-11-11.
- Each byte size equals the `size` field OpenCity's CKAN API returned the same day. That response was not saved to the repository (I-2), and file size is weak evidence: it is not a checksum.
- The contents are internally consistent with their stated origin (KGIS identifiers, `Bengaluru_GIS.DBO.*` table names, OpenCity's upload path naming "KSRSAC Maps"), and their extents match the BBMP boundary.
- Primary drains agree in position with independent OSM mapping (51 % within 15 m, 67 % within 30 m).

**What is not known:** whether the bytes equal what KSRSAC/BBMP/KSNDMC/IMD originally produced. No publisher checksum exists, no second copy could be found, and OpenCity itself could not be re-queried.

## 5. Lineage: raw file → processing → outputs

All processing is in `src/floodtwin/geo/pipeline.py`; numbers are from the 2026-11-12 run (`reports/01_data_audit_numbers.json`).

| Raw source | Read by | Transformations | Outputs that depend on it |
|---|---|---|---|
| swd_primary, swd_secondary (UNVERIFIED) | `stage_audit` → `stage_network` | KML parse → EPSG:32643 → explode → reject 6 zero-length → split 273 T-junctions → snap at 5 m (1 self-loop rejected) → orient by DEM → evidence indicators | `network_city_v1.gpkg` (nodes, links, rejected); `domlur_a25_b13/network_v1.gpkg`; candidate drainage and network-size scores; report-01 §2 and §6; figures 01_inventory, 01_connectivity, 01_evidence_*, 01_selected |
| swd_tertiary (UNVERIFIED) | `stage_audit`, `stage_network` | parse, explode; audit statistics only | `network_city_v1.gpkg:tertiary_evidence_only`; `tertiary_len_km` column (informational, not scored); report-01 §2 |
| swd_all (UNVERIFIED) | `stage_audit` | parse; consistency check only | report-01 §2 (counts) only |
| dem_cop30 ×2 (VERIFIED) | `stage_terrain` | mosaic → bilinear reprojection to the 30 m EPSG:32643 AOI grid → pysheds fill / resolve flats → D8, D-inf, accumulation, sink depth | `data/interim/terrain/*`; every terrain evidence indicator; node `elev_m`; link direction; candidate basins at all scales; `domlur_a25_b13/terrain/*`; catchment polygon |
| dem_srtm ×2 (VERIFIED, distributor) | `stage_terrain` | gunzip to `data/interim/tiles/*.hgt` → reprojection | `dem_srtm_utm.tif`, `cop_minus_srtm.tif`; candidate terrain score (`cop_srtm_mad_m`); figure 01_dem_difference. **Not used for routing** |
| flood_vulnerable, flood_prone, low_lying (UNVERIFIED) | `stage_observations` | merge; drop 1 `nan,nan` record (logged); 50 m clustering | `flood_locations.gpkg` (city and catchment); `historical_evidence` indicator (weight 0, appears in notes only); candidate flood-observation score |
| ksndmc_trg (UNVERIFIED) | `stage_observations` | parse → `rain_stations.gpkg` | candidate rain-gauge score (distance within 2 km / 5 km) |
| bbmp_zones_2022 (UNVERIFIED) | `stage_terrain`, `stage_network`, `stage_observations` | union → BBMP boundary | AOI extent; candidate inside-BBMP filter; 500 m edge zone for `terminal_plausibility`; Sentinel-1 query bbox |
| bbmp_wards_2022 (UNVERIFIED) | `stage_catchments` | point-in-polygon of basin outlet | candidate **names** only (e.g. "domlur") |
| osm_waterways_snapshot (PARTIAL) | `stage_audit` | positional agreement within 15/30/60 m | report-01 §2.3 only |
| ksndmc_aws_bengaluru_list (UNVERIFIED) | **nothing** | — | none |
| imd_bengaluru_monthly_rain (UNVERIFIED) | **nothing in the pipeline** | 4 monthly values were read by an ad-hoc command and quoted by hand in report-01 §4.1 (issue I-10) | report-01 §4.1 text only |
| curated news YAML + geocode cache | `stage_observations` | Nominatim coordinates → `flood_observations.parquet` | candidate events score; `domlur_a25_b13/flood_observations.parquet`; figures |
| sentinel1_availability.csv | `stage_observations`, `stage_catchments` | copied; post-event flag | `data/processed/bengaluru/sentinel1_availability.csv`; candidate independent-evidence score |

**Consequence for the results:**
- **The DEM itself is verified.** The terrain products and terrain-only indicators are computed from it, but they are applied to the drain lines, which are not verified.
- **Every network, evidence-status and catchment-ranking result also depends on UNVERIFIED OpenCity files.** These include the drain geometry, the BBMP boundary used for the AOI and filters, the flood locations and the gauge locations.
- These results must carry the label "based on OpenCity copies of KSRSAC/BBMP/KSNDMC data, downloaded 2026-11-11, not independently verified" until action A-1 is done.

## 6. Unresolved issues and actions

| id | Issue | Severity | Action (owner A unless noted) |
|---|---|---|---|
| I-1 | 12 OpenCity files are UNVERIFIED; the host is down and there is no archive or mirror | **High** | **A-1:** when `data.opencity.in` returns, re-download into a separate folder and compare SHA-256; ask OpenCity or the original agencies (KSRSAC, BBMP, KSNDMC) for checksums or the original files |
| I-2 | The fetcher did not record HTTP status, ETag, Last-Modified or the catalogue `size` at download time; the 2026-11-11 evidence exists only in the session log | Medium | Extend `fetch.py` to write response headers and catalogue metadata into the lock (code change, needs approval) |
| I-3 | `accessed_utc` for `dem_cop30_n13e077` and `dem_srtm_n13e077` was written by hand after a manual `curl` resume, not by the fetcher | Low (both files are now verified by ETag) | Note only; future downloads go through the fetcher |
| I-4 | Copernicus verification against Planetary Computer covers the AOI window, not every tile pixel | Low | Full-tile comparison if needed |
| I-5 | The SRTM manifest title says "SRTM GL1", but the files are Mapzen's void-filled skadi product; not checked against NASA | Low (comparison use only) | Correct the manifest title (needs approval); optionally verify against LP DAAC with an Earthdata login |
| I-6 | `ksndmc_aws_bengaluru_list` is titled AWS in the catalogue but its header says telemetric rain gauges; it is unused | Low | Rename or remove from the manifest (needs approval) |
| I-7 | The IMD CSV does not name its station; only 2 of about 1,500 values were corroborated | Low (unused by the pipeline) | Obtain the IMD source table if it is to be used |
| I-8 | Speaker attribution of the Kendriya Vihar "six feet" quote is unconfirmed | Low | Re-read the article; correct `depth_note` if wrong |
| I-9 | The Vidyaranyapura "4 ft" depth may belong to Kuvempu Nagar / Basava Samithi | Medium (it is one of only 3 numeric depths) | Mark the depth as ambiguous or move it; decide before any depth comparison |
| I-10 | Report-01 §4.1 IMD numbers came from an ad-hoc command, not the pipeline | Low | Move into the pipeline or cite as a manual lookup |
| I-11 | 2 geocodes have changed upstream (59 m and 252 m) | Low | Keep the cache as the frozen input; record its hash in the manifest |
| I-12 | Ward and zone layers have no stated licence | Medium (redistribution) | Confirm with OpenCity or BBMP before publishing derived maps |
| I-13 | Stale file `data/interim/terrain/candidate_basins.tif` from an earlier run; byte-identical to `candidate_basins_a4.tif`; unused | Low | Delete at the next clean rebuild (not done here, by instruction) |

## 7. Final verdict

- **No synthetic, fabricated or placeholder data** exists among the raw inputs. Every file traces to a named public URL, parses as the format and content its publisher describes, and covers Bengaluru.
- **Independently verified:**
  - Copernicus GLO-30 (both tiles): independent copy and server checksum.
  - Sentinel-1 acquisition list: confirmed by ASF and ESA.
  - Curated news reports: every place name and rainfall figure found in the cited article, with two attribution issues (I-8, I-9).
- **Verified only against the distributor:** SRTM skadi tiles (comparison use only).
- **UNVERIFIED (12 files):** every OpenCity-hosted dataset, including the **drainage network, flood locations, rain-gauge locations and BBMP boundaries that the main results depend on**. They are plausible and internally consistent, but not authenticated. Role A's results (report 01, `network_city_v1`, `domlur_a25_b13/network_v1`, the catchment ranking) are therefore **provisional on unverified inputs**. They should not be presented as resting on verified data until action A-1 is done.
