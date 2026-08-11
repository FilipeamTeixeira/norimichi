# 08_join_poi.R
# Counts schools/stations/shops+restaurants within a fixed radius of each
# hex centroid. Schools/stations feed the existing proximity term; shop
# counts feed the attraction_score in score_demand.R. Bike parking is
# joined separately at a smaller radius - see the notes below.

source("R/utils_config.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
hexes        <- sf::st_read(sprintf("output/%s_hexgrid.gpkg", cfg$name), quiet = TRUE)
schools      <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations     <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)
poi          <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)
bike_parking <- sf::st_read(sprintf("output/%s_bike_parking.gpkg", cfg$name), quiet = TRUE)

RADIUS_M <- 1000   # "short trip" catchment - matches the 1-3km cycling range

# Project to a metric CRS for accurate distance buffering. JGD2011 / Japan
# Plane Rectangular CS zone varies by region - EPSG:6677 below is zone IX
# (Tokyo); swap for the correct zone if your pilot area is elsewhere
# (same value used in 05_build_segment_table.R - keep both in sync).
METRIC_CRS <- 6677

hex_centroids <- sf::st_centroid(hexes) |> sf::st_transform(METRIC_CRS)
schools_m      <- sf::st_transform(schools, METRIC_CRS)
stations_m     <- sf::st_transform(stations, METRIC_CRS)
poi_m          <- sf::st_transform(poi, METRIC_CRS)
bike_parking_m <- sf::st_transform(bike_parking, METRIC_CRS)

hexes$schools_nearby  <- lengths(sf::st_is_within_distance(hex_centroids, schools_m, RADIUS_M))
hexes$stations_nearby <- lengths(sf::st_is_within_distance(hex_centroids, stations_m, RADIUS_M))
hexes$shops_nearby    <- lengths(sf::st_is_within_distance(hex_centroids, poi_m, RADIUS_M))

# --- Bike parking, at a much smaller radius --------------------------------
# Schools/stations/shops use a 1km "would you cycle this far" catchment,
# but bike parking only helps if it's essentially at the destination - a
# rack 1km away is useless. Kept as its own field rather than folded into
# attraction_score: a hex full of bike racks isn't itself a destination,
# and "high demand, safe roads, nowhere to park" is a distinct, real gap
# worth surfacing on its own, not blended into an unrelated number.
BIKE_PARKING_RADIUS_M <- 300

#' Parse a `capacity` tag to an integer. OSM bicycle_parking entries often
#' omit capacity entirely - default to a small standard rack size rather
#' than 0, since "some capacity, unknown how much" is more honest than
#' implying no capacity at all.
parse_bike_capacity <- function(capacity, default_capacity = 4) {
  n <- suppressWarnings(as.integer(capacity))
  ifelse(is.na(n), default_capacity, n)
}
bike_parking_m$capacity_n <- parse_bike_capacity(bike_parking_m$capacity)

bike_parking_within <- sf::st_is_within_distance(hex_centroids, bike_parking_m, BIKE_PARKING_RADIUS_M)
hexes$bike_parking_nearby <- lengths(bike_parking_within)
hexes$bike_parking_capacity_nearby <- sapply(bike_parking_within, function(idx) {
  sum(bike_parking_m$capacity_n[idx])
})

sf::st_write(hexes, sprintf("output/%s_hexgrid.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
