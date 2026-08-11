# 01e_download_bike_parking.R
# Loads bicycle parking AND bike-sharing facility locations for the study
# area, in one file, distinguished by `facility_type` (see fetch_osm.R's
# get_bike_facilities()). Filename kept as "bike_parking" for run-order
# continuity even though it now covers both facility types. Run after 01,
# before 08.

source("R/utils_config.R")
source("R/fetch_osm.R")

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

bike_facilities <- get_bike_facilities(pbf_path = cfg$pbf_path, boundary = boundary)

dir.create("output", showWarnings = FALSE)
sf::st_write(bike_facilities, sprintf("output/%s_bike_facilities.gpkg", cfg$name), delete_dsn = TRUE, quiet = TRUE)

message(sprintf(
  "Loaded %d bike facilities for %s (%d parking, %d sharing)",
  nrow(bike_facilities), cfg$name,
  sum(bike_facilities$facility_type == "parking"),
  sum(bike_facilities$facility_type == "sharing")
))
