# export_geojson.R
# Writes the two output layers the frontend consumes, matching the schema
# in the build spec. Kept as its own file so the required field list lives
# in exactly one place - if you add a field, add it to the required_cols
# vector here AND to app/lib/types.ts on the frontend side.

library(sf)
library(dplyr)

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
    "way_id", "name", "highway", "length_m", "lts", "speed_kmh", "lanes_n",
    "traffic_signals_count", "has_cycle_infra", "cycleway_type",
    "sidewalk_available", "likely_informal_parking",
    "school_nearby", "station_nearby", "existing_cycling",
    "mean_slope_deg", "flat_terrain",
    # B.3: suitability score + stress-based network analysis
    "suitability_score", "network_criticality_score",
    "bridges_islands", "islands_adjacent", "island_id", "display_category",
    "infra_gap", "recommendation", "cost_tier", "suitability_after",
    "estimated_beneficiaries"
  )
  missing <- setdiff(required_cols, names(segments))
  if (length(missing) > 0) {
    stop("segment layer is missing columns: ", paste(missing, collapse = ", "))
  }

  if (file.exists(path)) file.remove(path)
  sf::st_write(segments[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
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
