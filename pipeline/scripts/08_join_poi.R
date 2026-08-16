# 08_join_poi.R
# Counts schools/stations/shops+restaurants within a fixed radius of each
# hex centroid. Schools/stations feed the existing proximity term; shop
# counts feed the attraction_score in score_potential.R. Bike parking is
# joined separately at a smaller radius - see the notes below.

source("R/utils_config.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
hexes           <- sf::st_read(sprintf("output/%s_hexgrid.gpkg", cfg$name), quiet = TRUE)
schools         <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations        <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)
poi             <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)
bike_facilities <- sf::st_read(sprintf("output/%s_bike_facilities.gpkg", cfg$name), quiet = TRUE)

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
bike_facilities_m <- sf::st_transform(bike_facilities, METRIC_CRS)

hexes$schools_nearby  <- lengths(sf::st_is_within_distance(hex_centroids, schools_m, RADIUS_M))
hexes$stations_nearby <- lengths(sf::st_is_within_distance(hex_centroids, stations_m, RADIUS_M))
hexes$shops_nearby    <- lengths(sf::st_is_within_distance(hex_centroids, poi_m, RADIUS_M))

# --- Bike facilities (parking + sharing), at a much smaller radius ------
# Schools/stations/shops use a 1km "would you cycle this far" catchment,
# but bike parking/sharing only helps if it's essentially at the
# destination - a rack 1km away is useless. Kept as its own fields rather
# than folded into attraction_score: a hex full of bike racks isn't
# itself a destination, and "high demand, safe roads, nowhere to
# park/rent" is a distinct, real gap worth surfacing on its own, not
# blended into an unrelated number.
#
# Parking and sharing are tracked as separate fields, not combined - a
# parking rack only helps someone who already owns a bike, while a
# sharing station is itself a transport option for people who don't.
BIKE_PARKING_RADIUS_M <- 300

#' Parse a `capacity` tag to an integer. OSM entries often omit capacity
#' entirely - default to a small standard size rather than 0, since "some
#' capacity, unknown how much" is more honest than implying none at all.
parse_bike_capacity <- function(capacity, default_capacity = 4) {
  n <- suppressWarnings(as.integer(capacity))
  ifelse(is.na(n), default_capacity, n)
}
bike_facilities_m <- sf::st_transform(bike_facilities, METRIC_CRS)
bike_facilities_m$capacity_n <- parse_bike_capacity(bike_facilities_m$capacity)

#' Nearby count + summed capacity for one facility_type, within
#' BIKE_PARKING_RADIUS_M of each hex centroid.
join_bike_facility_type <- function(facility_type) {
  subset_m <- bike_facilities_m[bike_facilities_m$facility_type == facility_type, ]
  within <- sf::st_is_within_distance(hex_centroids, subset_m, BIKE_PARKING_RADIUS_M)
  list(
    nearby = lengths(within),
    capacity = sapply(within, function(idx) sum(subset_m$capacity_n[idx]))
  )
}

parking_joined <- join_bike_facility_type("parking")
sharing_joined <- join_bike_facility_type("sharing")

hexes$bike_parking_nearby <- parking_joined$nearby
hexes$bike_parking_capacity_nearby <- parking_joined$capacity
hexes$bike_sharing_nearby <- sharing_joined$nearby
hexes$bike_sharing_capacity_nearby <- sharing_joined$capacity

sf::st_write(hexes, sprintf("output/%s_hexgrid.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
