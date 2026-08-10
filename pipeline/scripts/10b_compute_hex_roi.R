# 10b_compute_hex_roi.R
# Adds the "cycling ROI" scenario (see R/score_roi.R for assumptions and
# sources) to every hex. Run after 10_compute_scores.R, before 11_export.R.

source("R/utils_config.R")
source("R/score_roi.R")
library(sf)

cfg <- load_study_area()

hexes <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)

# Assumed share of current car short trips that would shift to cycling
# given better infrastructure - the main "what if" dial. 20% is a round,
# deliberately modest planning assumption, not a prediction.
SHIFT_SHARE <- 0.2

hexes <- compute_hex_roi(hexes, shift_share = SHIFT_SHARE)

sf::st_write(hexes, sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("ROI scenario computed for %d hexes at a %.0f%% mode-shift assumption",
                 nrow(hexes), SHIFT_SHARE * 100))
