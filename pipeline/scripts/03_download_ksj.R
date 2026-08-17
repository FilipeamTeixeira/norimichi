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
#
# NOTE ON THE SCHOOL INPUT NAME. P29 ships **one shapefile per prefecture**,
# named `P29-<year>_<prefecture code>.shp`, so this stage picks the file from
# the region's `prefecture_code` - see ksj_p29_path(), which globs the year
# rather than assuming one, since a prefecture's latest edition is not the
# same year everywhere. It used to name Kanagawa's file outright, which worked
# for exactly as long as every region was Yokohama: running a Tokyo ward then
# clipped Kanagawa's schools to a Tokyo boundary, got nothing, and handed 03b
# an empty layer - which failed several frames deep with "arguments imply
# differing number of rows: 1, 0" rather than saying so.
#
# Stations are one nationwide file (N02), so they stay hardcoded.

source("R/utils_config.R")
source("R/fetch_ksj.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

if (is.null(cfg$prefecture_code)) {
  stop("no prefecture_code for region ", cfg$region %||% cfg$name, "\n",
       "  Add it under that region's entry in config/study_area.yml, next to ",
       "its `pbf_path`.")
}

schools_path <- ksj_p29_path("/Users/Fil/norimichi/pipeline/raw/ksj",
                             cfg$prefecture_code)
message("KSJ schools: ", basename(schools_path))

schools_all <- read_ksj(schools_path)
check_ksj_p29_schema(schools_all, schools_path)
schools  <- filter_points_in_area(schools_all, boundary)
stations <- filter_points_in_area(read_ksj("/Users/Fil/norimichi/pipeline/raw/stations/N02-25_Station.shp"), boundary)

# An empty clip is always a mistake - a ward with no schools does not exist -
# and it is the mistake that used to travel one stage before failing. Almost
# always the wrong prefecture file for this ward.
if (nrow(schools) == 0) {
  stop("no KSJ schools fall inside ", cfg$name, "\n",
       "  Read ", basename(schools_path), " (prefecture ", cfg$prefecture_code,
       "), and none of its schools are in this ward's boundary.\n",
       "  Check config/study_area.yml's `prefecture_code` for region ",
       cfg$region %||% cfg$name, " is the prefecture the ward is actually in.")
}

dir.create("output", showWarnings = FALSE)
sf::st_write(schools,  sprintf("output/%s_schools_ksj.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)
sf::st_write(stations, sprintf("output/%s_stations.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf("%d KSJ schools, %d stations in study area", nrow(schools), nrow(stations)))
message("Run scripts/03b_merge_schools.R next - it produces the schools layer the rest of the pipeline reads.")
