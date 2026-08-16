# observed_mode_share.R
# Checks the model against the one thing in this project that was measured.
#
# WHAT THIS IS FOR
#
# `score_potential.R` no longer assumes suppression from road stress, so
# `gap_score` is at least not circular. That makes it *falsifiable*; it does
# not make it *true*. 07b puts observed commuting mode on the same hexes the
# model scores, so the two can finally be set against each other, and this
# file does the setting.
#
# It reports. It does not fit. With ~450 usable hexes there is now enough data
# to estimate weights, which is exactly why it is worth saying explicitly that
# doing so would be the wrong move here: `potential_score` claims to measure
# *potential*, and fitting it to *observed* cycling would redefine it as a
# prediction of the status quo - a model tuned to reproduce the pattern that
# the current, hostile network produces. The project exists to argue that
# pattern is not the ceiling.
#
# ############################################################
# #  HOW TO READ A WEAK CORRELATION HERE                     #
# ############################################################
#
# The census table is **通勤・通学 only**, and in this study area 55% of those
# journeys involve a train. The shopping, errand and school-escort trips a
# bicycle is best at are not in it at all. So:
#
#   - A weak relationship between `potential_score` and observed cycling is
#     evidence about *commuting*, not a verdict on the potential index.
#   - Rail share is the strongest single signal in the data and the potential
#     index contains nothing corresponding to it. A station is treated purely
#     as something that attracts trips; for commuting it is mostly a
#     substitute for them.
#
# The fair test of the demand side is therefore not the raw correlation but
# the one holding infrastructure constant: among hexes where the streets are
# equally good, do the ones the index calls high-potential actually cycle more?
# `validate_potential_model()` reports both, and the partial correlation is the
# one to read.

library(dplyr)

#' Pearson correlation, NA-safe, returning NA rather than erroring on a
#' constant vector.
.corr <- function(x, y) {
  ok <- is.finite(x) & is.finite(y)
  if (sum(ok) < 3) return(NA_real_)
  x <- x[ok]; y <- y[ok]
  if (stats::sd(x) == 0 || stats::sd(y) == 0) return(NA_real_)
  unname(stats::cor(x, y))
}

#' Correlation of x and y with z partialled out of both.
.partial_corr <- function(x, y, z) {
  rxy <- .corr(x, y); rxz <- .corr(x, z); ryz <- .corr(y, z)
  if (anyNA(c(rxy, rxz, ryz))) return(NA_real_)
  denom <- sqrt((1 - rxz^2) * (1 - ryz^2))
  if (denom == 0) return(NA_real_)
  (rxy - rxz * ryz) / denom
}

#' Hexes with too few commuters to carry a meaningful share.
#'
#' A bicycle share over eleven people is a coin-flip, and the grid has a long
#' tail of near-empty cells that would otherwise dominate the count while
#' contributing only noise.
MIN_COMMUTERS_FOR_VALIDATION <- 50

#' Set the model against the measurement.
#'
#' @param hexes scored hex data frame, post score_gap() and 07b
#' @param min_commuters hexes below this are excluded, and the number excluded
#'   is reported rather than quietly dropped
#' @return a named list for the study-area summary, or NULL where no observed
#'   data is present at all
validate_potential_model <- function(hexes, min_commuters = MIN_COMMUTERS_FOR_VALIDATION) {
  if (!"observed_bicycle_share" %in% names(hexes)) return(NULL)
  df <- sf::st_drop_geometry(hexes)
  if (all(is.na(df$observed_bicycle_share))) return(NULL)

  total_commuters <- sum(df$observed_commuters, na.rm = TRUE)
  total_bicycle <- sum(df$observed_bicycle, na.rm = TRUE)

  usable <- df[!is.na(df$observed_bicycle_share) &
                 df$observed_commuters >= min_commuters, ]

  quartile_table <- NULL
  if (nrow(usable) >= 20) {
    # Ranked into four bands by infrastructure quality. A monotone rise in
    # observed cycling across them is the project's central claim in its
    # simplest testable form; a flat or reversed one would be the clearest
    # possible evidence against it.
    band <- cut(rank(usable$infra_quality_score, ties.method = "first"),
                breaks = 4, labels = FALSE)
    quartile_table <- lapply(1:4, function(q) {
      part <- usable[band == q, ]
      list(
        quartile = q,
        hexes = nrow(part),
        mean_infra_quality = round(mean(part$infra_quality_score, na.rm = TRUE), 3),
        mean_observed_bicycle_share = round(mean(part$observed_bicycle_share, na.rm = TRUE), 4),
        mean_potential_score = round(mean(part$potential_score, na.rm = TRUE), 3)
      )
    })
  }

  list(
    source = "令和2年国勢調査 地域メッシュ統計 T001109",
    trips = "commute and school journeys only (通勤・通学)",
    commuters = round(total_commuters),
    bicycle_commuters = round(total_bicycle),
    bicycle_share = round(total_bicycle / max(total_commuters, 1), 4),
    rail_share = round(
      stats::weighted.mean(df$observed_rail_share, df$observed_commuters, na.rm = TRUE), 4),
    car_share = round(
      stats::weighted.mean(df$observed_car_share, df$observed_commuters, na.rm = TRUE), 4),

    validation = list(
      hexes_used = nrow(usable),
      hexes_excluded_too_few_commuters =
        sum(!is.na(df$observed_bicycle_share)) - nrow(usable),
      min_commuters = min_commuters,
      corr_potential = round(.corr(usable$observed_bicycle_share, usable$potential_score), 3),
      corr_gap = round(.corr(usable$observed_bicycle_share, usable$gap_score), 3),
      corr_infra_quality = round(
        .corr(usable$observed_bicycle_share, usable$infra_quality_score), 3),
      corr_rail_share = round(
        .corr(usable$observed_bicycle_share, usable$observed_rail_share), 3),
      # The one to read: does the potential side say anything about cycling
      # once the state of the streets is allowed for?
      partial_corr_potential_given_infra = round(
        .partial_corr(usable$observed_bicycle_share, usable$potential_score,
                      usable$infra_quality_score), 3),
      by_infra_quartile = quartile_table,
      note = paste(
        "Reported, never fitted. potential_score is an index of",
        "characteristics, not a forecast; tuning it to reproduce observed",
        "cycling would redefine it as a prediction of the status quo, which is",
        "the thing this project argues is not the ceiling. Read the partial",
        "correlation rather than the raw one."
      ),
      # Three readings of a null partial correlation, and this data separates
      # none of them. Listed in full because the first is the comfortable one
      # and would otherwise become the explanation by default - it is the only
      # one that asks nothing of us.
      why_the_partial_is_null = c(
        "Potential may not be observable from current behaviour at all: everyone in this study area is choosing under the network as it stands.",
        "The source is 通勤・通学 only, the most rail-dominated trip type there is. The shopping, errand and escort trips a bicycle is best at are absent, and the index may track those.",
        "The index may weight the wrong things. attraction_score scores stations x3 as trip attractors, when for commuting a station is largely a substitute - corr(potential, rail share) is positive."
      )
    )
  )
}
