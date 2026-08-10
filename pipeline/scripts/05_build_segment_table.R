# 05_build_segment_table.R
# Applies LTS scoring to the raw OSM road network. Joins nearby POI counts
# first, since score_lts()'s informal-parking proxy needs them.

source("R/utils_config.R")
source("R/score_lts.R")
library(sf)

cfg <- load_study_area()

roads <- sf::st_read(sprintf("output/%s_roads_raw.gpkg", cfg$name), quiet = TRUE)
poi   <- sf::st_read(sprintf("output/%s_poi.gpkg", cfg$name), quiet = TRUE)

# Count POIs within a short buffer of each road segment - "fronting this
# road", not the whole surrounding block.
POI_BUFFER_M <- 20
# Metric CRS for accurate buffering. Japan Plane Rectangular zone IX
# (Tokyo) - swap for the correct zone if your pilot area is elsewhere
# (same value used in 08_join_poi.R - keep both in sync).
METRIC_CRS <- 6677

roads_m  <- sf::st_transform(roads, METRIC_CRS)
poi_m    <- sf::st_transform(poi, METRIC_CRS)
buffered <- sf::st_buffer(roads_m, POI_BUFFER_M)

roads$nearby_poi_count <- lengths(sf::st_intersects(buffered, poi_m))

roads <- score_lts(roads)

sf::st_write(roads, sprintf("output/%s_segments.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message("LTS distribution:")
print(table(roads$lts))
message(sprintf("Segments flagged for likely informal parking: %d of %d",
                 sum(roads$likely_informal_parking), nrow(roads)))
message(sprintf("Segments with no sidewalk available: %d of %d",
                 sum(!roads$sidewalk_available), nrow(roads)))
