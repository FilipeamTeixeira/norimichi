# score_demand.R
# Latent cycling demand per hex: a 0-1 score combining population density,
# proximity to schools/stations, flat terrain, and (as an imperfect proxy)
# how suppressed cycling looks given current road stress.
#
# NOTE: there is no direct open-data measurement of "current cycling mode
# share" at hex level (see docs/data-sources.md from the wider project
# notes). Until a better source turns up, this uses average LTS as an
# inverse proxy - areas that are stressful to cycle in are assumed to have
# suppressed demand. That's a simplifying assumption worth revisiting once
# you have any real trip data to check it against.

library(dplyr)

#' Min-max normalize a numeric vector to [0, 1]. Returns all zeros if the
#' input has no variation, rather than dividing by zero.
normalize01 <- function(x) {
  rng <- range(x, na.rm = TRUE)
  if (diff(rng) == 0) return(rep(0, length(x)))
  (x - rng[1]) / diff(rng)
}

# score_demand.R
# Latent cycling demand per hex, built from two separately-tracked sides,
# matching how transportation planning usually splits trip generation:
#   - production_score: population - where trips start from
#   - attraction_score: schools/stations/shops nearby - where trips go to
# A hex can score high on demand either way: a residential area with few
# destinations nearby, or a shopping street with few residents but lots
# of daily foot/bike traffic pulled in from elsewhere. Kept as two named
# columns (not just internal helpers) so the map can show them as
# separate layers, not only their combined demand_score.
#
# demand_score also folds in flat terrain and (as an imperfect proxy) how
# suppressed cycling looks given current road stress.
#
# NOTE: there is no direct open-data measurement of "current cycling mode
# share" at hex level (see docs/data-sources.md from the wider project
# notes). Until a better source turns up, this uses average LTS as an
# inverse proxy - areas that are stressful to cycle in are assumed to have
# suppressed demand. That's a simplifying assumption worth revisiting once
# you have any real trip data to check it against.

library(dplyr)

#' Min-max normalize a numeric vector to [0, 1]. Returns all zeros if the
#' input has no variation, rather than dividing by zero.
normalize01 <- function(x) {
  rng <- range(x, na.rm = TRUE)
  if (diff(rng) == 0) return(rep(0, length(x)))
  (x - rng[1]) / diff(rng)
}

#' Compute a latent demand score per hex.
#'
#' @param hexes data frame/sf with columns: population, schools_nearby,
#'   stations_nearby, shops_nearby, avg_lts (mean LTS of roads touching
#'   the hex, 1-4), flat_terrain (logical)
#' @param weights named list, must sum to 1. Exposed as an argument
#'   (rather than hardcoded) so you can recalibrate without touching the
#'   function body once you see the first output. Schools/stations are
#'   weighted higher than shops within attraction, since a station or
#'   school trip is more likely to be a dedicated, plannable bike trip
#'   than an incidental one past a convenience store - tune this ratio
#'   once you see how it renders.
#' @return the same object with `production_score`, `attraction_score`,
#'   and `demand_score` columns added (all 0-1)
score_demand <- function(hexes,
                          weights = list(production = 0.35, attraction = 0.35,
                                         terrain = 0.15, suppressed = 0.15)) {

  stopifnot(abs(sum(unlist(weights)) - 1) < 1e-6)

  hexes |>
    mutate(
      production_score = normalize01(population),
      attraction_score  = normalize01(
        schools_nearby * 3 + stations_nearby * 3 + shops_nearby * 1
      ),
      .terrain_n    = as.numeric(flat_terrain),
      .suppressed_n = normalize01(avg_lts),   # higher LTS -> more suppressed
      demand_score  = weights$production * production_score +
                       weights$attraction  * attraction_score +
                       weights$terrain     * .terrain_n +
                       weights$suppressed  * .suppressed_n
    ) |>
    select(-starts_with("."))
}
