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
    "demand_score", "stress_score", "gap_score",
    "schools_nearby", "stations_nearby", "shops_nearby", "flat_terrain"
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
