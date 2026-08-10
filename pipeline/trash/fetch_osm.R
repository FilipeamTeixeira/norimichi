# fetch_osm.R
# Reads a Geofabrik .osm.pbf extract and returns the road network as an sf
# object, clipped to the study area, with only the tags needed for LTS
# scoring.
#
# Prerequisite: download the .pbf manually from
# https://download.geofabrik.de/asia/japan.html and place it in
# pipeline/raw/osm/
#
# Needs the osmextract package: install.packages("osmextract")

library(osmextract)
library(sf)
library(dplyr)

# Way types a cyclist could plausibly use. Excludes motorways/trunk roads
# (illegal or unsafe to cycle on) - add/remove types here if your area
# needs it (e.g. add "footway" if you want to model shared paths too).
CYCLABLE_HIGHWAY_TYPES <- c(
  "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "residential", "living_street",
  "unclassified", "cycleway", "path", "service"
)

# Tags osmextract should keep. Listing them explicitly (rather than
# reading all tags) keeps the vectortranslate step faster on a big extract.
OSM_EXTRA_TAGS <- c(
  "highway", "cycleway", "cycleway:left", "cycleway:right", "cycleway:both",
  "maxspeed", "lanes", "oneway",
  "parking:lane:left", "parking:lane:right", "parking:lane:both",
  "surface", "lit", "name"
)

#' Load OSM roads for the study area from a local .osm.pbf file.
#'
#' Builds vectortranslate_options explicitly (clip + `-nlt PROMOTE_TO_MULTI`)
#' rather than relying on `boundary`/`boundary_type`'s automatic option
#' handling. The automatic version is documented to add the equivalent
#' clip options, but in practice didn't reliably add PROMOTE_TO_MULTI
#' together with `extra_tags`, which is what caused the "MULTILINESTRING
#' inserted into layer... LINESTRING" GDAL warning even after casting the
#' result afterwards - that warning fires inside the C-level translate
#' step, before the R object is ever returned, so nothing done to the
#' object afterwards (like st_cast()) can retroactively silence it. This
#' mirrors the working pattern in
#' https://github.com/ropensci/osmextract/issues/178
#'
#' NOTE: passing `extra_tags` makes osmextract generate a temporary GDAL
#' config (.ini) file for this read. On some GDAL versions that triggers a
#' harmless warning: `GDAL Message 1: Layer 'general' mentioned in
#' .../*.ini is unknown to the driver`. This is a known cosmetic quirk of
#' that auto-generated config, not a sign of missing/wrong data - safe to
#' ignore.
#'
#' @param pbf_path path to the downloaded .osm.pbf
#' @param boundary sf/sfc polygon or bbox used to clip the extract (WGS84)
#' @return sf MULTILINESTRING, one row per way, columns = OSM_EXTRA_TAGS + geometry
get_osm_roads <- function(pbf_path, boundary) {

  boundary_wkt <- sf::st_as_text(sf::st_combine(boundary))

  vectortranslate_options <- c(
    "-t_srs", "EPSG:4326",
    "-clipsrc", boundary_wkt,     # clips geometries, not just selects by intersection
    "-nlt", "PROMOTE_TO_MULTI"    # declares the output layer as multi-type up front
  )

  roads <- osmextract::oe_read(
    pbf_path,
    layer = "lines",
    extra_tags = OSM_EXTRA_TAGS,
    vectortranslate_options = vectortranslate_options,
    force_vectortranslate = TRUE,  # a .gpkg cached from a run with the old
    # options would otherwise be reused as-is
    quiet = FALSE
  )

  roads |>
    dplyr::filter(highway %in% CYCLABLE_HIGHWAY_TYPES) |>
    sf::st_cast("MULTILINESTRING")  # belt-and-braces: keeps this correct
  # even if PROMOTE_TO_MULTI ever stops
  # applying to some geometries upstream
}
