# 06_build_hex_grid.R

source("R/utils_config.R")
source("R/build_hexgrid.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

hexes <- build_hex_grid(boundary, resolution = cfg$hex_resolution)

sf::st_write(hexes, sprintf("output/%s_hexgrid.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Built %d hexes at resolution %d", nrow(hexes), cfg$hex_resolution))
