# 11_export.R
# Final step: writes the GeoJSON files the Next.js app reads directly.
#
# Derives remaining fields that depend on cross-layer data (beneficiary
# estimates from hex population, recommendation text from segment attributes).

source("R/utils_config.R")
source("R/export_geojson.R")
source("R/score_lts.R")
source("R/score_suitability.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
hexes           <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
segments        <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
bike_facilities <- sf::st_read(sprintf("output/%s_bike_facilities.gpkg", cfg$name), quiet = TRUE)
schools         <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations        <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)
poi             <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)
traffic_signals <- sf::st_read(sprintf("output/%s_traffic_signals.gpkg", cfg$name), quiet = TRUE)

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
    segments$cycleway_right, segments$cycleway_both,
    segments$highway, segments$bicycle
  )
}
if (!"cycleway_type" %in% names(segments)) {
  segments$cycleway_type <- classify_cycleway_type(
    segments$highway, segments$bicycle, segments$segregated,
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

# --- Recommendation, cost tier, and expected score after intervention ---
#
# Labels are deliberately the same five intervention types the design's
# sidebar filter offers, so that filter can actually match against this
# field rather than being decorative. ("Bike parking" is the one sidebar
# type with no segment-level equivalent - it's a point facility, already
# covered by the bike_facilities layer.)
#
# `bridges_islands` is tested first: when the network analysis says
# upgrading a segment would merge two low-stress islands, that framing
# ("missing link") is the most important thing to say about it, ahead of
# whatever its lane count or speed limit happens to be.

segments$recommendation <- case_when(
  segments$has_cycle_infra                       ~ NA_character_,
  segments$lts < 3                               ~ NA_character_,
  segments$bridges_islands                       ~ "Missing link",
  segments$lanes_n >= 3 | segments$speed_kmh > 40 ~ "Protected cycle lane",
  segments$likely_informal_parking               ~ "Traffic calming",
  segments$traffic_signals_count >= 2            ~ "Crossing improvement",
  TRUE                                           ~ "Protected cycle lane"
)

message("Recommendation distribution:")
print(table(segments$recommendation, useNA = "no"))

# Cost tier scales with how much physical road space has to be reallocated.
segments$cost_tier <- case_when(
  is.na(segments$recommendation)                        ~ NA_character_,
  segments$lanes_n >= 4 | segments$speed_kmh >= 60      ~ "High",
  segments$lanes_n == 3 | segments$speed_kmh > 40       ~ "Medium",
  TRUE                                                  ~ "Low"
)

# Expected suitability after the intervention. Rather than a flat "+44",
# re-run the actual scoring function under the counterfactual that the
# segment now has cycle infrastructure - score_lts()'s own rules say such a
# segment is LTS 1 at <=40km/h and LTS 2 above it, so the "after" number is
# derived from the same logic that produced the "before" one.
segments$suitability_after <- ifelse(
  is.na(segments$recommendation),
  NA_integer_,
  score_suitability(
    lts                = ifelse(segments$speed_kmh <= 40, 1L, 2L),
    sidewalk_available = segments$sidewalk_available,
    has_cycle_infra    = TRUE
  )
)

message(sprintf("Segments with recommendations: %d of %d",
                sum(!is.na(segments$recommendation)), nrow(segments)))
message(sprintf("Mean expected suitability gain: %.1f points",
                mean(segments$suitability_after - segments$suitability_score,
                     na.rm = TRUE)))

export_hex_layer(drop_empty_hexes(hexes, segments), "output/hexagons.geojson")
export_segment_layer(segments, "output/segments.geojson")
export_cycleway_layer(segments, "output/cycleways.geojson")
export_bike_facilities_layer(bike_facilities, "output/bike_facilities.geojson")
export_amenities_layer(schools, stations, poi, "output/amenities.geojson")
export_traffic_signals_layer(traffic_signals, "output/traffic_signals.geojson")
export_summary_stats(sprintf("output/%s_summary.json", cfg$name), "output/summary.json")

message("Exported hexagons.geojson, segments.geojson, cycleways.geojson, bike_facilities.geojson, amenities.geojson, traffic_signals.geojson and summary.json to the Next.js app")
