# run_region.R
# Merges every ward listed under one region's `wards:` in config/study_area.yml
# into that region, scores it as one unit, and copies the result into the
# Next.js app.
#
# From a shell:
#
#   Rscript run_region.R Yokohama
#
# From R (open pipeline.Rproj first, so the working directory is pipeline/):
#
#   source("run_region.R")
#   run_region("Yokohama")
#
# Run it after run_ward.R has been run for each ward in that region, and
# re-run it in full every time a ward is added to it. Not because the old
# wards' geometry changed - because their scores did. A percentile rank and a
# min-max rescale are both relative to the set of features in the run, so a
# third ward moves the first two wards' numbers. There is no incremental
# version of this pass.
#
# A second region is a separate study, not an extension of this one: running
# it neither reads nor rewrites the first region's output/ files (everything
# is keyed on region/ward name), so adding Tokyo does not require re-running
# Yokohama. Publishing still overwrites the app's single copy - see
# publish_to_app() below.

source("R/utils_config.R")

REGION_STAGES <- c(
  "09b_merge_regions",          # concatenate the wards, drop their stale scores
  "05c_analyse_network",        # percentile ranks, over the whole region now
  "10_compute_scores",          # min-max rescales, ditto
  "10b_compute_hex_roi",
  "05d_score_interventions",    # after 10b: it reads the roi_* columns 10b adds
  "10c_compute_summary_stats",
  "11_export",
  "12_compute_investment_ranking",
  "13_compute_access"            # after 12: it labels corridors from its output
)

# 11 and 12 write into output/, alongside the .gpkg working files; the app
# serves public/data/. Bridging the two was a manual copy, and skipping it is
# invisible - no error anywhere, the map just keeps rendering whichever region
# was copied last. That is half of how Naka and Isogo went missing, so it is
# part of the run now.
APP_DATA <- "../app/public/data"

PUBLISHED <- c(
  "hexagons.geojson",
  "segments.geojson",
  "cycleways.geojson",
  "bike_facilities.geojson",
  "amenities.geojson",
  "traffic_signals.geojson",
  "summary.json",
  "investment_ranking.json",
  "population_mesh.geojson",
  "access_index.json"
)

# One file per origin, so a directory rather than a name. Mirrored rather than
# merged into the app's copy: an origin that disappears from the study area
# must not leave a stale surface behind for a deep link to keep resolving.
PUBLISHED_DIRS <- c("access")

#' @param region a region listed under `regions:` in config/study_area.yml
run_region <- function(region) {
  wards <- names(study_wards(region))   # validates the name, stops if unknown

  # Every stage below is keyed on cfg$name, so the region name has to be in
  # force before the first one runs. Leaving it pointed at a ward is exactly
  # the failure 09b's header warns about, and it is silent: the merge writes
  # {region}_*.gpkg, the export reads {ward}_*.gpkg, and you get one ward's
  # numbers published under the region's name with no error anywhere.
  #
  # 09b itself is unaffected - it reads the region name via current_region().
  use_region(region)

  message(sprintf("=== %s: %s ===", region, paste(wards, collapse = " + ")))

  # source() with its default local = FALSE, so the stages still run in the
  # global environment exactly as they did under the old single-file runner.
  for (stage in REGION_STAGES) {
    message("\n--- ", stage, " ---")
    source(file.path("scripts", paste0(stage, ".R")))
  }

  publish_to_app(region)
  invisible(region)
}

publish_to_app <- function(region) {
  if (!dir.exists(APP_DATA)) {
    stop("no app data directory at ", normalizePath(APP_DATA, mustWork = FALSE),
         "\n  Run this from the pipeline/ directory.")
  }

  missing <- PUBLISHED[!file.exists(file.path("output", PUBLISHED))]
  if (length(missing) > 0) {
    stop("the export stages did not produce: ", paste(missing, collapse = ", "))
  }

  copied <- file.copy(file.path("output", PUBLISHED), APP_DATA, overwrite = TRUE)
  if (!all(copied)) {
    stop("could not copy into ", APP_DATA, ": ",
         paste(PUBLISHED[!copied], collapse = ", "))
  }

  for (d in PUBLISHED_DIRS) {
    src <- file.path("output", d)
    if (!dir.exists(src)) stop("the export stages did not produce ", src, "/")
    dest <- file.path(APP_DATA, d)
    unlink(dest, recursive = TRUE)
    dir.create(dest, recursive = TRUE)
    files <- list.files(src, full.names = TRUE)
    if (!all(file.copy(files, dest, overwrite = TRUE))) {
      stop("could not copy ", src, "/ into ", dest)
    }
    message(sprintf("Mirrored %d files into app/public/data/%s/", length(files), d))
  }

  message(sprintf("\nCopied %d files to app/public/data/ - %s is live in the app.",
                  length(PUBLISHED), region))
  message("Restart the dev server if it is running: /api/geocode memoises the")
  message("study area's bounding box from hexagons.geojson at first request, so")
  message("address search stays bounded to the old region until the process restarts.")
  message("")
  message("app/public/data/ holds one region at a time - publishing a second")
  message("region overwrites this one's files here (the pipeline's own output/")
  message("is untouched and always has both). Ask when you want two regions")
  message("servable in the app at once; that needs a per-region publish path")
  message("plus a matching change on the frontend's fetch calls.")
}

# scripts/11_plot_leaflet_v2.R is deliberately not one of the stages. The old
# runner sourced it and printed `m`, which only does anything in an interactive
# session - it is a look-at-the-data preview, not part of producing the app's
# data. Run it by hand when you want it; it reads the same output/{region}_*
# files this pass just wrote.

if (invoked_as_script("run_region.R")) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) != 1) {
    stop("usage: Rscript run_region.R <region>\n",
         "  available: ", paste(all_regions(), collapse = ", "),
         call. = FALSE)
  }
  run_region(args[[1]])
}
