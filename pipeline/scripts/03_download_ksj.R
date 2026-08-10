# 03_download_ksj.R
# Reads the manually-downloaded KSJ shapefiles (schools, stations) and
# clips them to the study area.

source("R/utils_config.R")
source("R/fetch_ksj.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

schools  <- filter_points_in_area(read_ksj("/Users/Fil/norimichi/pipeline/raw/ksj/P29-21_14.shp"), boundary)
stations <- filter_points_in_area(read_ksj("/Users/Fil/norimichi/pipeline/raw/stations/N02-25_Station.shp"), boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(schools,  sprintf("output/%s_schools.gpkg", cfg$name),  delete_dsn = TRUE, quiet = TRUE)
sf::st_write(stations, sprintf("output/%s_stations.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("%d schools, %d stations in study area", nrow(schools), nrow(stations)))
