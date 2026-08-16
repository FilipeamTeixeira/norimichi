# run_ward.R
# Runs one ward from raw downloads up to 09 - the state 09b_merge_regions.R
# expects to find. Run it once per ward, whenever you add one.
#
# From a shell:
#
#   Rscript run_ward.R Naka-ku
#   Rscript run_ward.R Isogo-ku
#
# From R (open pipeline.Rproj first, so the working directory is pipeline/):
#
#   source("run_ward.R")
#   run_ward("Naka-ku")
#   run_ward("Isogo-ku")
#
# Sourcing the file only defines run_ward() - there is nothing to edit in here
# to change ward. The ward must be listed under `wards:` in
# config/study_area.yml, which is where its boundary relation ID comes from.
#
# WHY IT STOPS AT 09
#
# Everything from 05c on is scored relative to whatever features are in the
# run - percentile ranks (network_criticality_score) and min-max rescales
# (potential_score, and gap_score through it). Scored per ward, Naka's 80th
# percentile is not Isogo's, and no amount of concatenating fixes it after the
# fact. So the geometry is gathered per ward here and scored once, over the
# whole region, in run_region.R. 09b's header has the full argument, including
# what stays ward-scoped as a result.

source("R/utils_config.R")

WARD_STAGES <- c(
  "01_download_osm",
  "01b_download_poi",
  "01c_download_footways",
  "01d_download_traffic_signals",
  "01e_download_bike_parking",
  "02_download_estat",
  "03_download_ksj",
  "03b_merge_schools",           # KSJ is incomplete; OSM tops it up
  "04_download_dem",
  "05_build_segment_table",
  "05b_join_segment_context",
  "06_build_hex_grid",
  "07_join_population",
  "07b_join_observed_cycling",   # the one measured input
  "08_join_poi",
  "09_join_terrain"
)

#' @param ward a name listed under `wards:` in config/study_area.yml
run_ward <- function(ward) {
  cfg <- use_ward(ward)   # validates the name against `wards:` and stops if unknown

  message(sprintf("=== %s (OSM relation %s) ===", ward, cfg$osm_relation_id))

  # source() with its default local = FALSE, so the stages still run in the
  # global environment exactly as they did under the old single-file runner.
  for (stage in WARD_STAGES) {
    message("\n--- ", stage, " ---")
    source(file.path("scripts", paste0(stage, ".R")))
  }

  message(sprintf("\n%s is ready to merge.", ward))
  message("Run run_ward() for any other ward you want, then run_region.R.")
  invisible(ward)
}

if (invoked_as_script("run_ward.R")) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) != 1) {
    stop("usage: Rscript run_ward.R <ward>\n",
         "  available: ", paste(names(study_wards()), collapse = ", "),
         call. = FALSE)
  }
  run_ward(args[[1]])
}
