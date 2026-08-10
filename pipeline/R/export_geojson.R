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
    "schools_nearby", "stations_nearby", "shops_nearby", "flat_terrain",
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
    "way_id", "length_m", "lts", "sidewalk_available", "likely_informal_parking",
    "school_nearby", "station_nearby", "existing_cycling", "infra_gap",
    "recommendation", "estimated_beneficiaries"
  )
  missing <- setdiff(required_cols, names(segments))
  if (length(missing) > 0) {
    stop("segment layer is missing columns: ", paste(missing, collapse = ", "))
  }

  if (file.exists(path)) file.remove(path)
  sf::st_write(segments[, required_cols], path, driver = "GeoJSON", quiet = TRUE)
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
