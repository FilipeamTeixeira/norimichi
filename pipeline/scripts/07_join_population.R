# 07_join_population.R
#
# Joins e-Stat 500m mesh population onto the H3 hex grid.
#
# Population is distributed to H3 hexes according to the proportion
# of each 500m mesh cell overlapping each hex.

source("R/utils_config.R")

library(sf)
library(dplyr)
library(purrr)
library(jpmesh)

cfg <- load_study_area()

# ------------------------------------------------------------
# 1. Load H3 hex grid
# ------------------------------------------------------------

hexes <- sf::st_read(
  sprintf("output/%s_hexgrid.gpkg", cfg$name),
  quiet = TRUE
)

# Make sure both datasets use WGS84
hexes <- sf::st_transform(hexes, 4326)

# ------------------------------------------------------------
# 2. Load e-Stat population mesh
# ------------------------------------------------------------

population <- readRDS(
  sprintf("output/%s_population_mesh.rds", cfg$name)
)

# Keep total population only
population <- population |>
  filter(
    `年齢別人口、世帯の種類別世帯数等　` == "　人口（総数）"
  ) |>
  filter(!is.na(value)) |>
  mutate(
    area_code = as.character(area_code)
  )

message(sprintf(
  "Population mesh records: %d",
  nrow(population)
))

message(sprintf(
  "Unique mesh codes: %d",
  n_distinct(population$area_code)
))

message(sprintf(
  "Mesh-code lengths: %s",
  paste(unique(nchar(population$area_code)), collapse = ", ")
))

# ------------------------------------------------------------
# 3. Convert mesh codes to polygons
# ------------------------------------------------------------

message("Converting mesh codes to polygons...")

mesh_geometry <- purrr::map(
  population$area_code,
  ~ jpmesh::export_mesh(.x)[[1]]
)

mesh_geometry <- sf::st_sfc(
  mesh_geometry,
  crs = 4326
)

mesh_polygons <- sf::st_sf(
  population,
  geometry = mesh_geometry
)

# ------------------------------------------------------------
# 4. Calculate mesh areas
# ------------------------------------------------------------

mesh_polygons <- mesh_polygons |>
  mutate(
    mesh_area = as.numeric(sf::st_area(geometry))
  )

# ------------------------------------------------------------
# 5. Intersect mesh cells with H3 hexes
# ------------------------------------------------------------

message("Intersecting population meshes with H3 hexes...")

intersected <- sf::st_intersection(
  mesh_polygons,
  hexes
)

message(sprintf(
  "Created %d mesh/hex intersections",
  nrow(intersected)
))

# ------------------------------------------------------------
# 6. Area-weight population
# ------------------------------------------------------------

intersected <- intersected |>
  mutate(
    overlap_area = as.numeric(sf::st_area(geometry)),
    pop_share = value * overlap_area / mesh_area
  )

# ------------------------------------------------------------
# 7. Aggregate population to H3
# ------------------------------------------------------------

pop_by_hex <- intersected |>
  sf::st_drop_geometry() |>
  group_by(hex_id) |>
  summarise(
    population = sum(pop_share, na.rm = TRUE),
    .groups = "drop"
  )

# ------------------------------------------------------------
# 8. Join population onto hex grid
# ------------------------------------------------------------

hexes <- hexes |>
  left_join(
    pop_by_hex,
    by = "hex_id"
  ) |>
  mutate(
    population = coalesce(population, 0)
  )

# ------------------------------------------------------------
# 9. Save
# ------------------------------------------------------------

sf::st_write(
  hexes,
  sprintf("output/%s_hexgrid.gpkg", cfg$name),
  delete_dsn = TRUE,
  quiet = TRUE
)

message(sprintf(
  "Population joined to %d hexes",
  nrow(hexes)
))

message(sprintf(
  "Total interpolated population: %.1f",
  sum(hexes$population, na.rm = TRUE)
))
