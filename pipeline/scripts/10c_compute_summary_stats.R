# 10c_compute_summary_stats.R
# Rolls up hex- and segment-level scores into study-area headline
# numbers. Run after 10b, before 11_export.R.

source("R/utils_config.R")
source("R/summary_stats.R")
library(sf)
library(jsonlite)

cfg <- load_study_area()

hexes    <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
poi      <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)
schools  <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)

summary_stats <- compute_study_area_summary(
  hexes, segments,
  poi_count = nrow(poi), schools_count = nrow(schools), stations_count = nrow(stations)
)

dir.create("output", showWarnings = FALSE)
jsonlite::write_json(summary_stats, sprintf("output/%s_summary.json", cfg$name),
                      auto_unbox = TRUE, pretty = TRUE)

message("Study area summary:")
str(summary_stats)
