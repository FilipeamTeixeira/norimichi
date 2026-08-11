# 01d_download_traffic_signals.R
# Loads traffic signal locations for the study area - needed for
# realistic travel-time estimation on a per-route basis (see
# fetch_osm.R's get_traffic_signals()). Run after 01, before 05.

source("R/utils_config.R")
source("R/fetch_osm.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

signals <- get_traffic_signals(pbf_path = cfg$pbf_path, boundary = boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(signals, sprintf("output/%s_traffic_signals.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Loaded %d traffic signals for %s", nrow(signals), cfg$name))
