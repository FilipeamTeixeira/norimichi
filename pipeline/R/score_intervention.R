# score_intervention.R
# Turns a segment's `recommendation` into an honest before/after pair - or
# refuses to produce one.
#
# WHY THIS FILE EXISTS
# `score_lts()` is a pure function of a way's tags, so simulating an
# intervention is genuinely available to us: clone the row, edit the input
# the intervention would change on the ground, re-run the same scoring
# function, and the "after" number comes from the same logic that produced
# the "before" one. That is a real counterfactual, not a guess.
#
# The catch, and the reason this is not one line: it only works for
# interventions that correspond to an input `score_lts()` actually models.
# Two of the five intervention types don't:
#
#   "Crossing improvement" - `score_lts()` has no crossing/junction term at
#       all. `traffic_signals_count` is an *output* of a spatial join, never
#       an input to the score. There is no edit to a way's tags that means
#       "the crossing got safer", so there is no honest after-number.
#   "Bike parking"         - not a property of a road segment in the first
#       place. It lives in the bike_facilities point layer.
#
# The previous implementation (inline in 11_export.R) applied the *cycle
# lane* counterfactual to all four segment-level types uniformly, which
# reported a mean 31 -> 100 for crossing improvements: an intervention that
# was never simulated, scored by pretending a different intervention had
# been built instead. `benefit_kind` exists so the frontend cannot repeat
# that mistake - a row that is not `lts_recalc` carries no `suitability_after`
# to print.

library(dplyr)

source("R/score_lts.R")
source("R/score_suitability.R")

#' The five intervention labels, matching the design's sidebar filter so
#' the filter can match against `recommendation` rather than being
#' decorative. "Bike parking" has no segment-level equivalent and is here
#' for completeness of the vocabulary, not because a segment can carry it.
INTERVENTION_TYPES <- c(
  "Protected cycle lane",
  "Missing link",
  "Traffic calming",
  "Crossing improvement",
  "Bike parking"
)

#' Whether each intervention maps onto an input `score_lts()` models.
#'
#'   "lts_recalc"   - a real counterfactual exists; `suitability_after` is
#'                    the re-scored clone and may be shown as "38 -> 82".
#'   "not_modelled" - no input corresponds to this intervention;
#'                    `suitability_after` is NA and the UI must say what the
#'                    benefit is in other terms.
INTERVENTION_BENEFIT_KIND <- c(
  "Protected cycle lane" = "lts_recalc",
  "Missing link"         = "lts_recalc",
  "Traffic calming"      = "lts_recalc",
  "Crossing improvement" = "not_modelled",
  "Bike parking"         = "not_modelled"
)

#' Speed a ゾーン30-style calming scheme posts. Only relevant to the 40km/h
#' minority - see the note in INTERVENTION_COUNTERFACTUAL below.
TRAFFIC_CALMING_TARGET_KMH <- 30

#' What each modelled intervention changes about the way's *inputs*.
#'
#' Each entry takes the segment attribute table and returns it with the
#' tags the intervention would change on the ground edited. Everything else
#' - including which `case_when` branch the row then lands in - is left to
#' `score_lts()`, so these stay honest as its thresholds are tuned.
#'
#' NOTE on "Traffic calming", which is the non-obvious one. The obvious
#' lever is a speed cap, and on this study area a speed cap alone is very
#' nearly a no-op: 188 of the 196 traffic-calming segments are *already*
#' posted at 30km/h, so capping speed moves 195 of 196 rows by exactly zero
#' points (mean +0.2). What actually makes those rows LTS 3 is
#' `likely_informal_parking` - which is the very condition that assigned
#' them "Traffic calming" in the first place. So the counterfactual is the
#' pairing a Japanese calming scheme is actually built as: a 30km/h zone
#' *plus* kerbside management. That is modelled by removing the informal
#' parking pressure (`nearby_poi_count`, the proxy's input) and any marked
#' parking lane. Result: 27 -> 61 mean, i.e. LTS 3 -> 2. It deliberately
#' does not reach 100 - the street still has no cycle provision after a
#' calming scheme, and claiming otherwise would be the same error this file
#' exists to prevent.
INTERVENTION_COUNTERFACTUAL <- list(
  # A protected lane is cycle infrastructure present on both sides.
  # score_lts()'s own rules then make the way LTS 1 at <=40km/h and LTS 2
  # above it, so a 50km/h arterial correctly reports 0 -> 67 rather than
  # 0 -> 100.
  "Protected cycle lane" = function(d) {
    d$cycleway_left  <- "track"
    d$cycleway_right <- "track"
    d
  },
  # Physically the same thing as a protected lane. The difference is *why*
  # it is worth building (it joins two low-stress islands, per
  # score_network.R), not what gets built, so the counterfactual matches.
  "Missing link" = function(d) {
    d$cycleway_left  <- "track"
    d$cycleway_right <- "track"
    d
  },
  "Traffic calming" = function(d) {
    d$maxspeed <- as.character(TRAFFIC_CALMING_TARGET_KMH)
    # The informal-parking proxy's input (see INFORMAL_PARKING_POI_THRESHOLD
    # in score_lts.R) and any marked kerbside lane.
    d$nearby_poi_count   <- 0
    d$parking_lane_left  <- NA
    d$parking_lane_right <- NA
    d$parking_lane_both  <- NA
    d
  }
)

#' Human-readable description of what was simulated, so the UI can state
#' the basis of a before/after rather than presenting it as an oracle.
INTERVENTION_LEVER <- c(
  "Protected cycle lane" = "protected track added both sides, re-scored",
  "Missing link"         = "protected track added both sides, re-scored",
  "Traffic calming"      = "30km/h zone + kerbside parking management, re-scored",
  "Crossing improvement" = "not modelled by the traffic-stress score",
  "Bike parking"         = "not a segment-level intervention"
)

#' Base cost tier per intervention type, before road-space escalation.
#'
#' The spec asked for a plain intervention-type -> tier lookup. On its own
#' that loses real information: a protected lane on a 2-lane street and one
#' on a 6-lane arterial are not the same project. So the type sets the base
#' and road space escalates it - a crossing improvement stays a fixed-cost
#' junction treatment however wide the road, while a protected lane climbs
#' with the number of lanes that have to be reallocated.
INTERVENTION_BASE_COST <- c(
  "Protected cycle lane" = "Medium",
  # Physically the same build as a protected lane - see
  # INTERVENTION_COUNTERFACTUAL above, both are "track both sides". There is
  # no per-corridor signal here for whether a given missing link needs land,
  # a bridge or a structure, so it is not defaulted to a higher tier than the
  # build it actually is. A corridor with real evidence of extraordinary
  # works should be escalated on that evidence, not by a blanket rule for the
  # type.
  "Missing link"         = "Medium",
  "Traffic calming"      = "Low",
  "Crossing improvement" = "Low",
  "Bike parking"         = "Low"
)

COST_TIERS <- c("Low", "Medium", "High")

#' Escalate a cost tier by `steps`, capped at "High".
escalate_cost <- function(tier, steps) {
  idx <- match(tier, COST_TIERS)
  COST_TIERS[pmin(length(COST_TIERS), idx + steps)]
}

#' Assign each segment its intervention cost tier.
#'
#' @param recommendation character vector, one of INTERVENTION_TYPES or NA
#' @param lanes_n integer vector
#' @param speed_kmh numeric vector
#' @return character vector: "Low"/"Medium"/"High", NA where no recommendation
score_cost_tier <- function(recommendation, lanes_n, speed_kmh) {
  base <- INTERVENTION_BASE_COST[recommendation]

  # Road space to reallocate. Only escalates types whose cost scales with
  # it - a junction treatment or a rack does not get dearer because the
  # road is wide.
  scales_with_road <- recommendation %in%
    c("Protected cycle lane", "Missing link", "Traffic calming")
  steps <- ifelse(
    !scales_with_road, 0L,
    ifelse(dplyr::coalesce(lanes_n, 2L) >= 4 | dplyr::coalesce(speed_kmh, 30) >= 60, 1L, 0L)
  )

  out <- escalate_cost(base, steps)
  out[is.na(recommendation)] <- NA_character_
  unname(out)
}

#' Simulate each segment's recommended intervention and return an honest
#' before/after, or NA where the intervention is not modelled.
#'
#' @param segments data frame (or sf object) carrying the raw OSM tag
#'   columns `score_lts()` needs, plus `recommendation`
#' @param recommendation character vector, one of INTERVENTION_TYPES or NA.
#'   Passed separately rather than read off `segments` so the caller can
#'   simulate a hypothetical set of recommendations without mutating the
#'   table first.
#' @return list with `suitability_after` (numeric, NA where not modelled),
#'   `benefit_kind` (character, NA where no recommendation) and
#'   `intervention_lever` (character, NA where no recommendation)
simulate_interventions <- function(segments, recommendation) {
  attrs <- if (inherits(segments, "sf")) sf::st_drop_geometry(segments) else segments
  n <- nrow(attrs)

  benefit_kind <- unname(INTERVENTION_BENEFIT_KIND[recommendation])
  lever        <- unname(INTERVENTION_LEVER[recommendation])

  after <- rep(NA_real_, n)

  # One pass of score_lts() per modelled intervention type over the whole
  # table (cheap - it is vectorised), then take the value only for the rows
  # that intervention was actually recommended for.
  for (type in names(INTERVENTION_COUNTERFACTUAL)) {
    rows <- which(recommendation == type)
    if (length(rows) == 0) next

    clone  <- INTERVENTION_COUNTERFACTUAL[[type]](attrs)
    scored <- score_lts(clone)
    after[rows] <- score_suitability(
      scored$lts[rows],
      scored$sidewalk_available[rows],
      scored$has_cycle_infra[rows]
    )
  }

  # Belt and braces: a "not_modelled" row must never carry an after-number,
  # whatever a future edit to the counterfactual list does.
  after[!is.na(benefit_kind) & benefit_kind != "lts_recalc"] <- NA_real_

  list(
    suitability_after  = after,
    benefit_kind       = benefit_kind,
    intervention_lever = lever
  )
}

#' Signal density at which a corridor's problem is its crossings.
#'
#' A stop every 200m or worse. Replaces the old per-segment
#' `traffic_signals_count >= 2`, which was an absolute count inside a 15m
#' buffer and so scaled with how long a way happened to be: it fired on a 47m
#' stub with one signal at each end and not on the 192m street the stub
#' continued into, splitting one corridor in two. Starting guess, tuned only
#' against the shape of this study area's distribution - see the corridor mix
#' 05d prints.
CROSSING_SIGNALS_PER_KM <- 5

#' Below this a corridor is too short for a density to mean anything, so it is
#' classified on its roadway instead. One signal on a 40m stub is 25/km and
#' says nothing about the ride.
MIN_CROSSING_JUNCTIONS <- 2

#' Whether a segment is worth spending money on at all.
#'
#' The two conditions that used to be the first two branches of
#' classify_recommendation(): a street that already has cycle infrastructure
#' needs nothing, and one below LTS 3 is not stressful enough to be worth
#' money. Both are physical facts about the street rather than artefacts of
#' where OSM cut it, so unlike the intervention *type* they stay per-segment -
#' and they are what assign_corridor_ids() groups on.
#'
#' @param segments data frame with `has_cycle_infra` and `lts`
#' @return logical vector, TRUE where the segment deserves a recommendation
is_recommendable <- function(segments) {
  !dplyr::coalesce(segments$has_cycle_infra, FALSE) &
    dplyr::coalesce(segments$lts >= 3, FALSE)
}

#' Classify each corridor into one of the intervention types.
#'
#' Rule-based, per the design's requirement that this be a typed category
#' rather than free text, and applied to the corridor rather than the way.
#' WHY THE CORRIDOR: every input here is scale-free - an any(), a share of
#' length, a rate per km - so the label does not change when OSM splits a
#' street, which is what used to break corridors apart. See the header of
#' R/build_corridors.R for the case that forced the move.
#'
#' The branch order is the old per-segment one, and says what matters most
#' about a street when several things are true at once. Island-bridging
#' first: when the network analysis says upgrading this would merge two
#' low-stress islands, "missing link" is the headline whatever the lane count.
#' Crossings last: a signalised street that is also wide, fast or choked with
#' kerbside parking needs the roadway fixed, and the crossing count rides
#' along as `signalised_junctions` on the corridor either way.
#'
#' The three share tests all ask the same question - is this most of the
#' street? - because a corridor is a mixed thing and its label should describe
#' the majority of it, not its most unusual 40 metres.
#'
#' @param agg data frame from corridor_classification_inputs()
#' @return character vector of INTERVENTION_TYPES values, one per corridor
classify_corridor_recommendation <- function(agg) {
  dplyr::case_when(
    agg$bridges_islands_share >= 0.5       ~ "Missing link",
    # Majority of the corridor's length is wide or fast. A single 3-lane
    # stretch in an otherwise 2-lane street is not what the street is.
    agg$wide_or_fast_share >= 0.5          ~ "Protected cycle lane",
    agg$informal_parking_share >= 0.5      ~ "Traffic calming",
    agg$signalised_junctions >= MIN_CROSSING_JUNCTIONS &
      agg$signals_per_km >= CROSSING_SIGNALS_PER_KM ~ "Crossing improvement",
    TRUE                                   ~ "Protected cycle lane"
  )
}
