# 10_compute_scores.R
# Joins segment LTS onto hexes (as avg_lts) and computes demand/gap scores.

source("R/utils_config.R")
source("R/score_demand.R")
source("R/score_gap.R")
library(sf)
library(dplyr)

cfg <- load_study_area()
hexes    <- sf::st_read(sprintf("output/%s_hexgrid.gpkg", cfg$name), quiet = TRUE)
segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)

# Mean LTS of roads intersecting each hex. A hex with no roads (rare, but
# possible at the edge of the study area) falls back to the worst case (4)
# rather than NA, so it doesn't distort normalization downstream.
joined <- sf::st_join(hexes, segments["lts"], join = sf::st_intersects)
avg_lts_by_hex <- joined |>
  sf::st_drop_geometry() |>
  group_by(hex_id) |>
  summarise(avg_lts = ifelse(all(is.na(lts)), 4, mean(lts, na.rm = TRUE)))

hexes <- hexes |>
  left_join(avg_lts_by_hex, by = "hex_id") |>
  score_demand() |>
  score_gap() |>
  rename(stress_score = avg_lts)

sf::st_write(hexes, sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
