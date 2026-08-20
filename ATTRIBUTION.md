# Attribution and Data Sources

Norimichi is built entirely from public data. This file records every upstream
source, the terms it arrives under, and the credit each one requires.

Licensing of Norimichi's own output is split three ways: code is MIT
([LICENSE](LICENSE)), data is ODbL ([LICENSE-DATA](LICENSE-DATA)), and
documentation is CC BY 4.0 ([LICENSE-DOCS](LICENSE-DOCS)).

---

## Required credit line

Any published map, figure, or report drawn from Norimichi should carry at
minimum:

> Map data © OpenStreetMap contributors (ODbL). Basemap © CARTO.
> Population: e-Stat (Statistics Bureau of Japan). Schools and stations:
> 国土数値情報, MLIT. Elevation: Geospatial Information Authority of Japan.

---

## Sources in detail

### OpenStreetMap

*Road network, footpaths, traffic signals, shops and restaurants, bicycle
parking and sharing.*

- Accessed via Geofabrik regional `.pbf` extracts and the Overpass API
  (`pipeline/R/fetch_osm.R`, `fetch_poi.R`)
- License: **Open Database License (ODbL) v1.0**
  — https://www.openstreetmap.org/copyright
- Required credit: `© OpenStreetMap contributors`
- **Share-alike applies.** This is the reason Norimichi's exported data is
  ODbL rather than a Creative Commons license. See LICENSE-DATA.

### e-Stat — Statistics Bureau of Japan (総務省統計局)

*Census mesh population, and the observed commuting mode-share table.*

- Accessed via the e-Stat API (`pipeline/R/fetch_estat.R`) and manual table
  download (`pipeline/R/fetch_census_mesh.R`)
- Terms: 政府標準利用規約（第2.0版） — Government of Japan Standard Terms of
  Use v2.0, which the government states is compatible with CC BY 4.0
  — https://www.e-stat.go.jp/terms-of-use
- Required credit: source must be stated, e.g.
  `「令和2年国勢調査」（総務省統計局）を加工して作成`
  ("Created by processing the 2020 Census, Statistics Bureau of Japan")
- Note: processed/adapted data must be marked as adapted, not presented as
  the original official statistic.

### 国土数値情報 — National Land Numerical Information (MLIT)

*School locations (P29) and railway station locations.*

- Source: https://nlftp.mlit.go.jp/ksj/
- Read by `pipeline/R/fetch_ksj.R`, merged with OSM in `fetch_schools.R`
- Terms: 国土数値情報 利用約款, aligned with the Government Standard Terms of
  Use v2.0 / CC BY 4.0
- Required credit: `「国土数値情報（学校データ）」（国土交通省）`
- ⚠️ Verify the terms on the specific dataset page for each layer used —
  see `docs/LICENSE-VERIFICATION.md`.

### Geospatial Information Authority of Japan (国土地理院 / GSI)

*Elevation, and the slope values derived from it.*

- Source: DEM tiles from `cyberjapandata.gsi.go.jp/xyz/dem5a` and `dem10b`
  (`pipeline/R/fetch_dem.R`)
- Terms: 国土地理院コンテンツ利用規約, aligned with the Government Standard
  Terms of Use v2.0
  — https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
- Required credit: `「標高タイル（数値標高モデル）」（国土地理院）`
- ⚠️ GSI attaches conditions beyond plain attribution to some derived
  cartographic products, under the 測量法 (Survey Act). Norimichi consumes
  DEM tiles and derives per-segment slope, which is a substantial
  transformation rather than a reproduction of a GSI map — but this should be
  confirmed rather than assumed before any official or commercial
  publication. See `docs/LICENSE-VERIFICATION.md`.

### CARTO

*Basemap raster tiles (the grey `light_nolabels` background).*

- Served from `basemaps.cartocdn.com`, proxied through
  `app/src/app/api/tiles/[z]/[x]/[y]/route.ts`
- Terms: **proprietary service terms — not an open license**
  — https://carto.com/legal/
- Required credit: `© CARTO`, alongside the OpenStreetMap credit for the
  underlying data
- ⚠️ Server-side proxying of CARTO's tiles should be checked against their
  current basemap terms, which have historically expected direct client
  requests. If this becomes a problem, self-hosting tiles (e.g. Protomaps) or
  a paid plan are the alternatives.

---

## Third-party software

The application bundles MapLibre GL JS, licensed under BSD-3-Clause. The
license header is retained in the distributed bundle. Remaining dependencies
and their licenses are declared in `app/package.json` and resolved in
`app/package-lock.json`.
