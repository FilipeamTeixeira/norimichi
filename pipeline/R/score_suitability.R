# score_suitability.R
# Rescales the 1-4 LTS score into the 0-100 "cycling suitability" score the
# frontend displays (higher = better), adjusted for whether a cyclist has
# any safe option at all.
#
# This is deliberately a *separate* concept from `lts`:
#   - `lts` is the standard 1-4 traffic-stress classification (see score_lts.R)
#   - `suitability_score` is the user-facing 0-100 number in the info panel
#
# NOTE on what is and isn't re-penalised here. `likely_informal_parking`
# already feeds into `lts` itself (via `.parking_risk` in score_lts()'s
# case_when - it pushes residential streets 2->3 and moderate roads 3->4),
# so applying a second penalty for it here would double-count the same
# evidence. `sidewalk_available` is the opposite case: score_lts()
# deliberately excludes it (see its notes on sidewalk cycling in Japan),
# which leaves it as genuinely new information to fold in at this stage.
#
# The penalty is applied only where there is no cycle infrastructure. On a
# segment that already has a cycleway or lane, the absence of a sidewalk
# says nothing about the cyclist's options - they have dedicated space.
# Where there is neither cycle infra nor a sidewalk, there is nowhere safe
# to ride at all, which is the strongest case for intervention.

#' Points deducted where a cyclist has neither cycle infrastructure nor a
#' sidewalk to fall back on. Starting value, not measured - tune against
#' streets you know, same caveat as score_lts()'s thresholds.
NO_SAFE_OPTION_PENALTY <- 10

#' Suitability band cutoffs, shared conceptually with the frontend's
#' legend (app/src/lib/types.ts). Keep the two in sync.
SUITABILITY_HIGH_MIN     <- 67
SUITABILITY_MODERATE_MIN <- 34

#' Convert LTS (1-4, lower is better) to a 0-100 suitability score
#' (higher is better), penalising segments with no safe option.
#'
#' @param lts integer vector, 1-4
#' @param sidewalk_available logical vector
#' @param has_cycle_infra logical vector
#' @return numeric vector, 0-100
score_suitability <- function(lts, sidewalk_available, has_cycle_infra) {
  base <- 100 - ((lts - 1) / 3) * 100
  no_safe_option <- !dplyr::coalesce(has_cycle_infra, FALSE) &
    !dplyr::coalesce(sidewalk_available, FALSE)
  penalty <- ifelse(no_safe_option, NO_SAFE_OPTION_PENALTY, 0)
  pmax(0, pmin(100, round(base - penalty)))
}

#' Criticality percentile at or above which a low-suitability segment counts
#' as a strategic bottleneck rather than merely a poor road.
BOTTLENECK_CRITICALITY_MIN <- 50

#' Decide the map colour category for each segment.
#'
#' This is where the design's "red means unlocks connectivity, not
#' dangerous" framing is actually enforced. A low-suitability segment only
#' becomes a `bottleneck` if the network analysis says upgrading it would
#' join low-stress islands (see score_network.R). Low-suitability segments
#' that connect nothing get their own `low_priority` category instead of
#' being coloured red - that distinction is the whole point of B.3, and
#' collapsing it back into one red bucket would put a stressful cul-de-sac
#' on equal footing with a critical missing link.
#'
#' @param suitability numeric 0-100 from score_suitability()
#' @param criticality_score numeric 0-100 from compute_network_criticality()
#' @param bridges_islands logical, direct single-segment bridge
#' @return character vector: "high", "moderate", "bottleneck", "low_priority"
classify_display_category <- function(suitability, criticality_score, bridges_islands) {
  is_critical <- dplyr::coalesce(bridges_islands, FALSE) |
    dplyr::coalesce(criticality_score, 0) >= BOTTLENECK_CRITICALITY_MIN

  dplyr::case_when(
    suitability >= SUITABILITY_HIGH_MIN     ~ "high",
    suitability >= SUITABILITY_MODERATE_MIN ~ "moderate",
    is_critical                             ~ "bottleneck",
    TRUE                                    ~ "low_priority"
  )
}
