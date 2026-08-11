# export_geojson.R
# Writes the two output layers the frontend consumes, matching the schema
# in the build spec. Kept as its own file so the required field list lives
# in exactly one place - if you add a field, add it to the required_cols
# vector here AND to app/lib/types.ts on the frontend side.

library(sf)
library(dplyr)

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
    "traffic_signals_count", "has_cycle_infra",
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

#' Write the bike facilities layer for the frontend (parking + sharing points).
#'
#' @param bike_facilities sf POINT object with (at least) the columns below,
#'   including `other_tags` (OSM's hstore-style catch-all column) to parse
#'   fee/brand/access/covered/supervised/note/operator/opening_hours from
#' @param path output path, e.g. "../app/public/data/bike_facilities.geojson"
export_bike_facilities_layer <- function(bike_facilities, path) {
  source_cols <- c("osm_id", "name", "ref", "amenity", "capacity", "facility_type", "other_tags")
  missing <- setdiff(source_cols, names(bike_facilities))
  if (length(missing) > 0) {
    stop("bike facilities layer is missing columns: ", paste(missing, collapse = ", "))
  }

  other_tag_keys <- c(
    "fee", "brand", "access", "covered", "supervised",
    "note", "operator", "opening_hours"
  )
  for (key in other_tag_keys) {
    bike_facilities[[key]] <- extract_other_tag(bike_facilities$other_tags, key)
  }

  required_cols <- c(setdiff(source_cols, "other_tags"), other_tag_keys)

  if (file.exists(path)) file.remove(path)  # st_write won't overwrite by default
  sf::st_write(bike_facilities[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
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
