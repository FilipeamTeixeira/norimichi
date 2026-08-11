# 05c_analyse_network.R
# Computes the 0-100 suitability score and the stress-based network
# connectivity analysis (low-stress islands + which high-stress segments
# would merge them if upgraded). See R/score_network.R for the method and
# why criticality can't be derived from segment tags alone.
#
# Runs after 05b_join_segment_context.R, before 11_export.R.

source("R/utils_config.R")
source("R/score_suitability.R")
source("R/score_network.R")
source("R/score_lts.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)

# has_cycle_infra becomes a persistent column once 05 is re-run, but derive
# it from the raw tags if this is an older segment table (same fallback as
# 11_export.R uses).
if (!"has_cycle_infra" %in% names(segments)) {
  segments$has_cycle_infra <- has_cycle_infra(
    segments$cycleway, segments$cycleway_left,
    segments$cycleway_right, segments$cycleway_both
  )
}
if (!"length_m" %in% names(segments)) {
  segments$length_m <- as.numeric(sf::st_length(segments))
}

# --- 1. Suitability score -----------------------------------------------

segments$suitability_score <- score_suitability(
  segments$lts, segments$sidewalk_available, segments$has_cycle_infra
)

message("Suitability score distribution:")
print(summary(segments$suitability_score))

# --- 2. Build the network graph ------------------------------------------

message("Building segment adjacency graph...")
g <- build_segment_adjacency(segments)

message(sprintf("Graph: %d segments, %d adjacencies",
                igraph::vcount(g), igraph::ecount(g)))

isolated <- sum(igraph::degree(g) == 0)
if (isolated > 0) {
  message(sprintf("  (%d segments share no vertex with any other - these are
  genuinely disconnected in OSM, not a snapping failure)", isolated))
}

# --- 3. Low-stress islands ----------------------------------------------

is_low  <- segments$lts <= 2
is_high <- segments$lts >= 3

message(sprintf("Low-stress segments: %d, high-stress: %d",
                sum(is_low), sum(is_high)))

islands <- find_low_stress_islands(g, is_low, segments$length_m)
segments$island_id <- islands$island_id

n_islands <- length(islands$island_length_m)
message(sprintf("Low-stress islands (>= %dm): %d",
                MIN_ISLAND_LENGTH_M, n_islands))
if (n_islands > 0) {
  message(sprintf("  largest %.0fm, median %.0fm, total in islands %.0fm",
                  max(islands$island_length_m),
                  median(islands$island_length_m),
                  sum(islands$island_length_m)))
  message(sprintf("  low-stress segments in a significant island: %d of %d",
                  sum(!is.na(segments$island_id)), sum(is_low)))
}

# --- 4. Network criticality --------------------------------------------

message("Computing network criticality...")
crit <- compute_network_criticality(
  g, segments$island_id, islands$island_length_m, is_high
)

segments$network_criticality_score <- crit$criticality_score
segments$islands_adjacent          <- crit$islands_adjacent
segments$bridges_islands           <- crit$bridges_islands

message(sprintf("Direct island bridges (touch >= 2 islands): %d",
                sum(crit$bridges_islands)))
message(sprintf("High-stress segments on a corridor between islands: %d of %d",
                sum(crit$criticality_raw > 0), sum(is_high)))

# --- 5. Final display category -----------------------------------------

segments$display_category <- classify_display_category(
  segments$suitability_score,
  segments$network_criticality_score,
  segments$bridges_islands
)

message("Display category distribution:")
print(table(segments$display_category))

message(sprintf(
  "Of %d high-stress segments: %d are strategic bottlenecks, %d connect nothing",
  sum(is_high),
  sum(segments$display_category == "bottleneck"),
  sum(segments$display_category == "low_priority")
))

sf::st_write(segments, sprintf("output/%s_segments.gpkg", cfg$name),
             delete_dsn = TRUE, quiet = TRUE)

message("Network analysis written to segment table")
