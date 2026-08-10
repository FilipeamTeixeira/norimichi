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

#' Compute LTS (1-4) for a data frame/sf object of OSM ways.
#'
#' NOTE on column names: OSM tags like `cycleway:left` use colons, but
#' GDAL's OSM driver launders extra_tags field names by replacing ":"
#' with "_" when building the layer schema - confirmed against a real
#' extracted file's actual column names (cycleway_left, parking_lane_left,
#' etc.), which is a different, earlier sanitization step than the
#' generic GeoPackage writer's own column-name handling.
#'
#' @param roads data frame with columns: highway, maxspeed, lanes, cycleway,
#'   `cycleway_left`, `cycleway_right`, `cycleway_both`,
#'   `parking_lane_left`, `parking_lane_right`, `parking_lane_both`
#' @return the same object with an added integer column `lts`
score_lts <- function(roads) {

  roads |>
    mutate(
      .speed_kmh = parse_maxspeed_kmh(maxspeed),
      .lanes_n   = parse_lanes(lanes),
      .has_cycle_infra = has_cycle_infra(
        cycleway, cycleway_left, cycleway_right, cycleway_both
      ),
      .has_parking = grepl(
        "parallel|diagonal|perpendicular",
        tolower(paste(parking_lane_left, parking_lane_right, parking_lane_both))
      ),
      lts = case_when(
        highway %in% c("cycleway", "path")               ~ 1L,
        .has_cycle_infra & .speed_kmh <= 40                ~ 1L,
        .has_cycle_infra                                   ~ 2L,
        highway %in% c("residential", "living_street",
                       "service", "unclassified") &
          .speed_kmh <= 30 & .lanes_n <= 2                  ~ 2L,
        .speed_kmh <= 40 & .lanes_n <= 2 & !.has_parking    ~ 3L,
        TRUE                                                ~ 4L
      )
    ) |>
    select(-starts_with("."))
}
