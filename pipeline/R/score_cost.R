# score_cost.R
# The other half of the ledger: what a corridor would cost to build, what it
# would return, and how long it takes to pay for itself.
#
# WHY THIS FILE EXISTS
#
# The project has always been able to say what cycling *saves* - score_roi.R
# has produced congestion, operating-cost, health and parking figures in yen
# since early on. It has never been able to say what anything *costs*. Cost
# stopped at a tier: Low, Medium, High. So the sentence the whole framing was
# built to produce -
#
#   "¥X of benefit a year against a ¥Y build, paying for itself in Z years"
#
# - could not be written anywhere in the tool, because half of it did not
# exist. This file is that half.
#
# ############################################################
# #  READ THIS BEFORE PUTTING A YEN FIGURE IN FRONT OF ANYONE #
# ############################################################
#
# **None of the unit costs below is sourced.** score_roi.R can point at MLIT's
# 費用便益分析マニュアル for its two unit values; there is no equivalent
# published schedule of Japanese cycle-infrastructure construction costs that
# this project has been able to find and verify. The numbers here are
# order-of-magnitude planning placeholders, chosen to be defensible as ranges
# rather than accurate as point estimates.
#
# They are deliberately wide, and they are deliberately ranges rather than
# single values, because a single number invites a precision that is not here.
# Every derived figure carries the range through to the end: a corridor has a
# cost *from-to* and a payback *from-to*, never a single value.
#
# Replacing them is one edit to INTERVENTION_COST_YEN_PER_M and
# CROSSING_COST_YEN_PER_JUNCTION. If you have real tendered costs for
# comparable schemes in this city, they belong here and nothing else needs to
# change. Note that "Traffic calming" is not a cycle-lane cost and needs its
# own source (Zone 30 / Zone 30 Plus schemes) rather than reuse of whatever
# replaces the bike-lane figures - see the note by INTERVENTION_COST_YEN_PER_M
# below. The NILIM 2026 case collection is a legitimate primary source for the
# road-reallocation figures but is a design case-study document, not a
# national unit-cost schedule - do not cite it as one until a specific case's
# reported cost is checked against the intervention it actually describes.
#
# WHAT THE BENEFIT SIDE MEANS, AND WHAT IT DOES NOT
#
# `corridor_benefit_yen_year()` runs score_roi.R's own functions over the
# corridor's `estimated_beneficiaries`, so there is exactly one ROI model in
# this project rather than two that can drift. Three limits travel with it:
#
#   1. It is the same illustrative 20% mode-shift **scenario**, not a forecast.
#   2. It attributes the whole of that shift among those residents to this one
#      corridor. Where several corridors serve the same people it is therefore
#      an **upper bound** on what any one of them can claim.
#   3. For the same reason corridor benefits **must never be summed**. Their
#      500m catchments overlap, exactly as F.3 records for
#      `estimated_beneficiaries` itself. Costs may be summed - the corridors
#      are disjoint stretches of street, so each is a separate build.
#
# That asymmetry is what makes the study-area figure in
# `programme_ledger()` the honest one to quote: the cost side is a sum of
# disjoint projects, and the benefit side comes from the hex grid, where each
# resident is counted exactly once.

source("R/score_roi.R")
source("R/score_intervention.R")   # INTERVENTION_BASE_COST

# --- Unit costs - ILLUSTRATIVE, NOT SOURCED ------------------------------

#' Construction cost in yen per metre **of corridor**, low to high.
#'
#' Per metre of corridor, not per metre of track: `INTERVENTION_LEVER` says a
#' protected cycle lane is modelled as a track on *both sides*, so a metre of
#' street buys two metres of facility, and these figures already account for
#' that. Getting this wrong would halve every protected-lane cost.
#'
#' "Missing link" gets the *same* range as "Protected cycle lane", not a
#' higher one. Per INTERVENTION_COUNTERFACTUAL in score_intervention.R the two
#' are physically the same build - track both sides - and this model has no
#' per-corridor signal for whether a specific missing link actually needs
#' land, a bridge or a structure. Defaulting it to a land-acquisition price
#' would overstate every missing link that is really just closing a gap in an
#' otherwise continuous path. A corridor with real evidence of extraordinary
#' works should be priced up on that evidence when it exists, not by a blanket
#' rule for the type.
#'
#' "Traffic calming" is not a cycle-lane build at all - it is a 30km/h zone
#' plus kerbside parking management (see INTERVENTION_COUNTERFACTUAL), so it
#' should not be sourced from bike-lane cost data. This figure is a
#' placeholder pending a Zone 30 / Zone 30 Plus cost pass and is less certain
#' than the other two.
INTERVENTION_COST_YEN_PER_M <- list(
  "Protected cycle lane" = c(low = 30000, high = 100000),
  "Missing link"         = c(low = 30000, high = 100000),
  "Traffic calming"      = c(low =  6000, high =  20000)
)

#' Crossing improvements are priced per junction, not per metre.
#'
#' A junction treatment costs what it costs whether the corridor leading to it
#' is 40m or 400m long, and `signalised_junctions` is already counted against
#' the whole corridor with OSM's per-approach nodes clustered (see A.3). Using
#' a per-metre rate here would make a long corridor with one crossing look
#' like a major scheme.
CROSSING_COST_YEN_PER_JUNCTION <- c(low = 3e6, high = 15e6)

#' What a wide or fast road multiplies the per-metre cost by.
#'
#' Derived from the cost *tier* rather than from lanes and speed directly, so
#' the tier and the yen figure cannot disagree about what counts as a big
#' road: if `score_cost_tier()` escalated this corridor above its type's base
#' tier, road space is the reason, and the same escalation applies here.
WIDE_ROAD_COST_MULTIPLIER <- 1.6

#' Days per year, for turning score_roi.R's daily figures into annual ones.
DAYS_PER_YEAR <- 365

# --- Cost ----------------------------------------------------------------

#' What a corridor would cost to build, as a low-high range in yen.
#'
#' @param recommendation character vector, one of INTERVENTION_TYPES
#' @param length_m numeric vector, corridor length
#' @param signalised_junctions integer vector, for the crossing type
#' @param cost_tier character vector, the corridor's own tier
#' @return list of two numeric vectors, `low` and `high`; NA where the
#'   intervention has no costed form here
corridor_cost_yen <- function(recommendation, length_m, signalised_junctions,
                              cost_tier) {
  n <- length(recommendation)
  low <- rep(NA_real_, n)
  high <- rep(NA_real_, n)

  base_tier <- unname(INTERVENTION_BASE_COST[recommendation])
  escalated <- !is.na(cost_tier) & !is.na(base_tier) & cost_tier != base_tier
  multiplier <- ifelse(escalated, WIDE_ROAD_COST_MULTIPLIER, 1)

  for (type in names(INTERVENTION_COST_YEN_PER_M)) {
    hit <- !is.na(recommendation) & recommendation == type
    if (!any(hit)) next
    rate <- INTERVENTION_COST_YEN_PER_M[[type]]
    low[hit]  <- length_m[hit] * rate[["low"]]  * multiplier[hit]
    high[hit] <- length_m[hit] * rate[["high"]] * multiplier[hit]
  }

  crossing <- !is.na(recommendation) & recommendation == "Crossing improvement"
  if (any(crossing)) {
    # A corridor typed for a crossing scheme with no signalised junction on it
    # is priced for one: the classifier reached that label from the junction
    # rate per km, so there is a junction to treat even where the clustered
    # count rounds to zero.
    junctions <- pmax(1, dplyr::coalesce(signalised_junctions[crossing], 1L))
    low[crossing]  <- junctions * CROSSING_COST_YEN_PER_JUNCTION[["low"]]
    high[crossing] <- junctions * CROSSING_COST_YEN_PER_JUNCTION[["high"]]
  }

  # "Bike parking" has no corridor-level form - it is a point facility, and
  # the vocabulary carries it for completeness only (score_intervention.R).
  # Left NA rather than priced at zero, which would read as "free".
  list(low = low, high = high)
}

# --- Benefit -------------------------------------------------------------

#' A corridor's annual benefit in yen, under score_roi.R's own scenario.
#'
#' Congestion, vehicle operating cost and the health proxy - the three
#' benefits score_roi.R expresses in yen. Emissions and parking spaces are
#' left out rather than monetised at an invented carbon price or parking
#' rate: they are reported in their own units elsewhere and adding a made-up
#' conversion here would inflate the benefit side with the least defensible
#' number in the model.
#'
#' @param beneficiaries numeric vector, residents within the corridor's buffer
#' @param shift_share the mode-shift scenario, matching compute_hex_roi()
#' @return numeric vector, yen per year
corridor_benefit_yen_year <- function(beneficiaries, shift_share = 0.2) {
  trips <- estimate_car_short_trips(beneficiaries)
  shifted <- trips * shift_share

  daily <- estimate_congestion_cost_yen(shifted) +
    estimate_operating_cost_yen(shifted) +
    estimate_health_benefit_yen(shifted)

  daily * DAYS_PER_YEAR
}

# --- Payback -------------------------------------------------------------

#' Simple, undiscounted benefit payback period, in years: cost divided by
#' annual benefit.
#'
#' Deliberately **not** a benefit-cost ratio or a formal economic appraisal. A
#' BCR needs a discount rate and an appraisal period, and both are policy
#' choices this project has no mandate to make - the same reasoning F.8 gives
#' for refusing a blended "investment score". Simple payback needs neither,
#' and a reader can apply their own discounting to it if they have a rate to
#' apply. Treat this as a screening indicator for comparing corridors against
#' each other, not as an MLIT-compliant cost-benefit analysis.
#'
#' @return numeric vector of years, NA where either side is unknown and Inf
#'   where the benefit is zero
payback_years <- function(cost_yen, benefit_yen_year) {
  ifelse(is.na(cost_yen) | is.na(benefit_yen_year), NA_real_,
         ifelse(benefit_yen_year <= 0, Inf, cost_yen / benefit_yen_year))
}

#' The study-area ledger: what building every recommended corridor would cost,
#' against what the whole area's mode shift would return each year.
#'
#' This is the one place the two sides may honestly be put together, and the
#' reason is the arithmetic rather than the framing. Costs are summed over
#' corridors, which is valid because corridors are disjoint stretches of
#' street and each is a separate build. The benefit does **not** come from
#' summing those same corridors - their catchments overlap - but from the hex
#' grid, where every resident sits in exactly one cell and is therefore
#' counted exactly once.
#'
#' @param cost_low,cost_high numeric vectors, per corridor
#' @param roi_scenario the `roi_scenario` list from the study-area summary
#' @return list with the totals and the payback range
programme_ledger <- function(cost_low, cost_high, roi_scenario) {
  daily_benefit <-
    (roi_scenario$daily_congestion_savings_yen %||% 0) +
    (roi_scenario$daily_operating_savings_yen %||% 0) +
    (roi_scenario$daily_health_benefit_yen %||% 0)
  annual <- daily_benefit * DAYS_PER_YEAR

  total_low <- sum(cost_low, na.rm = TRUE)
  total_high <- sum(cost_high, na.rm = TRUE)

  list(
    total_cost_yen_low  = round(total_low),
    total_cost_yen_high = round(total_high),
    annual_benefit_yen  = round(annual),
    payback_years_low   = round(payback_years(total_low, annual), 1),
    payback_years_high  = round(payback_years(total_high, annual), 1),
    costed_corridors    = sum(!is.na(cost_low)),
    note = paste(
      "Costs are summed because corridors are disjoint builds. The benefit is",
      "NOT the sum of the corridors' own benefit figures - their catchments",
      "overlap - but the hex-grid scenario, where each resident is counted",
      "once. Unit costs are illustrative and unsourced; see R/score_cost.R."
    )
  )
}
