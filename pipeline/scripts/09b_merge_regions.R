# 09b_merge_regions.R
# Merges per-municipality pipeline runs into one region, so that scores which
# are relative to the set of features in a run are computed over the whole
# region rather than within each ward.
#
# WHERE THIS RUNS
#
# After each city reaches 09, and before 05c on the merged region. Numbered 09b
# for the highest input stage it consumes - each city's segment table at its 05b
# state and each city's hex grid at its 09 state - not for its position in the
# run order, which the pipeline's numbering no longer tracks anyway (05d runs
# after 10b). Everything relative is recomputed downstream of it:
#
#   per city:   01 .. 04, 05, 05b, 06, 07, 08, 09      (stop there)
#   once:       09b_merge_regions.R
#               -> flip `name:` in config/study_area.yml to the region
#   region:     05c -> 10 -> 10b -> 05d -> 10c -> 11 -> 12
#
# Only 01-04 and 06 read the boundary via study_area_bbox_sf(), so after the
# merge `osm_relation_id` in the config is unused and can stay pointed at
# whichever ward it was - only `name:` has to change.
#
# WHY THE MERGE IS HERE AND NOT LATER
# Three fields are computed by ranking or rescaling across whatever features
# are present in the run, so they are not comparable between wards and cannot
# be repaired by concatenating finished outputs:
#   - network_criticality_score  percentile rank (score_network.R:217), and the
#                                bottleneck/low_priority cut is its 50th
#   - demand_score               normalize01() min-max (score_demand.R)
#   - gap_score                  demand_score - infra_quality_score, so it
#                                inherits the min-max transitively
# Island severance is the worst of it: a low-stress island continuing into the
# next ward is truncated, can fall under MIN_ISLAND_LENGTH_M and vanish, and a
# through-road at the seam looks like a dead end - which fabricates "Missing
# link" recommendations. Re-running 05c on the concatenated geometry fixes it:
# clipsrc cuts both wards at the identical boundary line and
# build_segment_adjacency() snaps vertices at 0.5m, so the graph re-knits
# across the seam on its own.
#
# WHAT STAYS WARD-SCOPED - the price of merging here rather than at 01
# The proximity joins are not re-run against merged inputs, so a destination
# just over the line stays invisible to its neighbour:
#   - school_nearby / station_nearby   05b, 500m
#   - the hex catchments               08, 1km schools/stations/shops,
#                                      300m bike parking/sharing
# This affects a band along each seam, not the interior. Fixing it properly
# means merging at 01-04 instead (fetch per ward, score once), which is a
# larger change to how the downloads are keyed.

source("R/utils_config.R")
library(sf)
library(dplyr)

# --- What to merge -------------------------------------------------------
#
# Edit these two, the same way you would edit config/study_area.yml. CITIES
# are the `name:` values the per-ward runs used, i.e. the output/ file prefixes.

REGION <- "Naka-Isogo"
CITIES <- c("Naka-ku", "Isogo-ku")

# --- Columns that must NOT survive the merge ------------------------------
#
# Everything 05c and 05d write is dropped here even though the input tables
# may still carry values from an earlier single-ward run. Dropping them means
# a forgotten re-run fails loudly - 11_export.R stops on a missing way_id -
# instead of shipping one ward's percentile ranks under a region label. That
# is the same failure run_pipeline.R's 05c comment documents, and it is silent
# if these are left in place.

RECOMPUTED_BY_05C <- c(
  "suitability_score", "island_id", "network_criticality_score",
  "islands_adjacent", "bridges_islands", "display_category"
)

RECOMPUTED_BY_05D <- c(
  "way_id", "estimated_beneficiaries", "recommendation", "cost_tier",
  "suitability_after", "benefit_kind", "intervention_lever",
  "context_hex_gap_score", "context_hex_demand_score",
  "context_hex_population", "context_hex_daily_savings_yen",
  "corridor_id"
)

# --- Helpers -------------------------------------------------------------

path_for <- function(city, layer) sprintf("output/%s_%s.gpkg", city, layer)

read_layer <- function(city, layer) {
  p <- path_for(city, layer)
  if (!file.exists(p)) {
    stop("missing input: ", p,
         "\n  Run the per-city pipeline for '", city, "' up to 09 first.")
  }
  sf::st_read(p, quiet = TRUE)
}

#' rbind layers that may disagree on columns, keeping only the shared ones.
#' Disagreement is normal (one ward re-run further than another) but silent
#' column loss is not, so anything dropped is named.
bind_layers <- function(parts, layer) {
  common <- Reduce(intersect, lapply(parts, names))
  dropped <- setdiff(unique(unlist(lapply(parts, names))), common)
  if (length(dropped) > 0) {
    message(sprintf("  %s: dropping %d column(s) not present in every city: %s",
                    layer, length(dropped), paste(dropped, collapse = ", ")))
  }
  do.call(rbind, lapply(parts, function(p) p[, common]))
}

#' Deduplicate a point layer. OSM layers key on osm_id, since the same node id
#' is the same thing. KSJ layers (schools, stations) have no id column at all,
#' so they key on geometry PLUS every attribute - geometry alone is wrong and
#' loses real records: KSJ N02 gives 関内 two rows sharing one centreline, one
#' per subway line (1号線 / 3号線, station codes 004691 / 004692). A genuine
#' seam duplicate is the same feature read through two ward boundaries, so it
#' matches on geometry and attributes together; two lines at one station do
#' not. A row whose osm_id is NA falls back to the same combined key rather
#' than collapsing with every other NA row.
dedupe_points <- function(x, layer) {
  before <- nrow(x)
  full_key <- paste(
    sf::st_as_text(sf::st_geometry(x)),
    do.call(paste, c(as.list(sf::st_drop_geometry(x)), sep = "\r")),
    sep = "\r"
  )
  key <- if ("osm_id" %in% names(x)) {
    ifelse(is.na(x$osm_id), full_key, as.character(x$osm_id))
  } else {
    full_key
  }
  out <- x[!duplicated(key), ]
  message(sprintf("  %s: %d -> %d rows (%d duplicate%s at the seam)",
                  layer, before, nrow(out), before - nrow(out),
                  if (before - nrow(out) == 1) "" else "s"))
  out
}

safe_max <- function(x) {
  x <- x[!is.na(x)]
  if (length(x) == 0) NA else max(x)
}

first_non_na <- function(x) {
  x <- x[!is.na(x)]
  if (length(x) == 0) NA else x[1]
}

# --- Segments ------------------------------------------------------------
#
# Plain rbind, deliberately no dedupe. clipsrc cuts a way crossing the border
# into two complementary fragments, one in each ward's extract; both belong in
# the merged table. A fragment is indistinguishable from the way-splitting the
# pipeline already handles - segments.geojson holds whole OSM ways that meet at
# interior vertices - and build_corridors.R regroups them by name plus
# contiguity, so the street comes back as one corridor.

message(sprintf("Merging %d cities into '%s': %s",
                length(CITIES), REGION, paste(CITIES, collapse = ", ")))

message("segments:")
segments <- bind_layers(lapply(CITIES, read_layer, layer = "segments"), "segments")

stale <- intersect(names(segments), c(RECOMPUTED_BY_05C, RECOMPUTED_BY_05D))
if (length(stale) > 0) {
  segments <- segments[, setdiff(names(segments), stale)]
  message(sprintf("  dropped %d column(s) recomputed downstream: %s",
                  length(stale), paste(stale, collapse = ", ")))
}

if (!"lts" %in% names(segments)) {
  stop("merged segments have no lts - the per-city runs did not reach 05.")
}
if (!"mean_slope_deg" %in% names(segments)) {
  stop("merged segments have no mean_slope_deg - the per-city runs did not ",
       "reach 05b, so 05c would score an incomplete table.")
}

message(sprintf("  %d segments, %.1f km",
                nrow(segments), sum(segments$length_m, na.rm = TRUE) / 1000))

# --- Hex grid ------------------------------------------------------------
#
# The grid is built per ward boundary (06:9), so a cell straddling a ward line
# exists in both grids under the SAME hex_id - H3 is a global grid - but with
# different values, each computed against only its own ward's population mesh
# and POI. Dedup is therefore not neutral. Taking the column-wise max is the
# defensible choice: undercounting is the failure mode, and a seam cell that
# saw only half its residents in one run is wrong in a knowable direction.
# Geometry is identical between the two, since the cell id determines it.
#
# The population mesh double-count trap does not arise here - we are merging
# hex-level results, not raw meshes. It belongs to the merge-at-02 design.

message("hexgrid:")
hexes <- bind_layers(lapply(CITIES, read_layer, layer = "hexgrid"), "hexgrid")

if ("demand_score" %in% names(hexes)) {
  stop("merged hexgrid carries demand_score - that is the scored grid. ",
       "Merge {city}_hexgrid.gpkg (post-09), not {city}_hexgrid_scored.gpkg; ",
       "10 rebuilds the scored grid from this one.")
}

dup_hexes <- sum(duplicated(hexes$hex_id))
attrs <- sf::st_drop_geometry(hexes)
value_cols <- setdiff(names(attrs), "hex_id")

collapsed <- attrs |>
  group_by(hex_id) |>
  summarise(across(all_of(value_cols),
                   ~ if (is.numeric(.x) || is.logical(.x)) safe_max(.x)
                     else first_non_na(.x)),
            .groups = "drop")

hexes <- hexes[!duplicated(hexes$hex_id), "hex_id"] |>
  left_join(collapsed, by = "hex_id")

message(sprintf("  %d hexes, %d straddled a ward line and were collapsed to the max",
                nrow(hexes), dup_hexes))
message(sprintf("  population %.0f", sum(hexes$population, na.rm = TRUE)))

# --- Point layers --------------------------------------------------------
#
# 10c and 11 read poi/schools/stations, 11 also reads bike_facilities and
# traffic_signals, and 12 reads stations for corridor labelling. All are
# deduped: a node on the boundary appears in both extracts, and 02's ~1km bbox
# pad (02_download_estat.R:59) makes the overlap deliberate.

POINT_LAYERS <- c("poi", "schools", "stations", "bike_facilities",
                  "traffic_signals")

message("point layers:")
points <- lapply(POINT_LAYERS, function(layer) {
  dedupe_points(bind_layers(lapply(CITIES, read_layer, layer = layer), layer),
                layer)
})
names(points) <- POINT_LAYERS

# --- Write ---------------------------------------------------------------

sf::st_write(segments, path_for(REGION, "segments"),
             delete_dsn = TRUE, quiet = TRUE)
sf::st_write(hexes, path_for(REGION, "hexgrid"),
             delete_dsn = TRUE, quiet = TRUE)
for (layer in POINT_LAYERS) {
  sf::st_write(points[[layer]], path_for(REGION, layer),
               delete_dsn = TRUE, quiet = TRUE)
}

message(sprintf("\nWrote output/%s_{segments,hexgrid,%s}.gpkg",
                REGION, paste(POINT_LAYERS, collapse = ",")))
message("Next:")
message(sprintf("  1. set  name: \"%s\"  in config/study_area.yml", REGION))
message("  2. run 05c -> 10 -> 10b -> 05d -> 10c -> 11 -> 12")
message("     (05d after 10b: it reads the roi_* columns 10b adds)")
