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
  override <- getOption("norimichi.study_area")
  if (length(override) > 0) cfg[names(override)] <- override

  # `name` comes from a selector, never from the file. It used to sit in the
  # file as a `name:` key next to an `osm_relation_id:`, which restated what
  # `wards:` and `region:` already say - and two copies of one fact drift: the
  # pair went "region name, ward ID", which would have clipped one ward's
  # boundary into a file named after something else. There is one copy now.
  if (is.null(cfg$name)) {
    stop("no study area selected.\n",
         "  Pick one before sourcing a script on its own:\n",
         "    use_ward(\"Naka-ku\")   for 01-04, 05, 05b, 06-09\n",
         "    use_region()          for 09b, 05c, 10, 10b, 05d, 10c, 11, 12\n",
         "  run_ward.R and run_region.R already do this for you.")
  }
  stopifnot(!is.null(cfg$pbf_path))
  cfg
}

#' Target one ward - its output prefix and its boundary, from the `wards:`
#' registry. This is what run_ward.R runs on, and what you want before
#' sourcing any of 01-04 or 06 by hand.
use_ward <- function(ward, path = "config/study_area.yml") {
  wards <- study_wards(path)
  if (!ward %in% names(wards)) {
    stop("unknown ward: ", ward, "\n",
         "  ", path, " lists: ", paste(names(wards), collapse = ", "), "\n",
         "  Add it under `wards:` with its OSM boundary relation ID first.")
  }
  use_study_area(name = ward, osm_relation_id = wards[[ward]])
}

#' Target the merged region. No boundary relation: a region is the union of
#' its wards' extracts, not an admin area with a relation of its own - which
#' is fine, because nothing downstream of the merge clips to a boundary.
use_region <- function(path = "config/study_area.yml") {
  use_study_area(name = study_region(path))
}

#' Point the rest of this R session at a different study area.
#'
#' Every script calls load_study_area() for itself, and every one of those
#' calls re-reads config/study_area.yml off disk - so a runner cannot simply
#' assign to `cfg` and expect the next script it sources to see it. The
#' override is recorded in an R option, which survives both that re-read and
#' the repeated `source("R/utils_config.R")` at the top of every script. An
#' environment defined here would not: sourcing this file again reconstructs
#' it, silently dropping the override half way through a run.
#'
#' Fields given here win over the file; everything else still comes from it.
#' Call with no arguments to clear.
#'
#' @param ... named config fields, e.g. name = "Naka-ku"
use_study_area <- function(...) {
  fields <- list(...)
  if (length(fields) == 0) {
    options(norimichi.study_area = NULL)
    return(invisible(NULL))
  }
  if (is.null(names(fields)) || any(names(fields) == "")) {
    stop("use_study_area() takes named fields, e.g. name = \"Naka-ku\"")
  }
  options(norimichi.study_area = fields)
  invisible(fields)
}

#' The wards available to run, as a named list of OSM boundary relation IDs.
#'
#' Read straight from the file rather than through load_study_area(), since
#' this is the registry a runner consults *before* it picks a target - it must
#' not see that runner's own override.
study_wards <- function(path = "config/study_area.yml") {
  wards <- yaml::read_yaml(path)$wards
  if (length(wards) == 0) {
    stop("no wards listed in ", path, "\n",
         "  Add them under `wards:` as  <name>: <osm relation id>.")
  }
  wards
}

#' TRUE only when this R process was started as `Rscript <name>`.
#'
#' Lets the runners do the right thing either way: from a shell they run, and
#' from an R session `source()`ing them only defines their function, so
#' sourcing has no surprising side effect and you pick the ward in the call
#' rather than by editing the file. interactive() would not do - it is FALSE
#' for `Rscript -e 'source("run_ward.R")'` too.
#'
#' @param name the runner's file name, e.g. "run_ward.R"
invoked_as_script <- function(name) {
  file <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  length(file) == 1 && basename(sub("^--file=", "", file)) == name
}

#' The name the merged wards are published under. Same reasoning as above.
study_region <- function(path = "config/study_area.yml") {
  region <- yaml::read_yaml(path)$region
  if (is.null(region)) {
    stop("no `region:` in ", path, "\n",
         "  It names the merge of everything under `wards:`, and becomes the ",
         "output file prefix.")
  }
  region
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
  # The one consumer of osm_relation_id, which is why the check lives here
  # rather than in load_study_area(): the stages downstream of the merge never
  # clip to a boundary, and requiring an ID from them is what used to force a
  # region run to carry some arbitrary ward's relation.
  if (is.null(cfg$osm_relation_id)) {
    stop("this stage clips to a ward boundary, but the selected study area ",
         "has none: ", cfg$name, "\n",
         "  use_ward(\"<name>\") first. use_region() deliberately sets no ",
         "boundary -\n  a region is the union of its wards' extracts, not a ",
         "relation of its own.")
  }

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
