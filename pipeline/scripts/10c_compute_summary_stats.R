# 10c_compute_summary_stats.R
# Rolls up hex- and segment-level scores into study-area headline
# numbers. Run after 10b, before 11_export.R.

source("R/utils_config.R")
source("R/summary_stats.R")
source("R/observed_mode_share.R")
library(sf)
library(jsonlite)

cfg <- load_study_area()

hexes    <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
poi      <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)
schools  <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)

# The model set against the one measurement, from the observed_* columns
# 07b joined onto the grid. NULL where 07b has not been run, in which case the
# summary carries modelled figures only and says so.
observed <- validate_potential_model(hexes)
if (is.null(observed)) {
  message("No observed cycling on the hex grid - run scripts/07b_join_observed_cycling.R ",
          "per ward. The summary will carry modelled figures only.")
} else {
  v <- observed$validation
  message(sprintf("Observed cycling: %.1f%% of commute/school journeys (%s of %s people)",
                  100 * observed$bicycle_share,
                  format(observed$bicycle_commuters, big.mark = ","),
                  format(observed$commuters, big.mark = ",")))
  message(sprintf("  rail %.0f%%, car %.0f%%",
                  100 * observed$rail_share, 100 * observed$car_share))
  message(sprintf("Model vs measurement over %d hexes:", v$hexes_used))
  message(sprintf("  potential_score       r = %+.3f   (partial, given infra: %+.3f)",
                  v$corr_potential, v$partial_corr_potential_given_infra))
  message(sprintf("  gap_score             r = %+.3f", v$corr_gap))
  message(sprintf("  infra_quality_score   r = %+.3f", v$corr_infra_quality))
  message(sprintf("  observed rail share   r = %+.3f", v$corr_rail_share))
  for (q in v$by_infra_quartile) {
    message(sprintf("    infra Q%d (%.2f): %.1f%% cycle", q$quartile,
                    q$mean_infra_quality, 100 * q$mean_observed_bicycle_share))
  }
}

summary_stats <- compute_study_area_summary(
  hexes, segments,
  poi_count = nrow(poi), schools_count = nrow(schools), stations_count = nrow(stations),
  observed_cycling = observed
)

dir.create("output", showWarnings = FALSE)
jsonlite::write_json(summary_stats, sprintf("output/%s_summary.json", cfg$name),
                      auto_unbox = TRUE, pretty = TRUE)

message("Study area summary:")
str(summary_stats)
