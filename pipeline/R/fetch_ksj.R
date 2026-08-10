# fetch_ksj.R
# KSJ (国土数値情報) ships as shapefiles per theme (schools, railway
# stations, land use, admin boundaries), downloaded manually from
# https://nlftp.mlit.go.jp/ksj/ - this file just standardizes reading and
# reprojecting them, and clipping to the study area.
#
# Note: KSJ organizes datasets by theme code (schools and stations are
# separate themes from land use, etc.) and the codes occasionally change -
# check the current theme code for what you need on the KSJ site itself
# rather than relying on a hardcoded value here.

library(sf)
library(dplyr)

#' Read a KSJ shapefile and reproject to WGS84.
#' @param path path to the .shp file
read_ksj <- function(path) {
  sf::st_read(path, quiet = TRUE) |>
    sf::st_transform(4326)
}

#' Filter a KSJ point dataset (schools, stations, etc.) to features that
#' fall within a study area boundary.
#' @param points_sf sf POINT object, e.g. from read_ksj()
#' @param boundary sf/sfc polygon (WGS84)
filter_points_in_area <- function(points_sf, boundary) {
  points_sf[sf::st_intersects(points_sf, boundary, sparse = FALSE)[, 1], ]
}
