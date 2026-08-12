# score_lts.R
# Estimate Level of Traffic Stress (LTS) for each OSM way, on a 1-4 scale
# (1 = comfortable for almost anyone, 4 = only confident/experienced
# cyclists). Follows the general logic of the standard LTS framework,
# simplified to what's derivable from OSM tags alone.
#
# IMPORTANT: the thresholds below are a starting point, not ground truth.
# Before trusting the map, sanity-check the output against a handful of
# streets you know personally in your pilot area, and adjust the
# thresholds inside score_lts() until they match your judgment.

library(dplyr)

# Shared with fetch_osm.R - the tag vocabulary has to agree at both ends of
# the pipeline, or ways get downloaded and then never recognised.
source("R/osm_cycling_tags.R")

#' Does this way have any form of dedicated cycling infrastructure?
#'
#' Three independent ways OSM says yes, all of which have to be checked:
#'
#'  1. `highway=cycleway` - the way *is* a cycleway. This was the missing
#'     case: the function used to read only the cycleway:* tags, which a
#'     dedicated cycleway has no reason to carry (you don't tag a cycleway
#'     as having a cycleway alongside it). Every `highway=cycleway` in the
#'     study area therefore came out as having no cycle infrastructure,
#'     which then propagated into score_suitability()'s "no safe option"
#'     penalty, score_lts()'s informal-parking proxy, the `existing_cycling`
#'     export field, and the frontend's "Cycle infrastructure: None" row -
#'     printed on top of an actual cycleway.
#'  2. A shared bike/pedestrian path (`highway=footway|pedestrian|track`
#'     with `bicycle=designated`) - the dominant Japanese convention, see
#'     SHARED_PATH_HIGHWAY_TYPES in osm_cycling_tags.R.
#'  3. A lane or track marked along a motor-traffic road, via the
#'     `cycleway`/`cycleway:left`/`cycleway:right`/`cycleway:both` tags.
#'     Contributors use different combinations depending on the road, so
#'     all four are checked.
#'
#' `highway` and `bicycle` are trailing arguments with defaults so that
#' the pre-existing four-positional-argument calls still work against an
#' older segment table, but every caller in this pipeline passes them.
#'
#' @param cycleway,cycleway_left,cycleway_right,cycleway_both raw OSM tags
#' @param highway raw OSM `highway` tag
#' @param bicycle raw OSM `bicycle` tag
#' @return logical vector
has_cycle_infra <- function(cycleway, cycleway_left, cycleway_right, cycleway_both,
                            highway = NULL, bicycle = NULL) {
  vals <- tolower(paste(cycleway, cycleway_left, cycleway_right, cycleway_both))
  from_tags <- grepl(CYCLEWAY_TAG_PATTERN, vals)

  hw  <- normalise_tag(highway)
  bic <- normalise_tag(bicycle)

  is_cycleway <- if (is.null(hw)) FALSE else
    !is.na(hw) & hw %in% CYCLEWAY_HIGHWAY_TYPES
  is_shared_path <- if (is.null(hw) || is.null(bic)) FALSE else
    !is.na(hw) & hw %in% SHARED_PATH_HIGHWAY_TYPES &
      !is.na(bic) & bic %in% BICYCLE_DESIGNATED

  from_tags | is_cycleway | is_shared_path
}

#' Classify what *kind* of cycling infrastructure a way is, for the
#' frontend's "what already exists" overlay.
#'
#' Three categories, chosen because they are the three things a planner
#' has to tell apart when looking at an existing network - not because
#' they mirror OSM's tagging, which is far more granular than any decision
#' depends on:
#'
#'   "dedicated"   - riders have their own space, no pedestrians in it:
#'                   `highway=cycleway`, or a path explicitly marked
#'                   `segregated=yes`.
#'   "shared_path" - off-road, but shared with pedestrians. Comfortable
#'                   and legal, but slow, and the source of the
#'                   bike/pedestrian conflict that makes Japanese
#'                   sidewalk cycling contentious.
#'   "on_road"     - a lane or track painted along a motor-traffic road.
#'                   Continuous provision on paper; its real quality
#'                   depends on the road it sits on, which is what `lts`
#'                   already measures.
#'
#' @param highway,bicycle,segregated,cycleway,cycleway_left,cycleway_right,cycleway_both
#'   raw OSM tags
#' @return character vector, NA where the way is not cycling infrastructure
classify_cycleway_type <- function(highway, bicycle, segregated,
                                    cycleway, cycleway_left,
                                    cycleway_right, cycleway_both) {
  hw   <- normalise_tag(highway)
  bic  <- normalise_tag(bicycle)
  seg  <- normalise_tag(segregated)
  tags <- tolower(paste(cycleway, cycleway_left, cycleway_right, cycleway_both))

  is_shared_path <- !is.na(hw) & hw %in% SHARED_PATH_HIGHWAY_TYPES &
    !is.na(bic) & bic %in% BICYCLE_DESIGNATED

  dplyr::case_when(
    !is.na(hw) & hw %in% CYCLEWAY_HIGHWAY_TYPES ~ "dedicated",
    is_shared_path & !is.na(seg) & seg == "yes" ~ "dedicated",
    is_shared_path                              ~ "shared_path",
    grepl(CYCLEWAY_TAG_PATTERN, tags)           ~ "on_road",
    TRUE                                        ~ NA_character_
  )
}

#' Parse an OSM maxspeed tag ("30", "30 mph", NA, "japan:urban") to km/h.
#' Falls back to a default when missing/unparseable: Japanese residential
#' streets without a posted sign are commonly 30km/h even when OSM
#' contributors haven't tagged it explicitly.
parse_maxspeed_kmh <- function(maxspeed, default_kmh = 30) {
  x <- tolower(trimws(as.character(maxspeed)))
  is_mph <- grepl("mph", x)
  numeric_part <- suppressWarnings(as.numeric(gsub("[^0-9.]", "", x)))
  kmh <- ifelse(is_mph, numeric_part * 1.60934, numeric_part)
  ifelse(is.na(kmh), default_kmh, kmh)
}

#' Parse a lanes tag to an integer, defaulting to 2 (one each direction)
#' when missing.
parse_lanes <- function(lanes, default_lanes = 2) {
  n <- suppressWarnings(as.integer(lanes))
  ifelse(is.na(n), default_lanes, n)
}

#' Does OSM's `sidewalk` tag indicate a sidewalk exists on at least one
#' side? Contributors use several conventions here ("both", "left",
#' "right", "yes", "separate") - treat anything other than an explicit
#' "no"/"none"/missing as present, since a false positive is safer than
#' missing a real sidewalk for this purpose (sidewalk cycling is common
#' in Japan regardless of on-road stress level - see score_lts()'s notes).
#'
#' This only catches sidewalks recorded as a tag on the road itself. A
#' common Japanese mapping convention instead draws the sidewalk as its
#' own separate `highway=footway` line with no tag on the road at all -
#' that case is caught separately via `footway_nearby` in score_lts(),
#' not by this function.
has_sidewalk <- function(sidewalk) {
  val <- tolower(trimws(as.character(sidewalk)))
  !is.na(val) & !(val %in% c("no", "none", ""))
}

# Threshold for the informal-parking proxy below - number of nearby
# commercial POIs (within score_lts's caller's buffer distance, see
# 05_build_segment_table.R) above which a wide, uncontrolled road is
# assumed to see informal parking. Starting guess, not measured - tune
# against streets you know.
INFORMAL_PARKING_POI_THRESHOLD <- 3

#' Compute LTS (1-4) for a data frame/sf object of OSM ways.
#'
#' NOTE on column names: OSM tags like `cycleway:left` use colons, but
#' GDAL's OSM driver launders extra_tags field names by replacing ":"
#' with "_" when building the layer schema - confirmed against a real
#' extracted file's actual column names (cycleway_left, parking_lane_left,
#' etc.), which is a different, earlier sanitization step than the
#' generic GeoPackage writer's own column-name handling.
#'
#' NOTE on sidewalk_available: this is deliberately NOT folded into the
#' `lts` score itself. In contexts LTS was designed for, sidewalk cycling
#' is rare; in Japan it's common regardless of on-road stress. Discounting
#' `lts` wherever a sidewalk exists would quietly declare stressful roads
#' "fixed" by pedestrian-space cycling, which both overstates the on-road
#' fix and understates the pedestrian-conflict cost of that workaround.
#' Keeping it separate lets downstream code distinguish "stressful road,
#' but a sidewalk workaround exists" from "stressful road, nowhere safe at
#' all" - the second case is the strongest argument for intervention.
#'
#' @param roads data frame with columns: highway, maxspeed, lanes, cycleway,
#'   `cycleway_left`, `cycleway_right`, `cycleway_both`, `bicycle`,
#'   `segregated`, `parking_lane_left`, `parking_lane_right`,
#'   `parking_lane_both`, `sidewalk`, `nearby_poi_count` (joined upstream in
#'   05_build_segment_table.R - see the informal-parking proxy notes),
#'   and `footway_nearby` (also joined upstream - see the sidewalk_available
#'   notes above)
#' @return the same object with `lts` (integer, 1-4), `speed_kmh` (numeric,
#'   parsed from the raw `maxspeed` tag), `sidewalk_available` (logical),
#'   `has_cycle_infra` (logical), `lanes_n` (integer), `cycleway_type`
#'   (character, NA where the way is not cycling infrastructure - see
#'   classify_cycleway_type()) and `likely_informal_parking` (logical)
#'   columns added. `speed_kmh` is
#'   kept as a real output (not just an internal scoring helper) because a
#'   future per-route travel-time calculator on the frontend needs the
#'   actual parsed speed limit, not just the derived `lts` score - same
#'   reasoning as fetching traffic signals in fetch_osm.R.
score_lts <- function(roads) {

  roads |>
    mutate(
      speed_kmh  = parse_maxspeed_kmh(maxspeed),
      .lanes_n   = parse_lanes(lanes),
      .has_cycle_infra = has_cycle_infra(
        cycleway, cycleway_left, cycleway_right, cycleway_both,
        highway, bicycle
      ),
      cycleway_type = classify_cycleway_type(
        highway, bicycle, segregated,
        cycleway, cycleway_left, cycleway_right, cycleway_both
      ),
      .has_marked_parking = grepl(
        "parallel|diagonal|perpendicular",
        tolower(paste(parking_lane_left, parking_lane_right, parking_lane_both))
      ),
      # Ways with no motor traffic on them at all. The LTS framework's
      # question ("how stressful is sharing this road with cars") is
      # vacuous here, so these get their own case in every test below
      # rather than falling through the speed/lane rules - a
      # `highway=footway` with `bicycle=yes` has no lanes and no posted
      # speed, so it lands on the default 30km/h + 2-lane fallbacks and
      # scores LTS 3, as if it were a street.
      .is_car_free = highway %in% c("cycleway", "path", "footway",
                                     "pedestrian", "track"),
      # Proxy for informal parking: no protected cycle infra, with enough
      # nearby shops/restaurants/services that people commonly stop
      # briefly without a marked space. Deliberately not restricted to
      # wide roads - narrow shopping streets with shop-front stopping are
      # at least as common in Japan as wide arterials, and arguably worse
      # for a cyclist since there's less room to pass a stopped car. This
      # is a calibrated proxy, not ground truth - there's no open dataset
      # for actual informal parking behavior. Car-free ways are excluded
      # outright: nothing parks on a path a car cannot enter.
      has_cycle_infra = .has_cycle_infra,
      lanes_n = .lanes_n,
      likely_informal_parking = !.has_cycle_infra & !.is_car_free &
        dplyr::coalesce(nearby_poi_count, 0) >= INFORMAL_PARKING_POI_THRESHOLD,
      .parking_risk = .has_marked_parking | likely_informal_parking,
      # A car-free path is itself the safe space, so the sidewalk question
      # doesn't arise; without this, a shared bike/pedestrian path reports
      # "no sidewalk" and picks up score_suitability()'s no-safe-option
      # penalty for lacking a fallback it has no need of.
      sidewalk_available = .is_car_free | has_sidewalk(sidewalk) |
        dplyr::coalesce(footway_nearby, FALSE),
      lts = case_when(
        .is_car_free                                       ~ 1L,
        .has_cycle_infra & speed_kmh <= 40                 ~ 1L,
        .has_cycle_infra                                   ~ 2L,
        # Parking risk matters here too, not just below - a narrow
        # residential street with informal parking in front of shops is
        # meaningfully more stressful than one without, even though both
        # have the same lane count and speed limit.
        highway %in% c("residential", "living_street",
                        "service", "unclassified") &
          speed_kmh <= 30 & .lanes_n <= 2 & !.parking_risk   ~ 2L,
        highway %in% c("residential", "living_street",
                        "service", "unclassified") &
          speed_kmh <= 30 & .lanes_n <= 2 & .parking_risk    ~ 3L,
        speed_kmh <= 40 & .lanes_n <= 2 & !.parking_risk     ~ 3L,
        TRUE                                                 ~ 4L
      )
    ) |>
    select(-starts_with("."))
}
