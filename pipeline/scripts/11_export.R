# 11_export.R
# Final step: writes the GeoJSON files the Next.js app reads directly.
#
# Derives remaining fields that depend on cross-layer data (beneficiary
# estimates from hex population, recommendation text from segment attributes).

source("R/utils_config.R")
source("R/export_geojson.R")
source("R/score_lts.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
hexes           <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
segments        <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
bike_facilities <- sf::st_read(sprintf("output/%s_bike_facilities.gpkg", cfg$name), quiet = TRUE)

METRIC_CRS <- 6677
BENEFICIARY_BUFFER_M <- 500

# --- Derived segment fields ---

segments$way_id    <- seq_len(nrow(segments))
segments$length_m  <- as.numeric(sf::st_length(segments))
segments$infra_gap <- ifelse(segments$lts >= 3, "high", "low")

# Compute has_cycle_infra and lanes_n from raw OSM columns if not already
# present (they become persistent after re-running 05, but we can derive
# them here from the same raw tags so 11 works standalone).
if (!"has_cycle_infra" %in% names(segments)) {
  segments$has_cycle_infra <- has_cycle_infra(
    segments$cycleway, segments$cycleway_left,
    segments$cycleway_right, segments$cycleway_both
  )
}
if (!"lanes_n" %in% names(segments)) {
  segments$lanes_n <- parse_lanes(segments$lanes)
}

segments$existing_cycling <- segments$has_cycle_infra

# --- Estimated beneficiaries from nearby hex population ---

segments_m <- sf::st_transform(segments, METRIC_CRS)
hexes_m    <- sf::st_transform(hexes, METRIC_CRS)

seg_buffers <- sf::st_buffer(segments_m, BENEFICIARY_BUFFER_M)
hex_hits    <- sf::st_intersects(seg_buffers, hexes_m)

segments$estimated_beneficiaries <- vapply(hex_hits, function(idx) {
  if (length(idx) == 0) return(0L)
  as.integer(round(sum(hexes_m$population[idx], na.rm = TRUE)))
}, integer(1))

message(sprintf("Beneficiary estimates: median %d, max %d",
                median(segments$estimated_beneficiaries),
                max(segments$estimated_beneficiaries)))

# --- Recommendation text from segment attributes ---

segments$recommendation <- case_when(
  segments$has_cycle_infra ~ NA_character_,
  segments$lts >= 4 & segments$lanes_n >= 3 ~
    "Protected cycle lane",
  segments$lts >= 3 & segments$speed_kmh > 40 ~
    "Protected cycle lane",
  segments$lts >= 3 & segments$likely_informal_parking ~
    "Parking management + cycle lane",
  segments$lts >= 3 ~
    "Cycle lane marking",
  TRUE ~ NA_character_
)

message(sprintf("Segments with recommendations: %d of %d",
                sum(!is.na(segments$recommendation)), nrow(segments)))

export_hex_layer(hexes, "output/hexagons.geojson")
export_segment_layer(segments, "output/segments.geojson")
export_bike_facilities_layer(bike_facilities, "output/bike_facilities.geojson")
export_summary_stats(sprintf("output/%s_summary.json", cfg$name), "output/summary.json")

message("Exported hexagons.geojson, segments.geojson, bike_facilities.geojson, and summary.json to the Next.js app")
