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
source("R/build_corridors.R")
library(sf)
library(dplyr)

cfg <- load_study_area()

segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
hexes    <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)

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
  segments, hexes,
  buffer_m = BENEFICIARY_BUFFER_M,
  stations = stations
)

export_investment_ranking(corridors, cfg$name, "output/investment_ranking.json")
