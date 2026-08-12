# 05_build_segment_table.R
# Applies LTS scoring to the raw OSM road network. Joins nearby POI counts
# and footway proximity first, since score_lts() needs both.

source("R/utils_config.R")
source("R/score_lts.R")
library(sf)

cfg <- load_study_area()

roads    <- sf::st_read(sprintf("output/%s_roads_raw.gpkg", cfg$name), quiet = TRUE)
poi      <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)
footways <- sf::st_read(sprintf("output/%s_footways.gpkg", cfg$name), quiet = TRUE)
signals  <- sf::st_read(sprintf("output/%s_traffic_signals.gpkg", cfg$name), quiet = TRUE)

# Metric CRS for accurate buffering. Japan Plane Rectangular zone IX
# (Tokyo) - swap for the correct zone if your pilot area is elsewhere
# (same value used in 08_join_poi.R - keep both in sync).
METRIC_CRS <- 6677

roads_m    <- sf::st_transform(roads, METRIC_CRS)
poi_m      <- sf::st_transform(poi, METRIC_CRS)
footways_m <- sf::st_transform(footways, METRIC_CRS)
signals_m  <- sf::st_transform(signals, METRIC_CRS)

# --- Nearby POI count, grouping divided-road sibling carriageways -------
# OSM commonly maps a divided road as two separate one-way ways (one per
# direction). Buffering and counting each independently is wrong: shops
# near the median can fall within range of one carriageway but not the
# other, asymmetrically flagging only one side for informal parking even
# though both sides face the exact same shops. Fix: group ways that share
# a name, are both explicitly one-way, and sit close together, and give
# every member of the group the same combined count.
POI_BUFFER_M <- 20                    # "fronting this road"
SIBLING_DIST_M <- 40                  # generous enough to bridge a typical median

buffered <- sf::st_buffer(roads_m, POI_BUFFER_M)

oneway_val <- tolower(trimws(as.character(roads_m$oneway)))
is_divided_candidate <- !is.na(roads_m$name) & roads_m$name != "" &
  oneway_val %in% c("yes", "true", "1", "-1")

sibling_matrix <- sf::st_is_within_distance(roads_m, roads_m, SIBLING_DIST_M)

nearby_poi_count <- integer(nrow(roads_m))
for (i in seq_len(nrow(roads_m))) {
  neighbor_idx <- setdiff(sibling_matrix[[i]], i)
  if (is_divided_candidate[i] && length(neighbor_idx) > 0) {
    siblings <- neighbor_idx[
      is_divided_candidate[neighbor_idx] & roads_m$name[neighbor_idx] == roads_m$name[i]
    ]
    idx_to_combine <- c(i, siblings)
  } else {
    idx_to_combine <- i
  }
  combined_buffer <- sf::st_union(buffered[idx_to_combine, ])
  nearby_poi_count[i] <- length(sf::st_intersects(combined_buffer, poi_m)[[1]])
}
roads$nearby_poi_count <- nearby_poi_count

# --- Footway proximity, for sidewalks mapped as their own geometry ------
# Small buffer - a sidewalk running alongside a road should be very close,
# unlike the wider POI buffer above.
#
# Ways that are in BOTH layers are excluded first. get_osm_roads() now
# promotes shared bike/pedestrian paths (`highway=footway` +
# `bicycle=designated`, the standard Japanese 自転車歩行者道) into the
# cycling network, and get_footways() still returns those same ways as
# footways. Left in, every such path finds itself 0m away and reports
# `sidewalk_available = TRUE` on the strength of being its own sidewalk -
# which would then suppress score_suitability()'s no-safe-option penalty
# for a genuinely different reason than the one the field means.
footways_m <- footways_m[!(footways_m$osm_id %in% roads$osm_id), ]
message(sprintf("Footways usable as sidewalk evidence: %d (%d are in the road network itself)",
                nrow(footways_m), nrow(footways) - nrow(footways_m)))

FOOTWAY_BUFFER_M <- 12
roads$footway_nearby <- lengths(sf::st_intersects(
  sf::st_buffer(roads_m, FOOTWAY_BUFFER_M), footways_m
)) > 0

# --- Traffic signals along each segment, for travel-time estimation -----
# Not used by score_lts() itself (signals affect travel time, not crash-
# risk stress), but exported so a future per-route calculator can build a
# realistic time estimate from speed_kmh + signal count rather than the
# flat average this pipeline's aggregate ROI estimate uses (see
# R/score_roi.R). Small buffer - OSM places a signal node essentially on
# the road's own line at the intersection, not offset from it.
SIGNAL_BUFFER_M <- 15
roads$traffic_signals_count <- lengths(sf::st_intersects(
  sf::st_buffer(roads_m, SIGNAL_BUFFER_M), signals_m
))

roads <- score_lts(roads)

sf::st_write(roads, sprintf("output/%s_segments.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message("LTS distribution:")
print(table(roads$lts))
message("Existing cycling infrastructure by type:")
print(table(roads$cycleway_type, useNA = "no"))
message(sprintf("Segments with cycle infrastructure: %d of %d (%.1f km of %.1f km)",
                sum(roads$has_cycle_infra), nrow(roads),
                sum(as.numeric(sf::st_length(roads))[roads$has_cycle_infra]) / 1000,
                sum(as.numeric(sf::st_length(roads))) / 1000))
message(sprintf("Segments flagged for likely informal parking: %d of %d",
                 sum(roads$likely_informal_parking), nrow(roads)))
message(sprintf("Segments with no sidewalk available: %d of %d",
                 sum(!roads$sidewalk_available), nrow(roads)))
