# 02_download_estat.R
# Pulls population mesh data for the study area from e-Stat.
#
# Before running this: call find_estat_table() once interactively in the
# R console to get the exact statsDataId for the 500m population mesh
# table - don't guess it. Same approach later if/when you add the traffic
# census (search keyword "全国道路・街路交通情勢調査" instead).

# 02_download_estat.R
# Pulls population mesh data for the study area from e-Stat.
#
# Before running this: call find_estat_table() once interactively in the
# R console to get the exact statsDataId for the 500m population mesh
# table - don't guess it. Same approach later if/when you add the traffic
# census (search keyword "全国道路・街路交通情勢調査" instead).

source("R/utils_config.R")
source("R/fetch_estat.R")
library(sf)
library(jpmesh)
library(dplyr)

cfg <- load_study_area()

app_id <- Sys.getenv("ESTAT_APP_ID")
if (app_id == "") stop("Set ESTAT_APP_ID in your environment (.Renviron)")

# TODO: replace with the statsDataId you found via find_estat_table()
POPULATION_MESH_STATS_ID <- "00200511"


#8003007265

# Restrict the query to mesh codes that actually cover the study area.
# Without this, fetch_estat_table()'s area_codes defaults to NULL, which
# fetches an unfiltered slice of the NATIONAL mesh table - whatever rows
# happen to come back aren't guaranteed to be anywhere near your study
# area (this is exactly what caused population to resolve to Hokkaido for
# a Yokohama study area).
#
# Samples a grid of points across the boundary's bbox (padded ~1km)
# rather than just hex centroids, so mesh cells touching the edge of the
# study area aren't missed even though the hex grid isn't built yet at
# this point in the pipeline.
#
# NOTE: coords_to_mesh()'s exact parameter name/type has differed between
# jpmesh versions (older: mesh_size = "1km" string; newer: to_mesh_size =
# 1 numeric, used below). Since 07_join_population.R already calls
# jpmesh::export_mesh() successfully, your installed version matches the
# newer API - but if this errors on the argument name, run
# `?jpmesh::coords_to_mesh` to check your version's actual signature.
boundary <- study_area_bbox_sf(cfg)
bbox <- sf::st_bbox(boundary)

pad_deg <- 0.01   # ~1km - comfortably wider than a single 1km mesh cell
sample_lons <- seq(bbox["xmin"] - pad_deg, bbox["xmax"] + pad_deg, by = 0.005)
sample_lats <- seq(bbox["ymin"] - pad_deg, bbox["ymax"] + pad_deg, by = 0.005)
sample_grid <- expand.grid(lon = sample_lons, lat = sample_lats)

mesh_codes <- unique(as.character(
  jpmesh::coords_to_mesh(sample_grid$lon, sample_grid$lat, to_mesh_size = 1)
))

message(sprintf("Restricting e-Stat query to %d mesh codes covering the study area",
                length(mesh_codes)))

# e-Stat's cdArea filter caps out at 100 values per request
# ("絞り込み条件（cdArea）の値が多すぎます。100個以内で指定して下さい。") -
# batch and combine rather than sending all mesh codes in one call.
CDAREA_BATCH_SIZE <- 100
mesh_code_batches <- split(mesh_codes, ceiling(seq_along(mesh_codes) / CDAREA_BATCH_SIZE))

message(sprintf("Querying e-Stat in %d batch(es) of up to %d codes each",
                length(mesh_code_batches), CDAREA_BATCH_SIZE))

population <- dplyr::bind_rows(lapply(mesh_code_batches, function(codes) {
  result <- fetch_estat_table(app_id, POPULATION_MESH_STATS_ID, area_codes = codes)
  Sys.sleep(0.5)  # be polite to the API between batched requests
  result
}))

dir.create("output", showWarnings = FALSE)
saveRDS(population, sprintf("output/%s_population_mesh.rds", cfg$name))

message(sprintf("Fetched %d population mesh records", nrow(population)))
