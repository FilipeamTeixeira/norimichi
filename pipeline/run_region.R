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
# it neither reads nor rewrites the first region's files, and publishing it
# does not disturb the first region's copy in the app either. Both are servable
# at once, each under its own /<slug>/ route - see publish_to_app() below.

source("R/utils_config.R")
library(jsonlite)

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

# 11, 12 and 13 write into output/export/<region>/; the app serves
# public/data/<slug>/. Bridging the two was a manual copy, and skipping it is
# invisible - no error anywhere, the map just keeps rendering whichever region
# was copied last. That is half of how Naka and Isogo went missing, so it is
# part of the run now.
#
# The other half was that both sides of that copy used to be *unprefixed*:
# output/hexagons.geojson and public/data/hexagons.geojson, one set shared by
# every region. Publishing Tokyo overwrote Yokohama in both places at once,
# silently. Each region now owns a directory on each side, and the only shared
# file left is the manifest below.
APP_DATA <- "../app/public/data"

# The one file in APP_DATA that is not region-scoped: the list of what is
# published, which region the bare "/" redirects to, and each one's extent so
# the map can frame it without a hardcoded centre. Rebuilt from what is on disk
# on every publish, so publishing Tokyo leaves Yokohama's entry standing.
MANIFEST <- "regions.json"

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

  src  <- export_dir(load_study_area(), create = FALSE)
  slug <- region_slug(region)
  dest <- file.path(APP_DATA, slug)

  missing <- PUBLISHED[!file.exists(file.path(src, PUBLISHED))]
  if (length(missing) > 0) {
    stop("the export stages did not produce: ",
         paste(file.path(src, missing), collapse = ", "))
  }

  dir.create(dest, recursive = TRUE, showWarnings = FALSE)
  copied <- file.copy(file.path(src, PUBLISHED), dest, overwrite = TRUE)
  if (!all(copied)) {
    stop("could not copy into ", dest, ": ",
         paste(PUBLISHED[!copied], collapse = ", "))
  }

  for (d in PUBLISHED_DIRS) {
    d_src <- file.path(src, d)
    if (!dir.exists(d_src)) stop("the export stages did not produce ", d_src, "/")
    d_dest <- file.path(dest, d)
    # Still a mirror rather than a merge, but now scoped to this region's own
    # directory - the unlink() that used to wipe every region's surfaces can
    # only reach this one's.
    unlink(d_dest, recursive = TRUE)
    dir.create(d_dest, recursive = TRUE)
    files <- list.files(d_src, full.names = TRUE)
    if (!all(file.copy(files, d_dest, overwrite = TRUE))) {
      stop("could not copy ", d_src, "/ into ", d_dest)
    }
    message(sprintf("Mirrored %d files into app/public/data/%s/%s/",
                    length(files), slug, d))
  }

  published <- write_manifest()

  message(sprintf("\nCopied %d files to app/public/data/%s/ - %s is live at /%s/.",
                  length(PUBLISHED), slug, region, slug))
  message("Published regions: ", paste(published, collapse = ", "))
  message("Restart the dev server if it is running: /api/geocode and the router")
  message("graph memoise per region at first request, so address search and")
  message("routing stay on the old data for this region until the process restarts.")
}

#' Rebuild app/public/data/regions.json from what is actually on disk.
#'
#' Derived, never hand-edited, and never additive-only: a region is listed if
#' and only if it is both declared in config/study_area.yml and has a published
#' directory. That makes the manifest the single answer to "what can the app
#' serve", so a region commented out of the config stops being routable without
#' anyone having to remember a second place to edit.
#'
#' Files for a de-listed region are deliberately left on disk rather than
#' deleted - commenting a region out to run something else is reversible, and
#' making it destructive is the same mistake this whole change is undoing.
#'
#' @return the slugs written, in config order
write_manifest <- function() {
  declared <- all_regions()
  entries <- list()

  for (r in declared) {
    slug <- region_slug(r)
    hex  <- file.path(APP_DATA, slug, "hexagons.geojson")
    if (!file.exists(hex)) next   # declared but never published

    def <- region_def(r)
    # The map's opening frame. Read off the published hexagons rather than
    # stored in the config: it is a fact about the data, and a hand-entered
    # centre is exactly what left Isogo-ku below the viewport when the region
    # grew. Bounds rather than centre+zoom so a region of any size frames
    # itself - fitBounds does the arithmetic the old comment did by hand.
    bbox <- as.numeric(sf::st_bbox(sf::st_read(hex, quiet = TRUE)))

    # I() on both vectors because auto_unbox is on for the scalars: without it
    # a one-ward region (Tokyo, today) would serialise `wards` as a bare string
    # rather than an array of one, and the frontend would render "S", "h", "i".
    entry <- list(
      slug  = slug,
      name  = r,
      # as.character() before I(): names(list()) is NULL, not character(0), and
      # I(NULL) does not serialise to an empty array.
      wards = I(as.character(names(def$wards %||% list()))),
      bbox  = I(bbox)
    )
    # Optional `label_ja:` in the config. Added only when present rather than
    # set to NULL, which jsonlite would write as an empty object.
    if (!is.null(def$label_ja)) entry$label_ja <- def$label_ja

    entries[[length(entries) + 1]] <- entry
  }

  if (length(entries) == 0) {
    stop("nothing published under ", APP_DATA, " - cannot write ", MANIFEST)
  }

  manifest <- list(
    # The bare "/" redirects here. First published region in config order, so
    # it moves only when the config's own ordering does.
    default = entries[[1]]$slug,
    regions = entries
  )

  jsonlite::write_json(manifest, file.path(APP_DATA, MANIFEST),
                       auto_unbox = TRUE, digits = 6, pretty = TRUE)

  vapply(entries, function(e) e$slug, character(1))
}

# scripts/11_plot_leaflet_v2.R is deliberately not one of the stages. The old
# runner sourced it and printed `m`, which only does anything in an interactive
# session - it is a look-at-the-data preview, not part of producing the app's
# data. Run it by hand when you want it; it reads the same
# output/export/{region}/ files this pass just wrote, so select the region
# first with use_region().

if (invoked_as_script("run_region.R")) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) != 1) {
    stop("usage: Rscript run_region.R <region>\n",
         "  available: ", paste(all_regions(), collapse = ", "),
         call. = FALSE)
  }
  run_region(args[[1]])
}
