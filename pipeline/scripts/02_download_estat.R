# 02_download_estat.R
# Pulls 250m population mesh data for the study area from e-Stat.
#
# If you change the table ID, don't trust the title - verify which mesh
# level it actually serves. Each table accepts exactly one mesh-code
# length, so fetch one known cell per candidate ID and read back
# nchar(area_code): 8 = 1km, 9 = 500m, 10 = 250m. Same approach later
# if/when you add the traffic census (find_estat_table() with the keyword
# "全国道路・街路交通情勢調査").

source("R/utils_config.R")
source("R/fetch_estat.R")
library(sf)
library(jpmesh)
library(dplyr)

cfg <- load_study_area()

app_id <- Sys.getenv("ESTAT_APP_ID")
if (app_id == "") stop("Set ESTAT_APP_ID in your environment (.Renviron)")

# Verified by probing each ID with 8/9/10-digit codes for the same point:
#   8003007262 -> 1km    (8-digit codes only)
#   8003007402 -> 500m   (9-digit)
#   8003007573 -> 250m   (10-digit)  <- in use
#
# 250m rather than 500m because the hex grid is H3 resolution 9, ~0.105km2
# per cell. A 250m mesh cell is 0.0625km2, so it sits INSIDE a hex and the
# join below is an aggregation. Anything coarser is a disaggregation: a
# 500m cell spans ~2.4 hexes and a 1km cell ~10, which spreads one number
# flat across every hex it touches and invents detail that isn't in the
# source.
#
# Suppression is not the tradeoff it looks like. Cells flagged
# 秘匿地域・合算地域有り are aggregated into a neighbour, not withheld:
# across the four wards the flag rises 1.7% -> 2.4% -> 3.8% from 1km to
# 250m, no cell comes back without a value, and the area-weighted regional
# total holds at ~612k either way (610,783 / 612,995 / 612,200). Finer mesh
# costs spatial displacement in a few percent of cells, not population.
POPULATION_MESH_STATS_ID <- "8003007573"

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

# The step has to be FINER than the mesh cell's latitude height, or whole
# cells fall between sample rows and are silently never queried. Cell
# heights: 1km = 30" = 0.00833 deg, 500m = 15" = 0.00417, 250m = 7.5" =
# 0.00208. The old 0.005 step was safe only because the mesh was 1km; at
# 250m it would have skipped over half the cells without any error.
pad_deg  <- 0.01    # ~1km - comfortably wider than a single mesh cell
step_deg <- 0.001   # < 0.00208, the 250m cell height

sample_lons <- seq(bbox["xmin"] - pad_deg, bbox["xmax"] + pad_deg, by = step_deg)
sample_lats <- seq(bbox["ymin"] - pad_deg, bbox["ymax"] + pad_deg, by = step_deg)
sample_grid <- expand.grid(lon = sample_lons, lat = sample_lats)

# to_mesh_size must match the table: 1 / 0.5 / 0.25 produce the 8 / 9 /
# 10-digit codes that the 1km / 500m / 250m tables accept. e-Stat's cdArea
# is exact-match, so a mismatch here returns nothing for every batch.
mesh_codes <- unique(as.character(
  jpmesh::coords_to_mesh(sample_grid$lon, sample_grid$lat, to_mesh_size = 0.25)
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

# A batch matching zero records is normal here and must not abort the run.
# estatapi builds its pagination with seq(), so an empty result dies inside
# seq() ("wrong sign in 'by' argument") instead of returning an empty
# tibble. At 1km every batch of 100 cells hit something populated; at 250m
# a batch can be entirely bay, port or parkland, so this went from never
# happening to happening often.
#
# Matched on the message rather than caught blind: a bad appId, a rate
# limit or a wrong table ID must still stop the run loudly, exactly as
# fetch_estat.R's header argues.
empty_batches <- 0L

population <- dplyr::bind_rows(lapply(mesh_code_batches, function(codes) {
  result <- tryCatch(
    fetch_estat_table(app_id, POPULATION_MESH_STATS_ID, area_codes = codes),
    error = function(e) {
      if (grepl("wrong sign in 'by' argument", conditionMessage(e), fixed = TRUE)) {
        empty_batches <<- empty_batches + 1L
        return(NULL)
      }
      stop(e)
    }
  )
  Sys.sleep(0.5)  # be polite to the API between batched requests
  result
}))

dir.create("output", showWarnings = FALSE)
saveRDS(population, sprintf("output/%s_population_mesh.rds", cfg$name))

message(sprintf("Fetched %d population mesh records from %d of %d batches (%d empty)",
                nrow(population), length(mesh_code_batches) - empty_batches,
                length(mesh_code_batches), empty_batches))

# Every batch coming back empty means the codes and the table disagree -
# usually to_mesh_size above not matching the mesh level of
# POPULATION_MESH_STATS_ID, since cdArea is exact-match. Silence there
# would surface much later as a hex grid with zero population.
if (nrow(population) == 0) {
  stop("e-Stat returned no records for any batch - check that to_mesh_size ",
       "matches the mesh level of statsDataId ", POPULATION_MESH_STATS_ID)
}
