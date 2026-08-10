# 08_join_poi.R
# Counts schools/stations/shops+restaurants within a fixed radius of each
# hex centroid. Schools/stations feed the existing proximity term; shop
# counts feed the attraction_score in score_demand.R.

source("R/utils_config.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
hexes    <- sf::st_read(sprintf("output/%s_hexgrid.gpkg", cfg$name), quiet = TRUE)
schools  <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)
poi      <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)

RADIUS_M <- 1000   # "short trip" catchment - matches the 1-3km cycling range

# Project to a metric CRS for accurate distance buffering. JGD2011 / Japan
# Plane Rectangular CS zone varies by region - EPSG:6677 below is zone IX
# (Tokyo); swap for the correct zone if your pilot area is elsewhere
# (same value used in 05_build_segment_table.R - keep both in sync).
METRIC_CRS <- 6677

hex_centroids <- sf::st_centroid(hexes) |> sf::st_transform(METRIC_CRS)
schools_m  <- sf::st_transform(schools, METRIC_CRS)
stations_m <- sf::st_transform(stations, METRIC_CRS)
poi_m      <- sf::st_transform(poi, METRIC_CRS)

hexes$schools_nearby  <- lengths(sf::st_is_within_distance(hex_centroids, schools_m, RADIUS_M))
hexes$stations_nearby <- lengths(sf::st_is_within_distance(hex_centroids, stations_m, RADIUS_M))
hexes$shops_nearby    <- lengths(sf::st_is_within_distance(hex_centroids, poi_m, RADIUS_M))

sf::st_write(hexes, sprintf("output/%s_hexgrid.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
