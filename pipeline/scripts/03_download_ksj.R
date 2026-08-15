# 03_download_ksj.R
# Reads the manually-downloaded KSJ shapefiles (schools, stations) and
# clips them to the study area.
#
# NOTE ON THE SCHOOL OUTPUT NAME. This writes `_schools_ksj.gpkg`, not
# `_schools.gpkg`. KSJ is incomplete - it misses schools that are plainly
# there - so 03b_merge_schools.R tops it up from OSM and writes the
# `_schools.gpkg` that 05b, 08, 11 and 13 all read.
#
# The two-file split is deliberate rather than tidy. If this stage wrote
# `_schools.gpkg` directly and 03b overwrote it, then re-running 03 on its own
# would silently replace the merged layer with the KSJ-only one, and every
# school count downstream would drop with no error anywhere. Two names means
# that cannot happen: the file the pipeline reads is only ever written by the
# stage that merges.

source("R/utils_config.R")
source("R/fetch_ksj.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

schools  <- filter_points_in_area(read_ksj("/Users/Fil/norimichi/pipeline/raw/ksj/P29-21_14.shp"), boundary)
stations <- filter_points_in_area(read_ksj("/Users/Fil/norimichi/pipeline/raw/stations/N02-25_Station.shp"), boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(schools,  sprintf("output/%s_schools_ksj.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
sf::st_write(stations, sprintf("output/%s_stations.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("%d KSJ schools, %d stations in study area", nrow(schools), nrow(stations)))
message("Run scripts/03b_merge_schools.R next - it produces the schools layer the rest of the pipeline reads.")
