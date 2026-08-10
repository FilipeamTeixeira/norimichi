# 01c_download_footways.R
# Loads pedestrian footway geometries for the study area - used to detect
# sidewalks mapped as their own line rather than a `sidewalk=*` tag on
# the road (see fetch_osm.R's get_footways() and score_lts.R's sidewalk
# notes). Run after 01, before 05.

source("R/utils_config.R")
source("R/fetch_osm.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

footways <- get_footways(pbf_path = cfg$pbf_path, boundary = boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(footways, sprintf("output/%s_footways.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Loaded %d footway segments for %s", nrow(footways), cfg$name))
