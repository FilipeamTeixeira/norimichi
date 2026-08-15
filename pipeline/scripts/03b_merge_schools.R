# 03b_merge_schools.R
# Tops KSJ's school list up from OSM and writes the schools layer everything
# downstream reads.
#
# WHY IT IS ITS OWN STAGE
#
# KSJ P29 is incomplete, and a missing school is invisible in three places at
# once - `schools_nearby` on the hex grid (08), `school_nearby` on segments
# (05b), and every school origin on the Access page (13). None of them errors;
# they just come out quietly too small. OSM knows about schools KSJ does not,
# and it is already in the .osm.pbf the road network and the boundary come
# from, so the fix costs no new dependency and no network call.
#
# Ward-scoped, and runs inside run_ward.R right after 03. The OSM read needs a
# boundary to clip to, which only a ward has - and 09b's own dedupe catches the
# one thing that scope leaves open, a campus straddling a ward line and being
# clipped into both extracts (both pieces keep the same OSM id, so they collapse
# to one row there).
#
# The output schema is source-independent - school_id, name, address,
# school_class, source - so nothing after this point knows or cares which
# source a school came from. See R/fetch_schools.R.

source("R/utils_config.R")
source("R/fetch_schools.R")

library(sf)

cfg <- load_study_area()
boundary <- study_area_bbox_sf(cfg)

ksj_path <- sprintf("output/%s_schools_ksj.gpkg", cfg$name)
if (!file.exists(ksj_path)) {
  stop("no ", ksj_path, "\n  Run scripts/03_download_ksj.R first.")
}

ksj <- ksj_schools(sf::st_read(ksj_path, quiet = TRUE))

# A KSJ 学校分類コード this file has never seen would otherwise arrive as a
# school with no level, which the Access page would then filter out without
# saying so. Loud instead - the code just needs adding to
# KSJ_SCHOOL_CLASSES.
unknown <- unique(ksj$school_id[is.na(ksj$school_class)])
if (length(unknown) > 0) {
  stop(length(unknown), " KSJ school(s) have a 学校分類コード not in ",
       "KSJ_SCHOOL_CLASSES (R/fetch_schools.R):\n  ",
       paste(utils::head(unknown, 10), collapse = ", "))
}

osm <- get_osm_schools(pbf_path = cfg$pbf_path, boundary = boundary)
osm <- dedupe_schools(osm)   # the node and the campus polygon are one school

schools <- merge_schools(ksj, osm)

message("By level:")
for (level in sort(unique(schools$school_class))) {
  in_level <- schools$school_class == level
  message(sprintf("  %-13s %3d  (KSJ %d, OSM %d)", level, sum(in_level),
                  sum(in_level & schools$source == "ksj"),
                  sum(in_level & schools$source == "osm")))
}

sf::st_write(schools, sprintf("output/%s_schools.gpkg", cfg$name),
             delete_dsn = TRUE, quiet = TRUE)

message(sprintf("Wrote output/%s_schools.gpkg (%d schools)", cfg$name, nrow(schools)))
