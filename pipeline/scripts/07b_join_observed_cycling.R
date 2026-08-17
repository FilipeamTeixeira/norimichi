# 07b_join_observed_cycling.R
# Joins observed commuting mode from the census mesh onto the hex grid.
#
# Runs straight after 07_join_population.R, ward-scoped, and for the same
# reason: this table is published on the same 250m grid as the population, so
# it takes the identical route onto the hexes - area-weighted intersection,
# same code path, same caveats. It has to run after 07 rather than beside it
# because the disclosure-control fix redistributes suppressed cells by
# population, which 07 is what puts there.
#
# WHAT ARRIVES ON THE HEX
#
#   observed_commuters        15+ residents who work or study
#   observed_bicycle          ...of whom use a bicycle for the journey
#   observed_bicycle_share    the ratio
#   observed_rail_share       the same for 鉄道・電車, which turns out to be
#                             the strongest single fact about cycling here
#   observed_car_share
#
# These are the only measured columns on the grid. Everything else is derived.
#
# TWO THINGS THE SHARE IS NOT
#
# 1. **Not all trips.** 通勤・通学 only. In this study area 55% of those
#    journeys involve a train, and the shopping and escort trips a bicycle is
#    best at are not in the table at all.
# 2. **Not mutually exclusive.** The census records every mode a person uses,
#    so someone cycling to the station counts under both 自転車 and 鉄道・電車.
#    The mode columns sum to about 105% of the total. The denominator here is
#    the resident worker/student count, which also includes people who work at
#    home and use no mode at all, so the share is a slight underestimate in one
#    direction and a slight overestimate in the other. Treat the second digit
#    as noise.

source("R/utils_config.R")
source("R/fetch_census_mesh.R")

library(sf)
library(dplyr)
library(purrr)
library(jpmesh)
library(yaml)

cfg <- load_study_area()
obs_cfg <- yaml::read_yaml("config/observed_cycling.yml")

if (is.null(cfg$prefecture_code)) {
  stop("no prefecture_code for region ", cfg$region %||% cfg$name, "\n",
       "  Add it under that region's entry in config/study_area.yml, next to ",
       "its `pbf_path`.")
}

path <- file.path(obs_cfg$data_dir,
                  sprintf("tblT001109Q%02d.txt", as.integer(cfg$prefecture_code)))

hexes <- sf::st_read(sprintf("output/%s_hexgrid.gpkg", cfg$name), quiet = TRUE) |>
  sf::st_transform(4326)

if (!"population" %in% names(hexes)) {
  stop("the hex grid has no population column - run 07_join_population.R first. ",
       "The disclosure-control fix in 07b weights by it.")
}

# ------------------------------------------------------------
# 1. Read the prefecture file and undo its disclosure control
# ------------------------------------------------------------

value_cols <- c("commuters_total", "walk", "rail", "bus", "car",
                "motorcycle", "bicycle")
mesh <- read_census_mesh(path, obs_cfg$columns)
message(sprintf("Read %d mesh cells from %s", nrow(mesh), basename(path)))

# Population per 250m cell, from the same extract 07 used - so the weights
# here and the population on the hexes come from one source.
population <- readRDS(sprintf("output/%s_population_mesh.rds", cfg$name))
cat_col <- grep("^年齢別人口", names(population), value = TRUE)[1]
pop_by_mesh <- population |>
  dplyr::filter(grepl("人口（総数）", .data[[cat_col]]), !is.na(.data$value)) |>
  dplyr::transmute(mesh_code = as.character(.data$area_code),
                   population = as.numeric(.data$value)) |>
  dplyr::distinct(.data$mesh_code, .keep_all = TRUE)

mesh <- redistribute_suppressed(
  mesh, value_cols,
  weight = stats::setNames(pop_by_mesh$population, pop_by_mesh$mesh_code)
)

# Only the cells this ward's population extract knows about. The prefecture
# file covers all of Kanagawa, and intersecting 200k cells against the hex
# grid to discard 99% of them is pure cost.
mesh <- mesh[mesh$mesh_code %in% pop_by_mesh$mesh_code, ]
message(sprintf("  %d cell(s) overlap this ward's population mesh", nrow(mesh)))
if (nrow(mesh) == 0) {
  stop("no census mesh cells match this ward - check prefecture_code for ",
       "region ", cfg$region %||% cfg$name, " in config/study_area.yml (",
       cfg$prefecture_code, ")")
}

# ------------------------------------------------------------
# 2. Same area-weighted route onto the hexes that 07 uses
# ------------------------------------------------------------

geometry <- sf::st_sfc(
  purrr::map(mesh$mesh_code, ~ jpmesh::export_mesh(.x)[[1]]),
  crs = 4326
)
mesh_sf <- sf::st_sf(mesh, geometry = geometry)
mesh_sf$mesh_area <- as.numeric(sf::st_area(mesh_sf))

intersected <- sf::st_intersection(mesh_sf, hexes)
intersected$overlap <- as.numeric(sf::st_area(intersected)) / intersected$mesh_area

by_hex <- intersected |>
  sf::st_drop_geometry() |>
  group_by(hex_id) |>
  summarise(across(all_of(value_cols),
                   ~ sum(.x * overlap, na.rm = TRUE)),
            .groups = "drop")

share <- function(part, whole) ifelse(whole > 0, part / whole, NA_real_)

hexes <- hexes |>
  left_join(by_hex, by = "hex_id") |>
  mutate(
    observed_commuters     = round(coalesce(commuters_total, 0)),
    observed_bicycle       = round(coalesce(bicycle, 0)),
    # NA rather than 0 where nobody lives: a share over zero commuters is
    # undefined, and a zero there would drag every average down.
    observed_bicycle_share = round(share(bicycle, commuters_total), 4),
    observed_rail_share    = round(share(rail, commuters_total), 4),
    observed_car_share     = round(share(car, commuters_total), 4)
  ) |>
  select(-all_of(value_cols))

sf::st_write(hexes, sprintf("output/%s_hexgrid.gpkg", cfg$name),
             delete_dsn = TRUE, quiet = TRUE)

with_obs <- sum(!is.na(hexes$observed_bicycle_share))
message(sprintf(
  "Observed cycling joined to %d of %d hexes: %d commuters, %d by bicycle (%.1f%%)",
  with_obs, nrow(hexes),
  sum(hexes$observed_commuters, na.rm = TRUE),
  sum(hexes$observed_bicycle, na.rm = TRUE),
  100 * sum(hexes$observed_bicycle, na.rm = TRUE) /
    max(sum(hexes$observed_commuters, na.rm = TRUE), 1)
))
