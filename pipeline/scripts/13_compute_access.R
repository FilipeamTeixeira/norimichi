# 13_compute_access.R
# Reach surfaces for every school and station: who can get there, and who is
# cut off by the streets in between.
#
# WHERE THIS RUNS
#
# Last, after 12. It needs the segment table in its fully-scored state -
# `corridor_id` and `benefit_kind` come from 05d, and the counterfactual
# below refuses to route through a corridor whose after-state 05d declined to
# model. It also reads every ward's raw e-Stat mesh extract rather than the
# hex grid, because the whole point is to count people at 250m rather than at
# the ~340m of an H3 res-9 cell; 07_join_population.R's aggregation to hexes
# is a step in the wrong direction for this question.
#
#   run_region.R:  09b -> 05c -> 10 -> 10b -> 05d -> 10c -> 11 -> 12 -> 13
#
# WHAT IT WRITES
#
#   population_mesh.geojson   the 250m grid, one feature per cell
#   access_index.json         one row per origin: the population figures
#   access/<origin_id>.json   per-origin cell distances, fetched on demand
#
# The split is a size decision. The index is what the ranked list and the
# origin markers need and is loaded once; the surfaces are ~1000 numbers per
# origin and only the selected one is ever wanted, so 135 of them travel as
# separate files rather than as one 3MB blob the app would download to render
# a single school.

source("R/utils_config.R")
source("R/score_access.R")
source("R/export_geojson.R")

library(sf)
library(dplyr)
library(igraph)
library(jpmesh)

cfg   <- load_study_area()
wards <- names(study_wards(current_region()))

segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)
schools  <- sf::st_read(sprintf("output/%s_schools.gpkg", cfg$name), quiet = TRUE)
stations <- sf::st_read(sprintf("output/%s_stations.gpkg", cfg$name), quiet = TRUE)

required <- c("way_id", "lts", "length_m", "corridor_id", "benefit_kind",
              "suitability_after", "recommendation")
missing <- setdiff(required, names(segments))
if (length(missing) > 0) {
  stop("segment table is missing: ", paste(missing, collapse = ", "),
       "\n  Run scripts/05d_score_interventions.R first.")
}

# ------------------------------------------------------------
# 1. Origins, mesh, graph - the three inputs, each built once
# ------------------------------------------------------------

# Lengths become igraph edge weights, which must be a bare numeric vector. A
# units object survives the GeoPackage round trip often enough not to be worth
# discovering inside distances().
segments$length_m <- as.numeric(segments$length_m)

origins <- build_access_origins(schools, stations)
message(sprintf("%d origins: %s",
                nrow(origins),
                paste(names(table(origins$kind)), table(origins$kind),
                      sep = " x ", collapse = ", ")))

mesh <- load_population_mesh(wards)

message("Building the segment adjacency graph...")
g <- with_edge_metres(build_segment_adjacency(segments), segments$length_m)

message("Matching mesh cells to streets...")
cell_segs <- cells_to_segments(mesh, segments)

# A cell with no street within ACCESS_BUFFER_M can never enter any surface,
# and a cell with no residents can never move a figure. Dropping both here
# rather than at export keeps every vector below the same length as `mesh` -
# and stops the app rendering a grid of empty squares out over the bay, the
# same reasoning as drop_empty_hexes() in export_geojson.R.
keep_cell <- lengths(cell_segs) > 0 & dplyr::coalesce(mesh$population, 0) > 0
message(sprintf("Mesh cells: %d total, %d with both residents and a street nearby",
                nrow(mesh), sum(keep_cell)))
mesh      <- mesh[keep_cell, ]
cell_segs <- cell_segs[keep_cell]

# Which segments sit at each origin's gate. Same metric CRS as everything
# else spatial in this pipeline.
gate <- sf::st_is_within_distance(
  sf::st_transform(sf::st_geometry(origins), METRIC_CRS),
  sf::st_transform(sf::st_geometry(segments), METRIC_CRS),
  dist = ORIGIN_SNAP_M
)
gate <- lapply(gate, as.integer)

is_calm <- dplyr::coalesce(segments$lts, 4) <= CALM_MAX_LTS
message(sprintf("Calm network: %d of %d segments at LTS <= %d (%.1f km of %.1f km)",
                sum(is_calm), nrow(segments), CALM_MAX_LTS,
                sum(segments$length_m[is_calm]) / 1000,
                sum(segments$length_m) / 1000))

net_any  <- prepare_subnetwork(g, seq_len(nrow(segments)))
net_calm <- prepare_subnetwork(g, which(is_calm))

# ------------------------------------------------------------
# 2. Pass one - the two surfaces, per origin
# ------------------------------------------------------------

message("Computing reach surfaces...")

# The study-area rollup, accumulated as we go: for each mesh cell, the
# distance to the NEAREST origin of each kind, on each surface.
#
# A running pmin() rather than a sum over origins, and the difference is not
# small. Reach surfaces overlap almost completely - a resident in the centre
# of the ward is within 3km of dozens of schools - so adding up every origin's
# population_any counts them once per school and produces a figure many times
# the region's population. Exactly the trap F.3 records for
# `estimated_beneficiaries`, in a different guise. A cell counts once, for the
# nearest origin that reaches it.
study <- list(
  school  = list(any = rep(Inf, nrow(mesh)), calm = rep(Inf, nrow(mesh))),
  station = list(any = rep(Inf, nrow(mesh)), calm = rep(Inf, nrow(mesh)))
)

surfaces <- lapply(seq_len(nrow(origins)), function(i) {
  seeds <- gate[[i]]

  dist_any  <- reach_distances(net_any,  segments$length_m, seeds)
  dist_calm <- reach_distances(net_calm, segments$length_m, seeds)

  cell_any  <- cell_distances(dist_any,  cell_segs)
  cell_calm <- cell_distances(dist_calm, cell_segs)

  kind <- origins$kind[i]
  study[[kind]]$any  <<- pmin(study[[kind]]$any,  cell_any)
  study[[kind]]$calm <<- pmin(study[[kind]]$calm, cell_calm)

  frontier <- frontier_corridors(g, segments, dist_any, dist_calm, seeds)

  if (i %% 25 == 0) message(sprintf("  %d / %d", i, nrow(origins)))

  list(
    cell_any     = cell_any,
    cell_calm    = cell_calm,
    band_any     = band_population(cell_any,  mesh),
    band_calm    = band_population(cell_calm, mesh),
    calm_at_gate = any(is_calm[seeds]),
    snapped      = length(seeds) > 0,
    frontier     = frontier
  )
})

unsnapped <- sum(!vapply(surfaces, function(s) s$snapped, logical(1)))
if (unsnapped > 0) {
  message(sprintf("  %d origin(s) had no street within %dm and report no reach",
                  unsnapped, ORIGIN_SNAP_M))
}
message(sprintf("  %d origin(s) have no low-stress street at the gate",
                sum(!vapply(surfaces, function(s) s$calm_at_gate, logical(1)))))

# ------------------------------------------------------------
# 3. Pass two - the counterfactual, grouped by corridor
# ------------------------------------------------------------
#
# "Upgrading this corridor brings N more residents into calm reach." The
# corridor's segments are added to the calm network and the calm surface is
# recomputed; the difference in band population is the unlock.
#
# Grouped by corridor rather than looped per origin because the expensive
# part - the induced subgraph - depends only on the corridor, while several
# nearby schools often name the same street. Building it once per corridor
# turns a few hundred subgraph constructions into a few dozen.
#
# The claim inherits its honesty from 05d: frontier_corridors() has already
# excluded any corridor whose after-state is unmodelled or still high-stress,
# so the network this routes over is one the pipeline elsewhere says the
# intervention would actually produce.

wanted <- unique(unlist(lapply(surfaces, function(s) s$frontier$corridor_ids)))
message(sprintf("Simulating %d distinct frontier corridor(s)...", length(wanted)))

unlocks <- vector("list", nrow(origins))
for (k in seq_along(wanted)) {
  corridor <- wanted[k]
  members  <- which(!is.na(segments$corridor_id) & segments$corridor_id == corridor)
  net_up   <- prepare_subnetwork(g, union(which(is_calm), members))

  for (i in seq_len(nrow(origins))) {
    if (!corridor %in% surfaces[[i]]$frontier$corridor_ids) next

    after <- band_population(
      cell_distances(reach_distances(net_up, segments$length_m, gate[[i]]), cell_segs),
      mesh
    )
    before <- surfaces[[i]]$band_calm

    unlocks[[i]] <- rbind(unlocks[[i]], data.frame(
      corridor_id        = corridor,
      band_m             = after$band_m,
      population         = after$population - before$population,
      population_child   = after$population_child - before$population_child,
      population_elderly = after$population_elderly - before$population_elderly
    ))
  }

  if (k %% 25 == 0) message(sprintf("  %d / %d", k, length(wanted)))
}

# ------------------------------------------------------------
# 4. Export
# ------------------------------------------------------------

dir.create("output/access", showWarnings = FALSE, recursive = TRUE)

# Corridor labels come from the investment ranking rather than being derived
# again here. A frontier corridor is a row on that page, and a reader who
# follows the link has to arrive at a street with the same name on it -
# re-deriving `dominant_name()` in a second place is exactly how the two
# would come to disagree.
ranking_path <- "output/investment_ranking.json"
if (!file.exists(ranking_path)) {
  stop("no ", ranking_path, "\n",
       "  Run scripts/12_compute_investment_ranking.R first - this stage ",
       "labels its frontier corridors from it.")
}
ranking <- jsonlite::read_json(ranking_path, simplifyVector = FALSE)
corridors <- do.call(rbind, lapply(ranking$corridors, function(c) data.frame(
  corridor_id    = c$corridor_id,
  name           = c$name %||% NA_character_,
  recommendation = c$recommendation %||% NA_character_,
  cost_tier      = c$cost_tier %||% NA_character_
)))

study_bands <- lapply(study, function(s) list(
  any  = band_population(s$any,  mesh),
  calm = band_population(s$calm, mesh)
))

export_population_mesh(mesh, "output/population_mesh.geojson")
export_access_index(origins, surfaces, unlocks, corridors, cfg$name, mesh,
                    study_bands, "output/access_index.json")
export_access_surfaces(origins, surfaces, mesh, "output/access")

primary <- which(ACCESS_BANDS_M == ACCESS_PRIMARY_BAND_M)
reach   <- study_bands$school$any$population[primary]
severed <- reach - study_bands$school$calm$population[primary]

message(sprintf(
  "\nAt %dm: %.0f residents can reach some school on any street, %.0f of them only on high-stress streets (%.0f%%). Region total %.0f.",
  ACCESS_PRIMARY_BAND_M, reach, severed,
  100 * severed / max(reach, 1), sum(mesh$population, na.rm = TRUE)
))
message("Wrote population_mesh.geojson, access_index.json and output/access/")
