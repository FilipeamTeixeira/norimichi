# fetch_estat.R
# Wrapper around the e-Stat API for two datasets that both come through
# the same endpoint:
#   1. Population mesh data (地域メッシュ統計)
#   2. Road traffic census (全国道路・街路交通情勢調査) - confirmed to also
#      be published via e-Stat, so no separate integration is needed for it
#
# You need a free appId: register at https://www.e-stat.go.jp/api/
# Needs the estatapi package: install.packages("estatapi")
#
# IMPORTANT: this file deliberately does NOT hardcode a statsDataId for
# either dataset. Table IDs are specific and change over time - run
# find_estat_table() once, interactively, to find the current one for your
# target table, then put it in your script (see 02_download_estat.R).
# Don't guess an ID; a wrong one fails loudly, which is fine, but a
# stale-but-plausible one can silently return the wrong table.

library(estatapi)
library(dplyr)

#' Search e-Stat for candidate tables. Run this once, interactively, in
#' the R console - it's not meant to run inside the automated pipeline.
#'
#' @param app_id your e-Stat appId
#' @param keyword Japanese search term, e.g. "地域メッシュ" or "道路交通センサス"
#' @return a tibble of matching tables - look at STAT_NAME/TITLE and grab
#'   the `@id` column value as your statsDataId
find_estat_table <- function(app_id, keyword) {
  estatapi::estat_getStatsList(appId = app_id, searchWord = keyword)
}

#' Pull a stats table for a given set of area codes (mesh codes or
#' municipality codes - whatever the table uses; check via
#' estat_getMetaInfo() if unsure).
#'
#' @param app_id your e-Stat appId
#' @param stats_data_id the specific table ID, found via find_estat_table()
#' @param area_codes character vector of area/mesh codes to restrict to.
#'   Leave NULL to fetch the whole table (slow for national tables - avoid
#'   this for the traffic census, which covers all of Japan).
#' @return a tibble, one row per record; a `value` column plus whatever
#'   category/area/time columns the table defines
fetch_estat_table <- function(app_id, stats_data_id, area_codes = NULL) {
  args <- list(appId = app_id, statsDataId = stats_data_id)
  if (!is.null(area_codes)) args$cdArea <- area_codes

  do.call(estatapi::estat_getStatsData, args)
}
