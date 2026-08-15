# export_geojson.R
# Writes the output files the frontend consumes, matching the schema
# in the build spec. Kept as its own file so the required field list lives
# in exactly one place - if you add a field, add it to the required_cols
# vector here AND to app/lib/types.ts on the frontend side.

library(sf)
library(dplyr)
library(jsonlite)

#' Drop hexes the study has nothing to say about.
#'
#' The H3 grid covers the study area's bounding geometry, so it runs out
#' over the bay: cells with no road touching them and nobody living in
#' them. Their scores aren't measurements - stress_score comes from the
#' no-road fallback in 10_compute_scores.R (avg_lts = 4) and demand_score
#' is NA wherever the DEM has no land - so on the map they read as a
#' fringe of hexagons floating in the sea. Filtered here, at export, so
#' the upstream analysis keeps working on the full grid.
#'
#' @param hexes sf POLYGON object with a `population` column
#' @param segments sf LINESTRING object - the road network
#' @return `hexes` minus the cells with neither roads nor residents
drop_empty_hexes <- function(hexes, segments) {
  has_road   <- lengths(sf::st_intersects(hexes, sf::st_geometry(segments))) > 0
  has_people <- !is.na(hexes$population) & hexes$population > 0
  keep <- has_road | has_people

  message(sprintf(
    "Dropping %d of %d hexes with no roads and no population",
    sum(!keep), nrow(hexes)
  ))
  hexes[keep, ]
}

#' Write the hex layer for the frontend.
#'
#' @param hexes sf POLYGON object with (at least) the columns below
#' @param path output path, e.g. "../app/public/data/hexagons.geojson"
export_hex_layer <- function(hexes, path) {
  required_cols <- c(
    "hex_id", "population", "production_score", "attraction_score",
    "demand_score", "stress_score", "infra_quality_score", "gap_score",
    "schools_nearby", "stations_nearby", "shops_nearby",
    "bike_parking_nearby", "bike_parking_capacity_nearby",
    "bike_sharing_nearby", "bike_sharing_capacity_nearby", "flat_terrain",
    "roi_car_trips_per_day", "roi_congestion_cost_yen_day", "roi_operating_cost_yen_day",
    "roi_emissions_kg_day", "roi_shifted_trips_per_day", "roi_congestion_savings_yen_day",
    "roi_operating_savings_yen_day", "roi_emissions_avoided_kg_day",
    "roi_health_benefit_yen_day", "roi_parking_spaces_freed"
  )
  missing <- setdiff(required_cols, names(hexes))
  if (length(missing) > 0) {
    stop("hex layer is missing columns: ", paste(missing, collapse = ", "))
  }

  if (file.exists(path)) file.remove(path)  # st_write won't overwrite by default
  sf::st_write(hexes[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
}

#' Write the segment layer for the frontend (the before/after cards).
#'
#' @param segments sf LINESTRING object with (at least) the columns below
#' @param path output path, e.g. "../app/public/data/segments.geojson"
export_segment_layer <- function(segments, path) {
  required_cols <- c(
    "way_id", "osm_id", "name", "highway", "length_m", "lts", "speed_kmh", "lanes_n",
    "traffic_signals_count", "has_cycle_infra", "cycleway_type",
    "sidewalk_available", "likely_informal_parking",
    "school_nearby", "station_nearby", "existing_cycling",
    "mean_slope_deg", "flat_terrain",
    # B.3: suitability score + stress-based network analysis
    "suitability_score", "network_criticality_score",
    "bridges_islands", "islands_adjacent", "island_id", "display_category",
    "infra_gap", "recommendation", "cost_tier", "suitability_after",
    # F.3: what kind of benefit claim `suitability_after` supports, and
    # which corridor the segment rolls up into. `benefit_kind` is not
    # cosmetic - a row that is not "lts_recalc" has no honest before/after
    # and carries NA in suitability_after (see R/score_intervention.R).
    "benefit_kind", "intervention_lever", "corridor_id",
    "estimated_beneficiaries",
    # Neighbourhood context from the enclosing hex. NOT attributable to the
    # segment - see R/join_hex_context.R's header note.
    "context_hex_gap_score", "context_hex_demand_score",
    "context_hex_population", "context_hex_daily_savings_yen"
  )
  missing <- setdiff(required_cols, names(segments))
  if (length(missing) > 0) {
    stop("segment layer is missing columns: ", paste(missing, collapse = ", "))
  }

  if (file.exists(path)) file.remove(path)
  sf::st_write(segments[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
}

#' Write the Investment Ranking table's rows.
#'
#' JSON rather than GeoJSON, and deliberately so: this is a *table*, not a map
#' layer. Its geometry would be a duplicate of the member ways already in
#' segments.geojson, and the one thing the page needs geometry for - flying the
#' map to a corridor - is served by the precomputed `bbox` at a fraction of the
#' size (the equivalent GeoJSON was 487KB).
#'
#' One row per fundable project rather than per OSM way. See
#' R/build_corridors.R for why the way is the wrong unit (median 119m, 57%
#' unnamed, one street spread over dozens of rows).
#'
#' The `notes` block travels with the data on purpose. Three of these columns
#' are honest only if read with a caveat - `suitability_after` is absent for
#' some rows by design, and the two `context_hex_*` figures describe a
#' neighbourhood rather than the corridor - so the caveats ship in the file
#' rather than living only in whichever UI happens to render it.
#'
#' @param corridors sf object from aggregate_corridors()
#' @param study_area study area name, for provenance
#' @param path output path, e.g. "../app/public/data/investment_ranking.json"
export_investment_ranking <- function(corridors, study_area, path) {
  required_cols <- c(
    "corridor_id", "name", "nearest_station", "recommendation", "benefit_kind",
    "intervention_lever", "cost_tier", "highway",
    "segment_count", "length_m", "way_ids", "osm_ids",
    "lts_before", "suitability_before", "suitability_after",
    "estimated_beneficiaries",
    "network_criticality_score", "bridges_islands", "islands_adjacent",
    "signalised_junctions", "signals_per_km",
    "informal_parking_length_m", "no_sidewalk_length_m",
    "context_hex_gap_score", "context_hex_daily_savings_yen",
    "bbox_w", "bbox_s", "bbox_e", "bbox_n"
  )
  missing <- setdiff(required_cols, names(corridors))
  if (length(missing) > 0) {
    stop("investment ranking is missing columns: ", paste(missing, collapse = ", "))
  }

  # A corridor whose intervention the stress score cannot model must not carry
  # a before/after number. Checked at the boundary rather than trusted from
  # upstream, because this is the one invariant the whole benefit_kind
  # mechanism exists to protect.
  leaked <- corridors$benefit_kind != "lts_recalc" & !is.na(corridors$suitability_after)
  if (any(leaked)) {
    stop(sum(leaked), " corridor(s) carry suitability_after despite an ",
         "unmodelled benefit_kind - see R/score_intervention.R")
  }

  df <- sf::st_drop_geometry(corridors)[, required_cols]

  # Street and station names come back from the GeoPackage with their encoding
  # unmarked, which jsonlite then serialises as "<U+307F>" escapes rather than
  # characters - every Japanese name in the file arrives mojibake'd. Marking
  # them UTF-8 explicitly is the fix; nearly every name in this study area is
  # Japanese, so this is not an edge case.
  for (col in names(df)) {
    if (is.character(df[[col]])) df[[col]] <- enc2utf8(df[[col]])
  }

  rows <- lapply(seq_len(nrow(df)), function(i) {
    r <- as.list(df[i, ])
    # I() keeps these as JSON arrays. Without it `auto_unbox` collapses a
    # length-1 vector to a scalar, so the 1-segment corridors - a third of them
    # here - would arrive with `way_ids: 42` instead of `[42]` and break any
    # consumer that iterates it.
    r$way_ids <- I(as.integer(strsplit(r$way_ids, ",", fixed = TRUE)[[1]]))
    r$osm_ids <- I(strsplit(r$osm_ids, ",", fixed = TRUE)[[1]])
    r$bbox <- I(c(r$bbox_w, r$bbox_s, r$bbox_e, r$bbox_n))
    r[c("bbox_w", "bbox_s", "bbox_e", "bbox_n")] <- NULL
    r
  })

  out <- list(
    study_area = study_area,
    corridor_count = nrow(df),
    total_length_km = round(sum(df$length_m) / 1000, 1),
    notes = list(
      unit = paste(
        "One row is a corridor: segments that share a street name (or are all",
        "unnamed), run end to end into one another, and are all worth",
        "spending money on. Not one OSM way - the median recommended way here",
        "is 119m and 57% are unnamed. The recommendation is a property of the",
        "corridor, decided once from its aggregate and inherited by its",
        "members, so it is never part of what groups them."
      ),
      suitability_after = paste(
        "Null wherever benefit_kind is 'not_modelled'. The traffic-stress",
        "score has no input representing a crossing treatment or bike",
        "parking, so no before/after is computed for those rather than",
        "borrowing another intervention's number. Render as N/A, never as a",
        "guess."
      ),
      context_hex_fields = paste(
        "Properties of the ~0.1km2 hex the corridor sits in, computed from",
        "hex-level population - not savings attributable to fixing this",
        "corridor. Two corridors crossing the same cell carry the same",
        "figures. Label as context in any UI."
      ),
      estimated_beneficiaries = paste(
        "Residents within 500m of the whole corridor, from a single unioned",
        "buffer - never the sum of its segments' own values, whose buffers",
        "overlap almost entirely."
      ),
      signalised_junctions = paste(
        "Distinct signalised junctions within 15m of the whole corridor, with",
        "OSM's per-approach signal nodes clustered at 30m so a crossroads",
        "counts once (465 nodes -> 294 junctions here). Not the sum of the",
        "members' own signal counts, which double-counted every junction",
        "between two members. `signals_per_km` is the same count as a rate:",
        "how often a cyclist would expect to stop, which is a cost of riding",
        "the street whatever its traffic-stress score says."
      )
    ),
    corridors = rows
  )

  jsonlite::write_json(out, path, auto_unbox = TRUE, digits = 4,
                       null = "null", na = "null", pretty = TRUE)
  message(sprintf("Wrote %s (%d corridors)", path, nrow(df)))
  invisible(out)
}

#' Write the existing-cycling-network layer for the frontend.
#'
#' Derived from the segment table rather than fetched separately, which is
#' the point: the overlay showing "what already exists" and the analysis
#' saying "here is what's missing" then cannot disagree, because they are
#' the same rows. A second oe_read() with its own filter would be one more
#' place for the two to drift apart - which is how the original bug
#' survived, with `highway=cycleway` ways sitting in the segment table
#' flagged as having no cycle infrastructure.
#'
#' Exported as its own file even though every feature is also in
#' segments.geojson, because it is an additive overlay: the frontend draws
#' it on top of whichever view owns the colour channel, including the area
#' views where the segment layer is not drawn at all (see the overlay rule
#' in app/src/lib/types.ts).
#'
#' @param segments sf LINESTRING object post score_lts(), carrying
#'   `cycleway_type` (NA on anything that is not cycling infrastructure)
#' @param path output path, e.g. "../app/public/data/cycleways.geojson"
#' @return invisibly, the exported subset
export_cycleway_layer <- function(segments, path) {
  required_cols <- c("way_id", "name", "highway", "cycleway_type",
                     "length_m", "lts", "surface", "lit")
  missing <- setdiff(required_cols, names(segments))
  if (length(missing) > 0) {
    stop("cycleway layer is missing columns: ", paste(missing, collapse = ", "))
  }

  cycleways <- segments[!is.na(segments$cycleway_type), required_cols]

  message(sprintf(
    "Existing cycling network: %d ways, %.1f km",
    nrow(cycleways), sum(cycleways$length_m, na.rm = TRUE) / 1000
  ))
  print(table(cycleways$cycleway_type))

  if (nrow(cycleways) == 0) {
    warning("no cycling infrastructure found - check that fetch_osm.R's ",
            "extra_tags still includes `bicycle`/`segregated`, since the ",
            "classification silently returns NA for every row when those ",
            "columns are absent")
  }

  if (file.exists(path)) file.remove(path)
  sf::st_write(cycleways, path, driver = "GeoJSON", quiet = TRUE)
  invisible(cycleways)
}

#' Pull one key's value out of OSM's `other_tags` hstore-style column, e.g.
#' `"fee"=>"yes","brand"=>"Docomo Bike Share"`. Each key is matched
#' independently (rather than splitting the string on commas) since a
#' value can itself contain commas.
#' @param other_tags character vector, one hstore string per row (may be NA)
#' @param key tag key to extract
#' @return character vector, same length as other_tags, NA where the row
#'   is NA or the key is absent
extract_other_tag <- function(other_tags, key) {
  pattern <- sprintf('"%s"=>"([^"]*)"', key)
  has_match <- !is.na(other_tags) & grepl(pattern, other_tags)
  out <- rep(NA_character_, length(other_tags))
  out[has_match] <- sub(paste0(".*", pattern, ".*"), "\\1", other_tags[has_match])
  out
}

#' Build a stable, namespaced OSM id for features that may be nodes or ways.
#'
#' GDAL's OSM driver splits an element's id across two columns depending on
#' which layer it came from: the `points` layer fills `osm_id`, while the
#' `multipolygons` layer fills `osm_way_id` and leaves `osm_id` NULL for
#' anything built from a closed way (it reserves `osm_id` there for
#' relation-derived polygons). A layer that binds both - as
#' get_bike_facilities() does - therefore has a NULL `osm_id` on every
#' polygon-derived row unless the two are merged here.
#'
#' Merged with the `node/`/`way/` prefix rather than by plain coalescing
#' because node and way ids are independent OSM sequences: id 47969139 names
#' both a node and a way, so a bare id is not unique across a bound layer.
#' The frontend uses this value as the feature's identity - map hit-testing
#' and highlight filters in MapView.tsx, React list keys in
#' RouteResultPanel.tsx - so a collision is a real bug, not a cosmetic one.
#'
#' @param osm_id character vector from the points layer (NA for way rows)
#' @param osm_way_id character vector from the multipolygons layer (NA for
#'   node rows)
#' @return character vector of `node/<id>` / `way/<id>` strings
osm_canonical_id <- function(osm_id, osm_way_id) {
  present <- function(x) !is.na(x) & nzchar(x)
  is_node <- present(osm_id)
  is_way <- !is_node & present(osm_way_id)

  if (any(!is_node & !is_way)) {
    stop(sum(!is_node & !is_way), " feature(s) have neither osm_id nor osm_way_id")
  }

  out <- ifelse(is_node, paste0("node/", osm_id), paste0("way/", osm_way_id))

  if (anyDuplicated(out) > 0) {
    stop("duplicate OSM ids after merge: ", paste(unique(out[duplicated(out)]), collapse = ", "))
  }
  out
}

#' Write the bike facilities layer for the frontend (parking + sharing points).
#'
#' @param bike_facilities sf POINT object with (at least) the columns below,
#'   including `other_tags` (OSM's hstore-style catch-all column) to parse
#'   fee/brand/access/covered/supervised/note/operator/opening_hours from
#' @param path output path, e.g. "../app/public/data/bike_facilities.geojson"
export_bike_facilities_layer <- function(bike_facilities, path) {
  source_cols <- c("osm_id", "osm_way_id", "name", "ref", "amenity", "capacity", "facility_type", "other_tags")
  missing <- setdiff(source_cols, names(bike_facilities))
  if (length(missing) > 0) {
    stop("bike facilities layer is missing columns: ", paste(missing, collapse = ", "))
  }

  bike_facilities$osm_id <- osm_canonical_id(bike_facilities$osm_id, bike_facilities$osm_way_id)

  other_tag_keys <- c(
    "fee", "brand", "access", "covered", "supervised",
    "note", "operator", "opening_hours"
  )
  for (key in other_tag_keys) {
    bike_facilities[[key]] <- extract_other_tag(bike_facilities$other_tags, key)
  }

  # osm_way_id is folded into osm_id above, so it does not travel to the app.
  required_cols <- c(setdiff(source_cols, c("other_tags", "osm_way_id")), other_tag_keys)

  if (file.exists(path)) file.remove(path)  # st_write won't overwrite by default
  sf::st_write(bike_facilities[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
}

#' Write the traffic signal point layer for the frontend's route scorer.
#'
#' Why a point layer when segments already carry `traffic_signals_count`:
#' that column is a count of signal nodes within SIGNAL_BUFFER_M of a way
#' (05_build_segment_table.R), which is the right shape for scoring one
#' segment and the wrong shape for scoring a route. OSM tags signals per
#' approach, so one junction is ~1.6 nodes here, and every way meeting
#' that junction counts all of them - across this study area the counts
#' sum to 1,661 for 465 actual nodes at ~294 junctions. Summing the
#' column along a route therefore over-counts stops several times over,
#' and a route's travel time is exactly what those signals were fetched
#' for (see the comment above SIGNAL_BUFFER_M).
#'
#' Exported as raw nodes rather than pre-clustered junctions: the
#' clustering distance is a scoring choice, and it lives next to the
#' route scorer's other constants in app/src/lib/scoring-constants.ts
#' rather than being baked in here.
#'
#' @param signals sf POINT object as written by 01d_download_traffic_signals.R
#' @param path output path, e.g. "../app/public/data/traffic_signals.geojson"
export_traffic_signals_layer <- function(signals, path) {
  required_cols <- c("osm_id", "highway")
  missing <- setdiff(required_cols, names(signals))
  if (length(missing) > 0) {
    stop("traffic signals layer is missing columns: ", paste(missing, collapse = ", "))
  }

  if (file.exists(path)) file.remove(path)  # st_write won't overwrite by default
  sf::st_write(signals[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
}

#' Write the amenities point layer for the frontend's context toggle.
#'
#' The three destination types the demand model counts (`schools_nearby`,
#' `stations_nearby`, `shops_nearby` in 08_join_poi.R) are exported as one
#' layer with a `kind` discriminator, so the map can show the actual points
#' behind those per-hex counts rather than only the counts.
#'
#' Sources differ in shape: KSJ schools are points, KSJ railway data is
#' LINESTRING platform centrelines (several rows per station, so they are
#' collapsed to one representative point per station name), and the OSM POI
#' layer is points.
#'
#' @param schools sf POINT, KSJ P29 (P29_004 name, P29_005 address)
#' @param stations sf LINESTRING, KSJ N02 (N02_003 line, N02_004 operator,
#'   N02_005 station name)
#' @param poi sf POINT, OSM (name, amenity, shop)
#' @param path output path, e.g. "../app/public/data/amenities.geojson"
export_amenities_layer <- function(schools, stations, poi, path) {
  as_points <- function(x) sf::st_point_on_surface(sf::st_geometry(x))

  schools_pts <- sf::st_sf(
    kind   = "school",
    name   = schools$P29_004,
    detail = schools$P29_005,
    geometry = as_points(schools)
  )

  # One row per platform centreline collapses to one marker per station.
  station_groups <- stations |>
    dplyr::group_by(station = .data$N02_005) |>
    dplyr::summarise(
      detail = paste(unique(.data$N02_003), collapse = " / "),
      .groups = "drop"
    )
  stations_pts <- sf::st_sf(
    kind   = "station",
    name   = station_groups$station,
    detail = station_groups$detail,
    geometry = as_points(station_groups)
  )

  # `shops_nearby` counts the whole POI layer, so the map shows the whole
  # POI layer — a narrower filter here would contradict the hex counts.
  poi_pts <- sf::st_sf(
    kind   = "shop",
    name   = poi$name,
    detail = dplyr::coalesce(poi$shop, poi$amenity),
    geometry = as_points(poi)
  )

  amenities <- rbind(schools_pts, stations_pts, poi_pts)
  amenities$amenity_id <- seq_len(nrow(amenities))
  amenities <- amenities[, c("amenity_id", "kind", "name", "detail")]

  if (file.exists(path)) file.remove(path)
  sf::st_write(amenities, path, driver = "GeoJSON", quiet = TRUE)
  invisible(amenities)
}

#' Copy the study-area summary stats JSON to the frontend's data folder.
#' @param summary_json_path path to the .json written by
#'   10c_compute_summary_stats.R, e.g. "output/shibuya_pilot_summary.json"
#' @param path output path, e.g. "../app/public/data/summary.json"
export_summary_stats <- function(summary_json_path, path) {
  if (!file.exists(summary_json_path)) {
    stop("summary stats file not found: ", summary_json_path,
         " - run 10c_compute_summary_stats.R first")
  }
  file.copy(summary_json_path, path, overwrite = TRUE)
}

# --- Access surfaces (13_compute_access.R) -------------------------------
#
# The three functions below read ACCESS_BANDS_M, ACCESS_BUFFER_M,
# CALM_MAX_LTS and MAX_FRONTIER_CORRIDORS from R/score_access.R. They are the
# only ones here that do, and 11_export.R never calls them, so this file
# still needs no dependency on igraph - but source R/score_access.R before
# calling any of them.

#' Write the 250m population mesh the access surfaces are measured on.
#'
#' Exported as its own layer rather than folded into the per-origin files
#' because it is the same grid for every origin: one ~1000-feature file the
#' app loads once, against 135 copies of the same geometry if each surface
#' carried its own. The surfaces then reference cells by `mesh_code`, which
#' is e-Stat's own identifier and stable across runs - a positional index
#' into this file would silently repoint every surface the first time a cell
#' gained or lost residents.
#'
#' @param mesh sf POLYGON from load_population_mesh(), already filtered to
#'   cells with both residents and a street nearby
#' @param path output path, e.g. "output/population_mesh.geojson"
export_population_mesh <- function(mesh, path) {
  required_cols <- c("mesh_code", "population", "population_child",
                     "population_elderly")
  missing <- setdiff(required_cols, names(mesh))
  if (length(missing) > 0) {
    stop("population mesh is missing columns: ", paste(missing, collapse = ", "))
  }

  out <- mesh[, required_cols]
  out$population         <- round(out$population)
  out$population_child   <- round(out$population_child)
  out$population_elderly <- round(out$population_elderly)

  if (file.exists(path)) file.remove(path)  # st_write won't overwrite by default
  sf::st_write(out, path, driver = "GeoJSON", quiet = TRUE)
  message(sprintf("Wrote %s (%d cells, %.0f residents)",
                  path, nrow(out), sum(out$population, na.rm = TRUE)))
  invisible(out)
}

#' Write the access index: one row per origin, with the figures the ranked
#' list and the origin markers are drawn from.
#'
#' The one number this file exists to carry is `severed` - residents who can
#' reach the origin within the band, but not without riding something above
#' CALM_MAX_LTS. Both sides of that subtraction are measured with the same
#' buffer, the same mesh and the same graph, so the *share* is far more
#' robust than either count; the notes block says so, and travels with the
#' data for the same reason the investment ranking's does.
#'
#' @param origins sf POINT from build_access_origins()
#' @param surfaces list from 13_compute_access.R's first pass
#' @param unlocks list of per-origin counterfactual data frames, or NULL
#' @param corridors data frame with corridor_id, name, recommendation,
#'   cost_tier - the labels for the frontier list, read from the investment
#'   ranking so the two pages name a street identically
#' @param study_area study area name, for provenance
#' @param mesh sf, for the provenance block only
#' @param path output path, e.g. "output/access_index.json"
export_access_index <- function(origins, surfaces, unlocks, corridors,
                                study_area, mesh, path) {
  coords <- sf::st_coordinates(sf::st_geometry(origins))
  meta   <- sf::st_drop_geometry(origins)

  # Same encoding fix as export_investment_ranking(): names come off the
  # GeoPackage unmarked and jsonlite would escape every Japanese character.
  for (col in names(meta)) {
    if (is.character(meta[[col]])) meta[[col]] <- enc2utf8(meta[[col]])
  }
  # Keyed by name, and looked up below with as.character(). `corridor_id` is an
  # integer, and `x[2L]` on a named vector indexes the second *position* rather
  # than the element named "2" - which would silently mislabel every frontier
  # corridor rather than failing.
  key <- as.character(corridors$corridor_id)
  corridor_name <- stats::setNames(enc2utf8(corridors$name), key)
  corridor_rec  <- stats::setNames(corridors$recommendation, key)
  corridor_cost <- stats::setNames(corridors$cost_tier, key)

  rows <- lapply(seq_len(nrow(meta)), function(i) {
    s <- surfaces[[i]]

    bands <- lapply(seq_len(nrow(s$band_any)), function(b) {
      any_pop  <- s$band_any$population[b]
      calm_pop <- s$band_calm$population[b]
      list(
        band_m                  = s$band_any$band_m[b],
        population_any          = round(any_pop),
        population_calm         = round(calm_pop),
        severed                 = round(any_pop - calm_pop),
        # Undefined rather than 0 where nobody can reach the origin at all:
        # a school no one can get to has not severed anyone, and printing
        # "0% cut off" next to it would read as a clean bill of health.
        severed_share           = if (any_pop > 0) round(1 - calm_pop / any_pop, 3) else NA_real_,
        population_child_any    = round(s$band_any$population_child[b]),
        population_child_calm   = round(s$band_calm$population_child[b]),
        population_elderly_any  = round(s$band_any$population_elderly[b]),
        population_elderly_calm = round(s$band_calm$population_elderly[b]),
        cells_any               = s$band_any$cells[b],
        cells_calm              = s$band_calm$cells[b]
      )
    })

    frontier <- lapply(s$frontier$corridor_ids, function(cid) {
      gain <- if (is.null(unlocks[[i]])) NULL else
        unlocks[[i]][unlocks[[i]]$corridor_id == cid, ]
      at <- as.character(cid)
      list(
        corridor_id    = cid,
        name           = unname(corridor_name[at]),
        recommendation = unname(corridor_rec[at]),
        cost_tier      = unname(corridor_cost[at]),
        unlock = if (is.null(gain) || nrow(gain) == 0) NULL else
          lapply(seq_len(nrow(gain)), function(k) list(
            band_m             = gain$band_m[k],
            population         = round(gain$population[k]),
            population_child   = round(gain$population_child[k]),
            population_elderly = round(gain$population_elderly[k])
          ))
      )
    })

    c(
      as.list(meta[i, ]),
      list(
        lon = round(coords[i, 1], 6),
        lat = round(coords[i, 2], 6),
        snapped      = s$snapped,
        calm_at_gate = s$calm_at_gate,
        bands        = I(bands),
        frontier_corridor_count = s$frontier$total,
        frontier     = I(frontier)
      )
    )
  })

  has_child <- any(!is.na(mesh$population_child))

  out <- list(
    study_area     = study_area,
    origin_count   = nrow(meta),
    bands_m        = I(ACCESS_BANDS_M),
    primary_band_m = ACCESS_PRIMARY_BAND_M,
    buffer_m       = ACCESS_BUFFER_M,
    calm_max_lts   = CALM_MAX_LTS,
    mesh = list(
      cell_count       = nrow(mesh),
      cell_size_m      = 250,
      has_child_band   = has_child,
      has_elderly_band = any(!is.na(mesh$population_elderly))
    ),
    notes = list(
      unit = paste(
        "One row is an origin - a school (小/中/高 only) or a station.",
        "Everything is measured outward from it over the project's own",
        "segment network, in metres of riding rather than straight line."
      ),
      calm = sprintf(paste(
        "The calm surface may only use segments at LTS %d or below - the same",
        "definition score_network.R uses for a low-stress island, so an",
        "origin's calm reach is a distance-limited slice of the island it",
        "sits on. It is a subgraph, not a preference: a calm reach can never",
        "be a high-stress path that happens to end calmly."), CALM_MAX_LTS),
      severed = paste(
        "population_any minus population_calm: residents who can reach this",
        "origin within the band, but not without riding a high-stress street.",
        "Both sides use the same buffer, mesh and graph, so severed_share is",
        "robust where the absolute counts are order-of-magnitude - quote the",
        "share."
      ),
      population = sprintf(paste(
        "A 250m mesh cell counts in full when a usable street comes within",
        "%dm of its centroid, and not at all otherwise. Deliberately binary:",
        "area-weighting would imply we know how a cell's residents are",
        "distributed inside it, and the mesh is the finest thing e-Stat",
        "publishes."), ACCESS_BUFFER_M),
      frontier = sprintf(paste(
        "Corridors on the edge of the calm surface, capped at %d per origin",
        "(frontier_corridor_count is the number before the cap; the ones",
        "dropped are the shortest). Only corridors whose own modelled",
        "after-state is low-stress appear - a crossing improvement has no",
        "modelled after-state at all, so it can never be credited with an",
        "unlock."), MAX_FRONTIER_CORRIDORS),
      unlock = paste(
        "The calm surface recomputed with that corridor's segments treated",
        "as low-stress, minus the calm surface as it stands. A counterfactual",
        "in the same sense as suitability_after, and inheriting its limits:",
        "it assumes the intervention is built as 05d modelled it, and models",
        "nothing about junctions, gradient or one-way streets."
      )
    ),
    origins = rows
  )

  jsonlite::write_json(out, path, auto_unbox = TRUE, digits = 4,
                       null = "null", na = "null", pretty = TRUE)
  message(sprintf("Wrote %s (%d origins)", path, nrow(meta)))
  invisible(out)
}

#' Write one reach surface per origin, into `dir`.
#'
#' Per-origin files rather than one blob: the app needs exactly the surface a
#' reader has selected, and 135 origins x ~1000 cells x 2 numbers is several
#' megabytes to download for the one school somebody clicked.
#'
#' Each cell carries its network distance in metres on each surface, rather
#' than a band number. The bands are then a rendering choice the app can
#' animate between without refetching, while every *population* figure still
#' comes from this pipeline at the bands in `bands_m` - the frontend colours
#' cells, it does not count people.
#'
#' @param origins sf POINT from build_access_origins()
#' @param surfaces list from 13_compute_access.R's first pass
#' @param mesh sf, for the cell codes
#' @param dir output directory, e.g. "output/access"
export_access_surfaces <- function(origins, surfaces, mesh, dir) {
  dir.create(dir, showWarnings = FALSE, recursive = TRUE)
  max_band <- max(ACCESS_BANDS_M)

  for (i in seq_len(nrow(origins))) {
    s <- surfaces[[i]]
    reached <- which(is.finite(s$cell_any) & s$cell_any <= max_band)

    cells <- lapply(reached, function(j) {
      calm <- s$cell_calm[j]
      c(round(s$cell_any[j]),
        if (is.finite(calm) && calm <= max_band) round(calm) else NA_real_)
    })
    names(cells) <- mesh$mesh_code[reached]

    jsonlite::write_json(
      list(
        origin_id = origins$origin_id[i],
        bands_m   = I(ACCESS_BANDS_M),
        cells     = cells
      ),
      file.path(dir, paste0(origins$origin_id[i], ".json")),
      auto_unbox = TRUE, digits = 0, null = "null", na = "null"
    )
  }

  message(sprintf("Wrote %d reach surfaces to %s/", nrow(origins), dir))
}
