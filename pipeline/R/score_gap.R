# score_gap.R
# The "missed opportunity" score: demand that isn't matched by safe
# infrastructure. This is the layer the whole map is framed around, so
# keep it as its own explicit field rather than folding it into demand.

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
