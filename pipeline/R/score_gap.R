# score_gap.R
# The opportunity index: cycling potential that the current street network
# does not serve. This is the layer the whole map is framed around, so it is
# its own explicit field rather than something folded into potential.
#
# WHAT THE NUMBER CLAIMS, EXACTLY
#
# A high gap_score says one thing and no more than one thing:
#
#     this place has characteristics associated with substantial cycling
#     potential, and its current cycling environment is poor
#
# It does **not** claim to have measured how many people would cycle here if
# the streets were fixed. Nobody has measured that, here or anywhere in this
# project. It is a counterfactual index built from two sides that are
# measured separately - the characteristics on one, the state of the streets
# on the other - and its whole content is that the two disagree.
#
# The two sides are not equally well-founded, and the difference is worth
# carrying in your head when reading the number:
#
#   infra_quality_score  has been checked against observed cycling and holds.
#                        Across infrastructure-quality quartiles observed
#                        cycling rises monotonically, and the effect survives
#                        controlling for rail share - the dominant confounder
#                        - at a near-identical increment inside every rail
#                        tercile. See R/observed_mode_share.R.
#
#   potential_score      has been checked and shows nothing once
#                        infrastructure is controlled for. That may be
#                        because potential is not observable from current
#                        behaviour, because the only trip type in the data is
#                        the most rail-dominated one there is, or because the
#                        index weights the wrong things. This data cannot
#                        separate those three.
#
# So the gap is a defensible *index* and not a *prediction*, and the half of
# it that carries empirical support is the supply half.
#
# WHY THE SUBTRACTION IS LEGITIMATE AT ALL
#
# Only because its two sides are independent, and for a long time they were
# not: score_potential() carried a `suppressed` term derived from avg_lts,
# which is the same input `infra_quality_score` is built from. Stress entered
# this score twice, both times pushing it the same way, and the map's central
# claim could not fail to be confirmed. That term is gone - see
# score_potential.R's header. Do not reintroduce anything on the potential
# side that is a function of the road network, or this line stops being a
# comparison and goes back to being a tautology.

library(dplyr)

#' Compute the opportunity index per hex.
#'
#' @param hexes data frame/sf with columns: potential_score (0-1, from
#'   score_potential()) and avg_lts (mean LTS of roads touching the hex, 1-4)
#' @return the same object with two added columns:
#'   `infra_quality_score` (0-1, higher = safer existing infrastructure)
#'   `gap_score` (potential minus infra quality; positive = the street network
#'   serves less than the place's characteristics would support - the hexes
#'   worth surfacing first)
score_gap <- function(hexes) {
  hexes |>
    mutate(
      infra_quality_score = 1 - ((avg_lts - 1) / 3),   # LTS 1 -> 1.0, LTS 4 -> 0.0
      gap_score = potential_score - infra_quality_score
    )
}
