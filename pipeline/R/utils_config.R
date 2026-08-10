# utils_config.R
# Small helper so every script reads the study area definition the same
# way. Keeps "which place am I processing" in exactly one place.

library(yaml)
library(sf)
library(osmextract)
library(dplyr)

`%||%` <- function(a, b) if (is.null(a)) b else a

#' Load the study area config
#' @param path path to config/study_area.yml
#' @return a list with name, pbf_path, osm_relation_id, crs, hex_resolution
load_study_area <- function(path = "config/study_area.yml") {
  cfg <- yaml::read_yaml(path)
  stopifnot(!is.null(cfg$osm_relation_id), !is.null(cfg$pbf_path))
  cfg
}

#' Fetch the study area's administrative boundary directly from the local
#' .osm.pbf file, using its OSM relation ID - no network call needed,
#' since the boundary relation is already part of the same file the road
#' network comes from. Name kept as `study_area_bbox_sf` even though it's
#' not a bbox, since every other script in the pipeline calls it by this
#' name.
#'
#' Earlier versions of this function queried Nominatim over the network
#' instead. That turned out to be the wrong dependency twice over: it
#' returned a boundary far from Shibuya's real location for reasons never
#' fully pinned down, and Nominatim's usage policy started actively
#' rejecting the requests outright. Reading the relation locally sidesteps
#' both problems, and is the standard way to pull an administrative
#' boundary out of an OSM extract - GDAL's OSM driver assembles relations
#' tagged type=multipolygon or type=boundary (how administrative
#' boundaries are modeled) into a "multipolygons" layer, with `osm_id`
#' holding the bare numeric relation ID as a string.
#'
#' @param cfg the list returned by load_study_area()
#' @return sfc POLYGON/MULTIPOLYGON, single feature, CRS 4326
study_area_bbox_sf <- function(cfg) {
  candidates <- osmextract::oe_read(
    cfg$pbf_path,
    layer = "multipolygons",
    vectortranslate_options = c("-where", "boundary='administrative'"),
    quiet = TRUE
  )

  match <- candidates |> dplyr::filter(osm_id == as.character(cfg$osm_relation_id))

  if (nrow(match) == 0) {
    stop(
      "No administrative boundary relation found for osm_relation_id: ",
      cfg$osm_relation_id, " in ", cfg$pbf_path,
      " - check the ID is correct and that the relation is fully contained",
      " in your downloaded extract (a relation clipped by the extract's",
      " edge won't assemble into a complete polygon)."
    )
  }
  if (nrow(match) > 1) {
    warning("Multiple boundary features matched osm_relation_id ",
            cfg$osm_relation_id, " - using the first one.")
  }

  sf::st_geometry(match)[1] |> sf::st_set_crs(cfg$crs %||% 4326)
}
