# 01e_download_bike_parking.R
# Loads bicycle parking facility locations for the study area - parking
# availability is a real barrier even where demand and road safety are
# both good (see fetch_osm.R's get_bike_parking()). Run after 01, before 08.

source("R/utils_config.R")
source("R/fetch_osm.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

bike_parking <- get_bike_parking(pbf_path = cfg$pbf_path, boundary = boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(bike_parking, sprintf("output/%s_bike_parking.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Loaded %d bike parking facilities for %s", nrow(bike_parking), cfg$name))
