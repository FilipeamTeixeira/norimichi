# 05d_score_interventions.R
# Segment-level intervention scoring: what to build on each stressful street,
# what it would cost, what it would actually achieve, who is nearby, and which
# corridor it belongs to.
#
# ORDERING — this has two upstream dependencies, not one, and the second is
# easy to miss given the "05d" name:
#
#   - 05c_analyse_network.R, for `bridges_islands`: without it a missing link
#     is indistinguishable from a merely wide road.
#   - 10b_compute_hex_roi.R, because the hex context join and the beneficiary
#     counts read the *scored* hex grid (population and roi_* fields), not the
#     bare grid from 06.
#
# So despite the number it belongs after 10b, which is where run_pipeline.R
# sources it. It must precede 11_export.R and 12_compute_investment_ranking.R,
# both of which read what this writes.
#
# WHY THIS IS ITS OWN STAGE
# All of it used to live inline in 11_export.R, which meant the export step
# owned a body of scoring logic. That put the classification rule, the
# counterfactual simulation and the beneficiary join in the one script whose
# job is supposed to be writing files, and it left 12_compute_investment_
# ranking.R with nothing to read - it would have had to recompute the same
# fields from the same inputs and hope the two agreed. Persisting them to the
# segment table instead means segments.geojson and the ranking are consistent
# by construction, not by coincidence.

source("R/utils_config.R")
source("R/score_lts.R")
source("R/score_suitability.R")
source("R/score_intervention.R")
source("R/join_hex_context.R")
source("R/build_corridors.R")
library(sf)
library(dplyr)

cfg <- load_study_area()

segments_path <- sprintf("output/%s_segments.gpkg", cfg$name)
segments <- sf::st_read(segments_path, quiet = TRUE)
hexes    <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
# The signal layer, not the per-segment `traffic_signals_count` - the corridor
# classification needs distinct junctions along a whole corridor, which cannot
# be recovered by summing a per-way count. See corridor_signal_junctions().
signals  <- sf::st_read(sprintf("output/%s_traffic_signals.gpkg", cfg$name), quiet = TRUE)

METRIC_CRS <- 6677

# How far from a street someone counts as a beneficiary. Shared with
# aggregate_corridors() in 12, which must use the same distance or a corridor's
# figure would not be comparable with its members'.
BENEFICIARY_BUFFER_M <- 500

# --- Stable row identity -------------------------------------------------
#
# `way_id` is a row index, not an OSM id, and the frontend uses it purely as a
# feature identity for map hit-testing and React keys. It is assigned *here*
# rather than at export time so that 11 and 12 read the same value: two scripts
# each calling seq_len(nrow(.)) would agree only as long as they happened to
# read the rows in the same order.
segments$way_id <- seq_len(nrow(segments))

if (!"length_m" %in% names(segments)) {
  segments$length_m <- as.numeric(sf::st_length(segments))
}

# --- Estimated beneficiaries from nearby hex population ------------------

segments_m <- sf::st_transform(segments, METRIC_CRS)
hexes_m    <- sf::st_transform(hexes, METRIC_CRS)

seg_buffers <- sf::st_buffer(segments_m, BENEFICIARY_BUFFER_M)
hex_hits    <- sf::st_intersects(seg_buffers, hexes_m)

segments$estimated_beneficiaries <- vapply(hex_hits, function(idx) {
  if (length(idx) == 0) return(0L)
  as.integer(round(sum(hexes_m$population[idx], na.rm = TRUE)))
}, integer(1))

message(sprintf("Beneficiary estimates: median %d, max %d",
                median(segments$estimated_beneficiaries),
                max(segments$estimated_beneficiaries)))

# --- Corridor membership -------------------------------------------------
#
# BEFORE the recommendation, not after, which is the opposite of how this used
# to run. Grouping first is what stops one street becoming several projects
# because a mapping split moved it across a classification threshold; the full
# argument is in R/build_corridors.R's header. Assignment only - the rollup
# into one row per corridor is 12's job.

segments$corridor_id <- assign_corridor_ids(segments)
message(sprintf("Corridor membership: %d segments in %d corridors",
                sum(!is.na(segments$corridor_id)),
                length(unique(na.omit(segments$corridor_id)))))

# --- Recommendation, cost tier, and the intervention simulation ----------
#
# Decided once per corridor from scale-free inputs, then written down onto
# every member segment. So segments.geojson and the ranking cannot disagree
# about what is proposed for a street, and no corridor contains two
# recommendations - which is what let a 47m stub and the 192m street it
# continues into be typed as two different projects.

corridors_class <- corridor_classification_inputs(segments, signals)
corridors_class$recommendation <- classify_corridor_recommendation(corridors_class)

segments$recommendation <- corridors_class$recommendation[
  match(segments$corridor_id, corridors_class$corridor_id)
]

message("Recommendation distribution (corridors):")
print(table(corridors_class$recommendation, useNA = "no"))
message("Recommendation distribution (segments):")
print(table(segments$recommendation, useNA = "no"))
message(sprintf(
  "Signalised junctions per corridor: median %.1f/km, max %.1f/km (%d corridors at %d+ junctions and %g+/km)",
  median(corridors_class$signals_per_km), max(corridors_class$signals_per_km),
  sum(corridors_class$signalised_junctions >= MIN_CROSSING_JUNCTIONS &
        corridors_class$signals_per_km >= CROSSING_SIGNALS_PER_KM),
  MIN_CROSSING_JUNCTIONS, CROSSING_SIGNALS_PER_KM
))

segments$cost_tier <- score_cost_tier(
  segments$recommendation, segments$lanes_n, segments$speed_kmh
)

# The honest before/after. Each modelled intervention edits the inputs it would
# actually change on the ground and re-runs score_lts(); the two interventions
# the stress score has no input for get NA rather than a number borrowed from a
# different intervention.
simulated <- simulate_interventions(segments, segments$recommendation)
segments$suitability_after  <- simulated$suitability_after
segments$benefit_kind       <- simulated$benefit_kind
segments$intervention_lever <- simulated$intervention_lever

message(sprintf("Segments with recommendations: %d of %d",
                sum(!is.na(segments$recommendation)), nrow(segments)))
message("Expected suitability change, by intervention type:")
for (type in INTERVENTION_TYPES) {
  rows <- which(segments$recommendation == type)
  if (length(rows) == 0) next
  if (identical(INTERVENTION_BENEFIT_KIND[[type]], "lts_recalc")) {
    message(sprintf("  %-22s n=%4d  %.1f -> %.1f (mean %+.1f)",
                    type, length(rows),
                    mean(segments$suitability_score[rows]),
                    mean(segments$suitability_after[rows]),
                    mean(segments$suitability_after[rows] -
                           segments$suitability_score[rows])))
  } else {
    message(sprintf("  %-22s n=%4d  no before/after - %s",
                    type, length(rows), INTERVENTION_LEVER[[type]]))
  }
}

# --- Neighbourhood context from the enclosing hex (labelled, not attributed) ---

segments <- join_hex_context(segments, hexes)

sf::st_write(segments, segments_path, delete_dsn = TRUE, quiet = TRUE)
message(sprintf("Updated %s with intervention scoring and corridor membership",
                segments_path))
