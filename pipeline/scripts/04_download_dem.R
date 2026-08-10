# 04_download_dem.R
# Fetches and mosaics GSI DEM tiles for the study area, computes slope.

source("R/utils_config.R")
source("R/fetch_dem.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)   # fetches the actual relation polygon
bbox <- sf::st_bbox(boundary)          # DEM tiles are fetched by bbox, not polygon

dem <- fetch_dem_for_bbox(bbox)
slope <- compute_slope(dem)

dir.create("output", showWarnings = FALSE)
terra::writeRaster(dem,   sprintf("output/%s_dem.tif", cfg$name),   overwrite = TRUE)
terra::writeRaster(slope, sprintf("output/%s_slope.tif", cfg$name), overwrite = TRUE)

message("DEM + slope saved")
