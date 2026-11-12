# Sources

Every assumed parameter range or method gets an entry here (referenced from `configs/params/ranges.yaml` via `source_note`). Do not add a citation you have not actually read.

| Topic | Source (author, year, title/URL) | What it supports | Added by |
|---|---|---|---|
| Drainage maps | KSRSAC via OpenCity, "Bengaluru Stormwater Drains Maps" (2022), https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps | Network geometry; no hydraulic attributes (audited) | Role A |
| Flood locations | OpenCity, "Flooding Locations in Bengaluru Urban", https://data.opencity.in/dataset/flooding-locations-in-bengaluru-urban | Undated flood-vulnerable / prone / low-lying locations | Role A |
| Rain-gauge locations | KSNDMC via OpenCity, https://data.opencity.in/dataset/list-of-automated-weater-stations-aws-in-bengaluru-urban-rural-districts | 185 TRG locations (no time series) | Role A |
| DEM | Copernicus DEM GLO-30, https://registry.opendata.aws/copernicus-dem/ ; SRTM GL1 via https://registry.opendata.aws/terrain-tiles/ | Terrain analysis (30 m DSM caveat) | Role A |
| Sentinel-1 availability | ASF search API, https://api.daac.asf.alaska.edu/services/search/param | Per-event acquisition timing | Role A |
| Event report 2017-08-15 | Citizen Matters, "A watery Independence Day in S T Bed Layout", https://citizenmatters.in/august-2017-rain-bangalore-floods/ | Location + ≥1 ft depth | Role A |
| Event report 2022-09-05 | The News Minute, 5 Sep 2022, https://www.thenewsminute.com/article/bengaluru-flooded-again-after-rains-marathahalli-orr-under-water-167535 | Locations; KSNDMC/IMD rainfall figures as quoted | Role A |
| Event report 2024-10-22 | The News Minute, 22 Oct 2024, https://www.thenewsminute.com/karnataka/bengalurus-kendriya-vihar-apartments-in-yelahanka-flood-for-the-third-time-in-a-month | Locations; up-to depths | Role A |
| Event report 2025-05-19 | The News Minute, 19 May 2025, https://www.thenewsminute.com/karnataka/bengaluru-waterlogged-after-heavy-rains-commuters-face-traffic-disruptions ; All India Radio News, https://www.newsonair.gov.in/bengaluru-several-areas-inundated-by-overnight-rainfall | Locations; rainfall figures as quoted | Role A |
