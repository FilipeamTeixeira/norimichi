# osm_cycling_tags.R
# The vocabulary for "is this OSM way part of the cycling network, and if
# so what kind". Its own file because both ends of the pipeline need it and
# neither sources the other: fetch_osm.R uses it to decide what to pull out
# of the .pbf, score_lts.R uses it to decide what the result means. Two
# copies of these lists drift, and when they drift the symptom is a way
# that gets downloaded but never recognised - which is exactly the bug this
# file was extracted to fix.
#
# Sourced from R/fetch_osm.R and R/score_lts.R with a path relative to
# pipeline/, matching how every script in this repo addresses the project
# (scripts are run from pipeline/, e.g. `Rscript scripts/01_download_osm.R`).

# Way types that ARE cycle infrastructure by virtue of their highway tag
# alone, with no cycleway=* or bicycle=* tag needed.
CYCLEWAY_HIGHWAY_TYPES <- c("cycleway")

# Way types that are NOT cyclable by default, but become part of the
# cycling network when OSM says bicycles belong there.
#
# This matters far more in Japan than the name suggests. The most common
# way to map Japanese cycling infrastructure is not `highway=cycleway` at
# all - it is the 自転車歩行者道 (shared bike/pedestrian path), drawn as
# `highway=footway` + `bicycle=designated` + `foot=designated`, usually
# with `segregated=no`. In the Naka-ku pilot area those outnumber
# `highway=cycleway` ways roughly 2:1, so a network built only from
# CYCLABLE_HIGHWAY_TYPES was missing most of the cycling network that
# actually exists on the ground - and, because get_footways() picks the
# same ways up as sidewalks, was quietly reclassifying that infrastructure
# as a pedestrian amenity.
SHARED_PATH_HIGHWAY_TYPES <- c("footway", "pedestrian", "track")

# `bicycle=*` values that put a SHARED_PATH_HIGHWAY_TYPES way into the
# routable network - i.e. a rider may legally use it. Broader than
# BICYCLE_DESIGNATED below: a Japanese sidewalk signed 歩道通行可
# ("cycling permitted") is genuinely where people ride.
BICYCLE_ROUTABLE <- c("designated", "official", "yes", "permissive")

# `bicycle=*` values that mean the way is cycling infrastructure in its own
# right, rather than somewhere bicycles are merely tolerated. Deliberately
# stricter than BICYCLE_ROUTABLE: a sidewalk where cycling happens to be
# allowed is a fallback, not provision, and counting it as provision would
# erase the gap this project exists to measure.
BICYCLE_DESIGNATED <- c("designated", "official")

# `cycleway`/`cycleway:left`/`cycleway:right`/`cycleway:both` values that
# indicate real provision alongside a motor-traffic road. Matched as a
# regex against the four tags pasted together, so "no", "none", "separate"
# and "crossing" correctly match nothing.
CYCLEWAY_TAG_PATTERN <- "track|lane|opposite_lane|share_busway|sidepath"

#' Normalise an OSM tag column for comparison: lowercase, trimmed,
#' character. NA stays NA.
#' @param x raw tag vector (may be factor, character, or NULL)
#' @return character vector, or NULL if `x` is NULL
normalise_tag <- function(x) {
  if (is.null(x)) return(NULL)
  tolower(trimws(as.character(x)))
}
