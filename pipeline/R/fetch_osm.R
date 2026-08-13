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

# Shared with score_lts.R - see the note at the top of that file about why
# this vocabulary lives on its own.
source("R/osm_cycling_tags.R")

# Way types a cyclist could plausibly use *by default*, i.e. without
# needing a bicycle=* tag to say so. Excludes motorways, which in Japan are
# 自動車専用道路 and genuinely closed to bicycles.
#
# TRUNK IS INCLUDED, and was not until a reported gap forced the question.
# `highway=trunk` in Japan marks a road's place in the national/prefectural
# route hierarchy, not the kind of facility it is: of the 167 trunk/trunk_link
# ways around this study area, none is `motorroad=yes`, 160 carry an ordinary
# street name, and the modal one is 2 lanes at 40-50km/h. Cycling them is
# legal - Japan bars bicycles from 自動車専用道路, which OSM tags
# `highway=motorway` or `motorroad=yes`, not from trunk roads. Excluding the
# class dropped 42km of ridable street, and dropped it invisibly: way
# 222974803 is 海岸通り, 40km/h, 2 lanes, `access=yes`, and sat in the middle
# of a corridor whose two halves then had nothing between them. Exactly the
# streets a cycling study most needs to see - busy, direct, unprovided for -
# were the ones it could not see.
#
# What actually makes a way uncyclable is tagged on the way; see
# CYCLING_PROHIBITED_* below.
CYCLABLE_HIGHWAY_TYPES <- c(
  "trunk", "trunk_link",
  "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "residential", "living_street",
  "unclassified", "cycleway", "path", "service"
)

# `bicycle=*` values that bar riding, whatever the highway class says. The
# safety valve that makes including trunk defensible: 14 of the 167 trunk ways
# here carry one of these - the elevated and ramp sections - and they are now
# excluded for the reason that actually applies to them rather than by a class
# rule that also caught 海岸通り.
CYCLING_PROHIBITED_BICYCLE <- c("no", "dismount")

# `motorroad=yes` is OSM's tag for a road with motorway-like access
# restrictions that is not tagged as a motorway - 自動車専用道路 in Japan.
# None in this study area, but a class-based exclusion cannot be relied on to
# catch them in the next one.
CYCLING_PROHIBITED_MOTORROAD <- "yes"

# Tags osmextract should keep. Listing them explicitly (rather than
# reading all tags) keeps the vectortranslate step faster on a big extract.
#
# `bicycle`, `foot` and `segregated` are what distinguish a shared
# bike/pedestrian path from an ordinary sidewalk, and a segregated path
# (bikes have their own marked half) from one where riders and walkers
# mix. All three are needed by classify_cycleway_type() in score_lts.R.
OSM_EXTRA_TAGS <- c(
  "highway", "cycleway", "cycleway:left", "cycleway:right", "cycleway:both",
  "bicycle", "foot", "segregated",
  # Needed to exclude 自動車専用道路 by the tag that says so, now that trunk
  # roads are no longer excluded by class - see CYCLABLE_HIGHWAY_TYPES.
  "motorroad",
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
#' The network is the union of two rules, not one list of highway types:
#' ways cyclable by default (CYCLABLE_HIGHWAY_TYPES), plus shared
#' bike/pedestrian paths that are only cyclable because OSM says so
#' (SHARED_PATH_HIGHWAY_TYPES + a permissive `bicycle` tag). Folding the
#' second rule in here rather than exporting it as a separate layer is
#' deliberate: those paths have to be in the *same* table as the roads for
#' score_network.R's adjacency graph to see them, and a shared path is
#' usually exactly the link that joins two low-stress islands. Kept out,
#' the connectivity analysis reported a fragmented network and scored
#' bridges over gaps that a rider can already cross.
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

  bicycle_val <- tolower(trimws(as.character(roads$bicycle)))
  motorroad_val <- if ("motorroad" %in% names(roads))
    tolower(trimws(as.character(roads$motorroad))) else rep(NA_character_, nrow(roads))

  # Prohibition is checked after inclusion, not folded into it, because the two
  # rules answer different questions: the class list says what kind of way is
  # worth looking at, and this says where a rider may not legally go. A
  # `bicycle=no` residential street is excluded too - it was not before, and
  # the network claimed a link no rider is allowed to use.
  prohibited <- (!is.na(bicycle_val) & bicycle_val %in% CYCLING_PROHIBITED_BICYCLE) |
    (!is.na(motorroad_val) & motorroad_val %in% CYCLING_PROHIBITED_MOTORROAD)

  roads |>
    dplyr::filter(
      !prohibited &
        (highway %in% CYCLABLE_HIGHWAY_TYPES |
           (highway %in% SHARED_PATH_HIGHWAY_TYPES &
              !is.na(bicycle_val) & bicycle_val %in% BICYCLE_ROUTABLE))
    ) |>
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
#' get_osm_roads() - costs a second vectortranslate pass over the file,
#' but keeps get_osm_roads()'s existing, tested behavior untouched.
#'
#' OVERLAP WITH THE ROAD NETWORK: since get_osm_roads() now promotes
#' `highway=footway` + `bicycle=designated` ways into the cycling network,
#' some rows here are also rows there. `bicycle` is fetched so
#' 05_build_segment_table.R can drop those by osm_id before running the
#' sidewalk-proximity test - otherwise a shared bike/pedestrian path finds
#' *itself* 0m away and reports `sidewalk_available = TRUE`, which is not
#' a sidewalk, it is the path the rider is already on.
#'
#' @param pbf_path path to the same .osm.pbf used for roads/boundary
#' @param boundary sf/sfc polygon used to clip the extract (WGS84)
#' @return sf MULTILINESTRING, one row per footway
get_footways <- function(pbf_path, boundary) {
  footways <- osmextract::oe_read(
    pbf_path,
    layer = "lines",
    extra_tags = c("highway", "footway", "bicycle", "segregated"),
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
