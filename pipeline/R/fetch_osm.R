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
  "surface", "lit", "name", "sidewalk"
)

#' Load OSM roads for the study area from a local .osm.pbf file.
#'
#' Uses osmextract's `boundary`/`boundary_type = "clipsrc"` to clip during
#' the GDAL vectortranslate step.
#'
#' An earlier version of this function built a fully custom
#' `vectortranslate_options` instead (adding `-nlt PROMOTE_TO_MULTI`
#' directly) specifically to silence a GDAL warning about mixed
#' LINESTRING/MULTILINESTRING geometry. That worked for silencing the
#' warning, but it also caused every `extra_tags` column (cycleway:left,
#' parking:lane:left, etc.) to disappear from the output entirely -
#' `extra_tags` and a fully custom `vectortranslate_options` don't combine
#' reliably in every osmextract version (a known historical interaction:
#' https://github.com/ropensci/osmextract/issues/182). Reverted: a
#' cosmetic console warning is a much smaller problem than silently losing
#' the columns score_lts() depends on.
#'
#' Two warnings you may see from this call, both harmless:
#'  - `Layer 'general' mentioned in .../*.ini is unknown to the driver` -
#'    a quirk of the temporary GDAL config `extra_tags` generates.
#'  - `A geometry of type MULTILINESTRING is inserted into layer... of
#'    geometry type LINESTRING... the driver will however do it` - GDAL
#'    says outright that it handles this correctly despite the warning;
#'    the st_cast() below also normalizes this at the R level regardless,
#'    so nothing downstream sees mixed types either way.
#'
#' @param pbf_path path to the downloaded .osm.pbf
#' @param boundary sf/sfc polygon or bbox used to clip the extract (WGS84)
#' @return sf MULTILINESTRING, one row per way, columns = OSM_EXTRA_TAGS + geometry
get_osm_roads <- function(pbf_path, boundary) {

  roads <- osmextract::oe_read(
    pbf_path,
    layer = "lines",
    extra_tags = OSM_EXTRA_TAGS,
    boundary = boundary,
    boundary_type = "clipsrc",     # clips geometries, not just selects by intersection
    force_vectortranslate = TRUE,  # avoid reusing a .gpkg cached under a
                                    # previous version of this function's options
    quiet = FALSE
  )

  roads |>
    dplyr::filter(highway %in% CYCLABLE_HIGHWAY_TYPES) |>
    sf::st_cast("MULTILINESTRING")
}

#' Load pedestrian footway geometries from the same local .osm.pbf.
#'
#' score_lts.R's sidewalk detection originally only checked the
#' `sidewalk=*` tag on the road itself. That misses a common Japanese
#' mapping convention: a sidewalk drawn as its own separate
#' `highway=footway` line running parallel to the road, with no
#' `sidewalk` tag on the road at all. This function fetches those
#' footways so 05_build_segment_table.R can check proximity instead of
#' relying on the tag alone.
#'
#' Deliberately a separate oe_read() call rather than folding into
#' get_osm_roads() (which already filters to CYCLABLE_HIGHWAY_TYPES,
#' excluding footways) - costs a second vectortranslate pass over the
#' file, but keeps get_osm_roads()'s existing, tested behavior untouched.
#'
#' @param pbf_path path to the same .osm.pbf used for roads/boundary
#' @param boundary sf/sfc polygon used to clip the extract (WGS84)
#' @return sf MULTILINESTRING, one row per footway
get_footways <- function(pbf_path, boundary) {
  footways <- osmextract::oe_read(
    pbf_path,
    layer = "lines",
    extra_tags = c("highway", "footway"),
    boundary = boundary,
    boundary_type = "clipsrc",
    force_vectortranslate = TRUE,
    quiet = FALSE
  )

  footways |>
    dplyr::filter(highway == "footway") |>
    sf::st_cast("MULTILINESTRING")
}

#' Load traffic signal locations from the same local .osm.pbf.
#'
#' Needed for realistic travel-time estimation: a route's actual travel
#' time (and anything derived from it - congestion cost, car-vs-bike time
#' comparison) depends heavily on how many signalized intersections it
#' crosses, not just its distance and speed limit. This pipeline's
#' study-area-wide ROI estimate (score_roi.R) deliberately uses a flat
#' average trip duration rather than a network travel-time model, but a
#' future per-route calculator on the frontend will need this - along
#' with the speed limit, which score_lts.R already parses but keeps as
#' `speed_kmh` (see below) rather than exporting the raw untidy tag.
#'
#' @param pbf_path path to the same .osm.pbf used for roads/boundary
#' @param boundary sf/sfc polygon used to clip the extract (WGS84)
#' @return sf POINT, one row per traffic signal
get_traffic_signals <- function(pbf_path, boundary) {
  points <- osmextract::oe_read(
    pbf_path,
    layer = "points",
    extra_tags = c("highway"),
    boundary = boundary,
    boundary_type = "clipsrc",
    force_vectortranslate = TRUE,
    quiet = FALSE
  )

  points |> dplyr::filter(highway == "traffic_signals")
}

#' Load bicycle parking AND bike-sharing facilities from the same local
#' .osm.pbf, distinguished by a `facility_type` column ("parking" vs
#' "sharing"). OSM tags these as two different amenity values:
#'   - amenity=bicycle_parking - racks/sheds for personally-owned bikes
#'   - amenity=bicycle_rental  - docking stations for shared/rental bikes
#'     (Docomo Bike Share, HELLO CYCLING etc. are common in Japan)
#' These matter differently: parking only helps someone who already has
#' a bike, while a sharing station is itself a transport option for
#' people who don't - directly relevant to the "people who can't afford
#' a bike/car" persona from the project's original framing, not just an
#' amenity for existing cyclists.
#'
#' Kept separate from fetch_poi.R's get_poi(), even though both read
#' `amenity=*` tags from the same "points" layer - POI there models trip
#' *attraction* (shops/restaurants people cycle to), while bike
#' parking/sharing is *supply* (whether they can actually leave the bike,
#' or get one, once they arrive). Mixing the two would understate
#' attraction_score wherever a hex is full of bike racks but isn't itself
#' a destination, and would hide a real, distinct gap: a station or
#' shopping street with strong demand and safe roads but nowhere to park
#' is still a missed opportunity, just a different kind than an
#' infrastructure gap in the road network.
#'
#' NOTE: if this returns far fewer facilities than you know exist on the
#' ground, that's very likely genuine OSM under-mapping rather than a
#' bug here - amenity-level detail like bike racks is mapped far less
#' consistently than roads/schools/stations, and coverage varies a lot by
#' area depending on whether local contributors have specifically
#' surveyed it. Worth independently checking via overpass-turbo.eu with
#' a raw query for `amenity=bicycle_parking` over your study area's bbox
#' before assuming the pipeline is at fault.
#'
#' @param pbf_path path to the same .osm.pbf used for roads/boundary
#' @param boundary sf/sfc polygon used to clip the extract (WGS84)
#' @return sf POINT, one row per facility, columns: amenity, capacity,
#'   facility_type ("parking" or "sharing")
get_bike_facilities <- function(pbf_path, boundary) {
  # 1. Fetch Point geometries (Nodes)
  points <- osmextract::oe_read(
    pbf_path,
    layer = "points",
    extra_tags = c("amenity", "capacity"),
    boundary = boundary,
    boundary_type = "clipsrc",
    force_vectortranslate = TRUE,
    quiet = FALSE
  ) |>
    dplyr::filter(amenity %in% c("bicycle_parking", "bicycle_rental"))

  # 2. Fetch Polygon geometries (Ways/Areas)
  polygons <- osmextract::oe_read(
    pbf_path,
    layer = "multipolygons",
    extra_tags = c("amenity", "capacity"),
    boundary = boundary,
    boundary_type = "clipsrc",
    force_vectortranslate = TRUE,
    quiet = FALSE
  ) |>
    dplyr::filter(amenity %in% c("bicycle_parking", "bicycle_rental"))

  # 3. Convert polygons to points (centroids) and combine
  if (nrow(polygons) > 0) {
    # Suppress constant geometry warning for centroids
    polygons_as_points <- suppressWarnings(sf::st_centroid(polygons))
    combined_facilities <- dplyr::bind_rows(points, polygons_as_points)
  } else {
    combined_facilities <- points
  }

  combined_facilities |>
    dplyr::mutate(facility_type = ifelse(amenity == "bicycle_parking", "parking", "sharing"))
}
