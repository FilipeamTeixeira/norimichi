# score_potential.R
# Cycling *potential* per hex - a trip-generation index, built from two
# separately-tracked sides, matching how transportation planning usually
# splits trip generation:
#   - production_score: population - where trips start from
#   - attraction_score: schools/stations/shops nearby - where trips go to
# A hex can score high either way: a residential area with few destinations
# nearby, or a shopping street with few residents but lots of daily
# foot/bike traffic pulled in from elsewhere. Kept as two named columns (not
# just internal helpers) so the map can show them as separate layers, not
# only their combined potential_score.
#
# IT IS CALLED POTENTIAL, NOT DEMAND, AND THAT IS NOT A EUPHEMISM
#
# This was `demand_score` until the census data arrived, and the rename is
# the honest description of what the number is. It is an index of
# *characteristics associated with cycling* - people, destinations, flat
# ground - and not a measurement, an estimate or a forecast of trips. Nobody
# has counted the bicycles that would appear here.
#
# The distinction is testable and was tested. Against observed cycling from
# the census, this index shows no relationship once infrastructure quality is
# controlled for (partial r = -0.008 over 452 hexes). Three explanations are
# live and this data cannot separate them - see R/observed_mode_share.R,
# which lists all three rather than settling on the flattering one. "Demand"
# would have claimed the question was closed. "Potential" says what is
# actually being asserted: these are the characteristics; whether they
# convert is the thing the project is arguing about.
#
# WHAT THIS DELIBERATELY DOES NOT USE, AND WHY THAT IS THE POINT
#
# Road stress. `potential_score` used to carry a fourth term, `suppressed` -
# normalize01(avg_lts) at weight 0.15, on the reasoning that a stressful
# area has potential it cannot express. That reasoning is fine as an idea and
# was fatal as arithmetic, because gap_score is
#
#     gap_score = potential_score - infra_quality_score
#
# and infra_quality_score is 1 - (avg_lts - 1)/3. So avg_lts entered the gap
# twice, both times pushing it the same way: once through the demand side as
# "suppressed", once through the supply side as "poor infrastructure". A
# stressful road raised the gap on both counts. The headline number of the
# whole project was, in part, measuring one input against itself.
#
# It was also circular in the plainer sense. The claim the map exists to make
# is "demand is there, the streets are suppressing it". If suppression is
# *assumed* from stress and then compared against stress, the map cannot fail
# to find it, and the finding carries no information.
#
# So potential is now built only from things that are not consequences of the
# road network: how many people live here, how many destinations are within
# reach, and whether the terrain allows it. That is what the interface has
# claimed all along - the tooltip reads "trips this area should generate and
# attract, BEFORE asking whether the roads allow it" - and it is now true.
# gap_score is a comparison of two independently-measured quantities.
#
# What is lost with the term: nothing that was being measured. What is gained:
# a gap score that can be wrong, which is the only kind worth publishing.
#
# The remaining honest limit is that this index is not calibrated against
# observed cycling, and deliberately is not. The census mesh (07b) makes
# calibration technically possible - ~450 usable hexes, enough to fit three
# weights - which is exactly why R/observed_mode_share.R states the reason
# not to: fitting potential to observed cycling would redefine it as a
# prediction of the status quo, a model tuned to reproduce the pattern the
# current hostile network produces. The project's whole argument is that the
# pattern is not the ceiling.

library(dplyr)

#' Min-max normalize a numeric vector to [0, 1]. Returns all zeros if the
#' input has no variation, rather than dividing by zero.
normalize01 <- function(x) {
  rng <- range(x, na.rm = TRUE)
  if (diff(rng) == 0) return(rep(0, length(x)))
  (x - rng[1]) / diff(rng)
}


#' Compute the cycling-potential index per hex.
#'
#' @param hexes data frame/sf with columns: population, schools_nearby,
#'   stations_nearby, shops_nearby, flat_terrain (logical). Deliberately
#'   NOT avg_lts - see the header.
#' @param weights named list, must sum to 1. Exposed as an argument
#'   (rather than hardcoded) so you can recalibrate without touching the
#'   function body once you see the first output. Schools/stations are
#'   weighted higher than shops within attraction, since a station or
#'   school trip is more likely to be a dedicated, plannable bike trip
#'   than an incidental one past a convenience store - tune this ratio
#'   once you see how it renders.
#'
#'   The three weights are the old four with `suppressed` (0.15) removed and
#'   its share returned to the others, keeping their 7:7:3 ratio at the
#'   rounder 2:2:1. Terrain gains about two points in the process, which is
#'   inside the precision any of these numbers has.
#' @return the same object with `production_score`, `attraction_score`,
#'   and `potential_score` columns added (all 0-1)
score_potential <- function(hexes,
                          weights = list(production = 0.40, attraction = 0.40,
                                         terrain = 0.20)) {

  stopifnot(abs(sum(unlist(weights)) - 1) < 1e-6)
  if (!is.null(weights$suppressed)) {
    stop("`suppressed` is gone: it made avg_lts enter gap_score twice, once ",
         "through potential and once through infrastructure quality. See the ",
         "header of R/score_potential.R before putting it back.")
  }

  hexes |>
    mutate(
      production_score = normalize01(population),
      attraction_score  = normalize01(
        schools_nearby * 3 + stations_nearby * 3 + shops_nearby * 1
      ),
      .terrain_n    = as.numeric(flat_terrain),
      potential_score  = weights$production * production_score +
                       weights$attraction  * attraction_score +
                       weights$terrain     * .terrain_n
    ) |>
    select(-starts_with("."))
}
