# build_hexgrid.R
# Generates the H3 hex grid covering the study area boundary.
#
# Needs the h3jsr package: install.packages("h3jsr")
#
# NOTE: h3jsr's exact return column name for cell_to_polygon(simple=FALSE)
# has varied slightly across versions - print(names(polygons)) the first
# time you run this and adjust the rename() below if it doesn't say
# "h3_address" on your installed version.

library(h3jsr)
library(sf)
library(dplyr)

#' Build an sf polygon grid of H3 hexagons covering a study area.
#'
#' @param boundary sf/sfc polygon (WGS84) defining the study area
#' @param resolution H3 resolution - see
#'   https://h3geo.org/docs/core-library/restable/ for the area/edge-length
#'   table. Resolution 9 (~0.1 km2/cell) is a reasonable starting point for
#'   a neighbourhood-scale pilot; revisit once you see it rendered.
#' @return sf POLYGON object, one row per hex, with column `hex_id`
build_hex_grid <- function(boundary, resolution = 9) {

  cell_ids <- h3jsr::polygon_to_cells(geometry = boundary, res = resolution)
  cell_ids <- unique(unlist(cell_ids))

  polygons <- h3jsr::cell_to_polygon(cell_ids, simple = FALSE)

  polygons |>
    rename(hex_id = h3_address) |>
    sf::st_as_sf()
}
