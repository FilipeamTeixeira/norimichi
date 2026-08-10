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

#' Does this way have any form of dedicated cycling infrastructure?
#' Checks the main cycleway tag plus the left/right/both variants, since
#' OSM contributors use different combinations depending on the road.
has_cycle_infra <- function(cycleway, cycleway_left, cycleway_right, cycleway_both) {
  vals <- tolower(paste(cycleway, cycleway_left, cycleway_right, cycleway_both))
  grepl("track|lane|opposite_lane|share_busway", vals)
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
#'   `cycleway_left`, `cycleway_right`, `cycleway_both`,
#'   `parking_lane_left`, `parking_lane_right`, `parking_lane_both`,
#'   `sidewalk`, and `nearby_poi_count` (joined upstream in
#'   05_build_segment_table.R - see the informal-parking proxy notes)
#' @return the same object with `lts` (integer, 1-4), `sidewalk_available`
#'   (logical), and `likely_informal_parking` (logical) columns added
score_lts <- function(roads) {

  roads |>
    mutate(
      .speed_kmh = parse_maxspeed_kmh(maxspeed),
      .lanes_n   = parse_lanes(lanes),
      .has_cycle_infra = has_cycle_infra(
        cycleway, cycleway_left, cycleway_right, cycleway_both
      ),
      .has_marked_parking = grepl(
        "parallel|diagonal|perpendicular",
        tolower(paste(parking_lane_left, parking_lane_right, parking_lane_both))
      ),
      # Proxy for informal parking: no protected cycle infra, with enough
      # nearby shops/restaurants/services that people commonly stop
      # briefly without a marked space. Deliberately not restricted to
      # wide roads - narrow shopping streets with shop-front stopping are
      # at least as common in Japan as wide arterials, and arguably worse
      # for a cyclist since there's less room to pass a stopped car. This
      # is a calibrated proxy, not ground truth - there's no open dataset
      # for actual informal parking behavior.
      likely_informal_parking = !.has_cycle_infra &
        dplyr::coalesce(nearby_poi_count, 0) >= INFORMAL_PARKING_POI_THRESHOLD,
      .parking_risk = .has_marked_parking | likely_informal_parking,
      sidewalk_available = has_sidewalk(sidewalk),
      lts = case_when(
        highway %in% c("cycleway", "path")               ~ 1L,
        .has_cycle_infra & .speed_kmh <= 40                ~ 1L,
        .has_cycle_infra                                   ~ 2L,
        # Parking risk matters here too, not just below - a narrow
        # residential street with informal parking in front of shops is
        # meaningfully more stressful than one without, even though both
        # have the same lane count and speed limit.
        highway %in% c("residential", "living_street",
                        "service", "unclassified") &
          .speed_kmh <= 30 & .lanes_n <= 2 & !.parking_risk  ~ 2L,
        highway %in% c("residential", "living_street",
                        "service", "unclassified") &
          .speed_kmh <= 30 & .lanes_n <= 2 & .parking_risk   ~ 3L,
        .speed_kmh <= 40 & .lanes_n <= 2 & !.parking_risk    ~ 3L,
        TRUE                                                 ~ 4L
      )
    ) |>
    select(-starts_with("."))
}
