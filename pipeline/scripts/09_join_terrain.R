# 09_join_terrain.R
# Attaches mean slope per hex and a flat_terrain flag.

source("R/utils_config.R")
library(sf)
library(terra)
library(dplyr)

cfg <- load_study_area()
hexes <- sf::st_read(sprintf("output/%s_hexgrid.gpkg", cfg$name), quiet = TRUE)
slope <- terra::rast(sprintf("output/%s_slope.tif", cfg$name))

FLAT_THRESHOLD_DEGREES <- 3   # tune against how "flat" reads in your pilot area

hexes_v <- terra::vect(hexes)
mean_slope <- terra::extract(slope, hexes_v, fun = mean, na.rm = TRUE)

hexes$mean_slope_deg <- mean_slope[, 2]
hexes$flat_terrain <- hexes$mean_slope_deg <= FLAT_THRESHOLD_DEGREES

sf::st_write(hexes, sprintf("output/%s_hexgrid.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
