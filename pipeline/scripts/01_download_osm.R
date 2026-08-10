# 01_download_osm.R
# Loads the OSM road network for the study area from your local Geofabrik
# .pbf and saves an intermediate .gpkg so later scripts don't re-run the
# (slow) vectortranslate step.
#
# Run from the pipeline/ directory: Rscript scripts/01_download_osm.R

source("R/utils_config.R")
source("R/fetch_osm.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

roads <- get_osm_roads(
  pbf_path = cfg$pbf_path,
  boundary = boundary
)

dir.create("output", showWarnings = FALSE)
sf::st_write(roads, sprintf("output/%s_roads_raw.gpkg", cfg$name),
             delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Loaded %d road segments for %s", nrow(roads), cfg$name))
