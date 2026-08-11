# 05b_join_segment_context.R
# Joins school proximity, station proximity, and slope to individual
# road segments. Runs after 05 (which builds the segment table with LTS)
# and uses outputs from 03 (schools/stations) and 04 (slope raster).

source("R/utils_config.R")
library(sf)
library(terra)
library(dplyr)

cfg <- load_study_area()

segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
schools  <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)
slope    <- terra::rast(sprintf("output/%s_slope.tif", cfg$name))

METRIC_CRS <- 6677
SCHOOL_BUFFER_M  <- 500
STATION_BUFFER_M <- 500
FLAT_THRESHOLD_DEGREES <- 3

segments_m <- sf::st_transform(segments, METRIC_CRS)
schools_m  <- sf::st_transform(schools, METRIC_CRS)
stations_m <- sf::st_transform(stations, METRIC_CRS)

# --- School proximity ---
segments$school_nearby <- lengths(sf::st_intersects(
  sf::st_buffer(segments_m, SCHOOL_BUFFER_M), schools_m
))

message(sprintf("Segments with schools within %dm: %d of %d",
                SCHOOL_BUFFER_M,
                sum(segments$school_nearby > 0), nrow(segments)))

# --- Station proximity ---
segments$station_nearby <- lengths(sf::st_intersects(
  sf::st_buffer(segments_m, STATION_BUFFER_M), stations_m
))

message(sprintf("Segments with stations within %dm: %d of %d",
                STATION_BUFFER_M,
                sum(segments$station_nearby > 0), nrow(segments)))

# --- Segment-level slope ---
segments_v <- terra::vect(sf::st_transform(segments, terra::crs(slope)))
mean_slope <- terra::extract(slope, segments_v, fun = mean, na.rm = TRUE)

segments$mean_slope_deg <- mean_slope[, 2]
segments$flat_terrain <- segments$mean_slope_deg <= FLAT_THRESHOLD_DEGREES

message(sprintf("Segments with flat terrain: %d of %d",
                sum(segments$flat_terrain, na.rm = TRUE), nrow(segments)))

sf::st_write(segments, sprintf("output/%s_segments.gpkg", cfg$name),
             delete_dsn = TRUE, quiet = TRUE)

message("Segment context joined: school_nearby, station_nearby, slope")
