# 01b_download_poi.R
# Loads shop/restaurant/service POIs for the study area and saves an
# intermediate .gpkg, same pattern as 01_download_osm.R (same pbf_path,
# same boundary). Run this after 01 - both 05_build_segment_table.R and
# 08_join_poi.R depend on its output.

source("R/utils_config.R")
source("R/fetch_poi.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

poi <- get_poi(pbf_path = cfg$pbf_path, boundary = boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(poi, sprintf("output/%s_poi.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Loaded %d POI points for %s", nrow(poi), cfg$name))
