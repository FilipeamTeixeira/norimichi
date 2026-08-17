# 11_export.R
# Writes the GeoJSON files the Next.js app reads directly.
#
# Export only. The intervention scoring, beneficiary join, hex context and
# corridor membership this used to derive inline now live in
# 05d_score_interventions.R and are read back off the segment table; the
# corridor rollup is 12_compute_investment_ranking.R. See 05d's header for why.

source("R/utils_config.R")
source("R/export_geojson.R")
source("R/score_lts.R")
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

# --- Derived segment fields ---
#
# Only the cheap, presentation-shaped ones. Anything that needed another layer
# or a scoring function is already on the table, put there by 05d.

if (!"way_id" %in% names(segments)) {
  stop("segment table has no way_id - run scripts/05d_score_interventions.R first")
}

# `way_id` is a row index assigned in 05d, not an OSM id; the frontend uses it
# purely as a feature identity for map hit-testing and React keys. The real OSM
# way id was being dropped on the floor - it now travels alongside as `osm_id`
# so a row in the ranking table can be checked against
# openstreetmap.org/way/<id>.
segments$osm_id    <- as.character(segments$osm_id)
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

# Per region, not shared: see export_dir() in R/utils_config.R for why these
# used to be bare output/*.geojson and what that cost.
out_dir <- export_dir(cfg)

export_hex_layer(drop_empty_hexes(hexes, segments), file.path(out_dir, "hexagons.geojson"))
export_segment_layer(segments, file.path(out_dir, "segments.geojson"))
export_cycleway_layer(segments, file.path(out_dir, "cycleways.geojson"))
export_bike_facilities_layer(bike_facilities, file.path(out_dir, "bike_facilities.geojson"))
export_amenities_layer(schools, stations, poi, file.path(out_dir, "amenities.geojson"))
export_traffic_signals_layer(traffic_signals, file.path(out_dir, "traffic_signals.geojson"))
export_summary_stats(sprintf("output/%s_summary.json", cfg$name),
                     file.path(out_dir, "summary.json"))

message("Exported hexagons.geojson, segments.geojson, cycleways.geojson, bike_facilities.geojson, amenities.geojson, traffic_signals.geojson and summary.json")
message("  into ", out_dir, "/")
message("Run scripts/12_compute_investment_ranking.R for investment_ranking.json")
