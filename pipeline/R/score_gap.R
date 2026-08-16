# score_gap.R
# The "missed opportunity" score: demand that isn't matched by safe
# infrastructure. This is the layer the whole map is framed around, so
# keep it as its own explicit field rather than folding it into demand.
#
# The subtraction below is only meaningful because its two sides are measured
# independently, and for a long time they were not: score_demand() carried a
# `suppressed` term derived from avg_lts, which is the same input
# `infra_quality_score` is built from. Stress therefore entered this score
# twice, both times pushing it the same way, and the map's central claim could
# not fail to be confirmed. That term is gone - see score_demand.R's header.
# Do not reintroduce anything on the demand side that is a function of the
# road network, or this line stops being a comparison.

library(dplyr)

#' Compute infrastructure gap per hex.
#'
#' @param hexes data frame/sf with columns: demand_score (0-1, from
#'   score_demand()) and avg_lts (mean LTS of roads touching the hex, 1-4)
#' @return the same object with two added columns:
#'   `infra_quality_score` (0-1, higher = safer existing infrastructure)
#'   `gap_score` (demand minus infra quality; positive = under-served
#'   relative to demand - the hexes worth surfacing first)
score_gap <- function(hexes) {
  hexes |>
    mutate(
      infra_quality_score = 1 - ((avg_lts - 1) / 3),   # LTS 1 -> 1.0, LTS 4 -> 0.0
      gap_score = demand_score - infra_quality_score
    )
}
