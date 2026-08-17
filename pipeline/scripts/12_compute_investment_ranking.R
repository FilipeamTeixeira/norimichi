# 12_compute_investment_ranking.R
# Rolls the scored segments up into corridors - one row per fundable project -
# and writes the Investment Ranking table.
#
# Runs after 05d_score_interventions.R, which assigns `corridor_id` and every
# per-segment field aggregated here. This script does no scoring of its own: it
# groups, sums, length-weights, and writes. Any number it produces traces back
# to a field 05d computed, which is what keeps this step cheap to re-run and
# keeps the classification logic in one place.
#
# The frontend then only displays. No classification, cost-tier or what-if
# logic is duplicated in TypeScript - the ranking page fetches
# investment_ranking.json and renders columns.

source("R/utils_config.R")
source("R/export_geojson.R")
source("R/score_intervention.R")   # COST_TIERS, for max_cost_tier()
source("R/score_cost.R")           # the yen side of the ledger
source("R/build_corridors.R")
library(sf)
library(dplyr)
library(jsonlite)

cfg <- load_study_area()

segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
hexes    <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)
# Signals are counted against the merged corridor geometry here, the same way
# 05d counts them to classify - summing the members' `traffic_signals_count`
# would double-count every junction between two members.
signals  <- sf::st_read(sprintf("output/%s_traffic_signals.gpkg", cfg$name), quiet = TRUE)

# Must match BENEFICIARY_BUFFER_M in 05d - a corridor's figure is otherwise not
# comparable with its own members'.
BENEFICIARY_BUFFER_M <- 500

required <- c("corridor_id", "recommendation", "benefit_kind", "suitability_after",
              "cost_tier", "estimated_beneficiaries", "context_hex_gap_score")
missing <- setdiff(required, names(segments))
if (length(missing) > 0) {
  stop("segment table is missing ", paste(missing, collapse = ", "),
       " - run scripts/05d_score_interventions.R first")
}

corridors <- aggregate_corridors(
  segments, hexes, signals,
  buffer_m = BENEFICIARY_BUFFER_M,
  stations = stations
)

# One label per corridor is now guaranteed by construction (05d classifies the
# corridor, not the way), so a member disagreeing with its corridor means the
# two stages have drifted apart - exactly what this split-out was meant to
# make impossible. Cheap to check, so check it.
mixed <- vapply(
  split(segments$recommendation[!is.na(segments$corridor_id)],
        segments$corridor_id[!is.na(segments$corridor_id)]),
  function(r) length(unique(r)) > 1, logical(1)
)
if (any(mixed)) {
  stop(sum(mixed), " corridor(s) contain more than one recommendation - ",
       "re-run scripts/05d_score_interventions.R")
}

# --- The yen side ---------------------------------------------------------
#
# Cost, benefit and payback per corridor. Done here rather than inside
# aggregate_corridors() because it needs nothing the rollup does not already
# produce - length, junction count, cost tier and beneficiaries are all
# columns by this point - and keeping it visible at the top level is worth
# more than hiding it one call deeper.

cost <- corridor_cost_yen(
  corridors$recommendation,
  corridors$length_m,
  corridors$signalised_junctions,
  corridors$cost_tier
)
corridors$cost_yen_low       <- round(cost$low)
corridors$cost_yen_high      <- round(cost$high)
corridors$benefit_yen_year   <- round(corridor_benefit_yen_year(corridors$estimated_beneficiaries))
corridors$payback_years_low  <- round(payback_years(cost$low,  corridors$benefit_yen_year), 1)
corridors$payback_years_high <- round(payback_years(cost$high, corridors$benefit_yen_year), 1)

uncosted <- sum(is.na(corridors$cost_yen_low))
if (uncosted > 0) {
  message(sprintf("%d corridor(s) have no costed intervention form (%s)",
                  uncosted,
                  paste(sort(unique(corridors$recommendation[is.na(corridors$cost_yen_low)])),
                        collapse = ", ")))
}

# The study-area ledger pairs a sum of disjoint build costs against the
# hex-grid benefit scenario, where each resident is counted once. 10c writes
# that summary earlier in the same run.
summary_path <- sprintf("output/%s_summary.json", cfg$name)
if (!file.exists(summary_path)) {
  stop("no ", summary_path, "\n",
       "  Run scripts/10c_compute_summary_stats.R first - the study-area ",
       "ledger pairs corridor costs against its ROI scenario.")
}
ledger <- programme_ledger(
  cost$low, cost$high,
  jsonlite::read_json(summary_path, simplifyVector = TRUE)$roi_scenario
)

message(sprintf(
  "Programme: %d costed corridors, ¥%.1fbn-¥%.1fbn to build, ¥%.1fbn/year of modelled benefit, payback %.1f-%.1f years",
  ledger$costed_corridors,
  ledger$total_cost_yen_low / 1e9, ledger$total_cost_yen_high / 1e9,
  ledger$annual_benefit_yen / 1e9,
  ledger$payback_years_low, ledger$payback_years_high
))

export_investment_ranking(corridors, cfg$name,
                          file.path(export_dir(cfg), "investment_ranking.json"),
                          ledger = ledger)
