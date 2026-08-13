# run_pipeline.R - split into run_ward.R and run_region.R.
#
# One linear pass could not do both halves of the job. It ran the per-ward
# downloads, then the relative scoring at ward scope, then 09b (which exists
# to throw that scoring away and redo it over the merge), then exported -
# still under whichever single ward `name:` happened to point at. So the
# merged region was written to output/ and immediately ignored, with no error
# anywhere. That is how Naka-ku and Isogo-ku were both "exported" and neither
# reached the map.
#
# The split follows the boundary 09b's header describes:
#
#   Rscript run_ward.R Naka-ku      once per ward: 01..04, 05, 05b, 06..09
#   Rscript run_ward.R Isogo-ku
#   Rscript run_region.R            09b, then 05c -> 12, then copy to the app
#
# run_region.R is a full re-run every time a ward is added, since the scores
# it produces are relative to the set of wards in the merge.

stop("run_pipeline.R has been split - use run_ward.R then run_region.R ",
     "(see the comment at the top of this file)", call. = FALSE)
