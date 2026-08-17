# fetch_ksj.R
# KSJ (国土数値情報) ships as shapefiles per theme (schools, railway
# stations, land use, admin boundaries), downloaded manually from
# https://nlftp.mlit.go.jp/ksj/ - this file just standardizes reading and
# reprojecting them, and clipping to the study area.
#
# Note: KSJ organizes datasets by theme code (schools and stations are
# separate themes from land use, etc.) and the codes occasionally change -
# check the current theme code for what you need on the KSJ site itself
# rather than relying on a hardcoded value here.

library(sf)
library(dplyr)

#' Read a KSJ shapefile and reproject to WGS84.
#' @param path path to the .shp file
read_ksj <- function(path) {
  sf::st_read(path, quiet = TRUE) |>
    sf::st_transform(4326)
}

#' Find the P29 (schools) shapefile for one prefecture.
#'
#' P29 ships one file per prefecture, named `P29-<year>_<prefecture>.shp` -
#' and the year is per **file**, not per release: Kanagawa is on disk as
#' P29-21_14 and Tokyo's older edition as P29-13_13. So the year is globbed
#' for rather than assumed, and the newest present wins.
#'
#' @param dir directory holding the unzipped P29 shapefiles
#' @param prefecture_code JIS prefecture code, e.g. 13 for 東京都
ksj_p29_path <- function(dir, prefecture_code) {
  pref <- sprintf("%02d", as.integer(prefecture_code))
  found <- Sys.glob(file.path(dir, sprintf("P29-*_%s.shp", pref)))
  if (length(found) == 0) {
    stop("no P29-*_", pref, ".shp in ", dir, "\n",
         "  That is the KSJ school file for prefecture ", pref, ".\n",
         "  Download it from https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P29.html",
         " and unzip it into ", dir, "/.")
  }
  # "P29-21_14.shp" -> "21". Newest year first, so a prefecture with two
  # editions on disk uses the current one.
  year <- sub("^P29-(.*)_[0-9]+\\.shp$", "\\1", basename(found))
  found[order(year, decreasing = TRUE)][1]
}

#' Stop unless a P29 file uses the column layout `ksj_schools()` reads.
#'
#' The 2013 edition is **shifted by one** against the 2021 one, and the shift
#' is silent rather than fatal - P29_004 is the 学校分類コード there and the
#' name is in P29_005, so reading it the 2021 way gives every school the name
#' "16001" and, since 2013's P29_002 is a constant 施設分類 rather than a
#' 学校コード, the same `school_id` as well. Both survive the merge and the
#' write; the first sign of trouble would be a map of identically-named pins.
#'
#' Detected on P29_004: in the layout we read it is the school's name, and a
#' name is never a bare five-digit code.
#'
#' @param schools sf POINT as returned by read_ksj()
#' @param path the file it came from, for the message
check_ksj_p29_schema <- function(schools, path) {
  name <- as.character(schools$P29_004)
  if (length(name) == 0 || !all(grepl("^[0-9]{5}$", name))) return(invisible(schools))

  stop(basename(path), " is an older P29 edition with a different column layout.\n",
       "  Its P29_004 holds the 学校分類コード, not the school name - the name is\n",
       "  in P29_005 and the address in P29_006, one column further along than\n",
       "  the 2021 edition this pipeline reads. It also carries no 学校コード, so\n",
       "  every school would share one school_id.\n",
       "  Download the current edition for this prefecture from\n",
       "  https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P29.html - it is the\n",
       "  same vintage as the Kanagawa file already in raw/ksj/, which matters\n",
       "  beyond the schema: schools open and close, and two regions scored off\n",
       "  editions a decade apart are not comparable.")
}

#' Filter a KSJ point dataset (schools, stations, etc.) to features that
#' fall within a study area boundary.
#' @param points_sf sf POINT object, e.g. from read_ksj()
#' @param boundary sf/sfc polygon (WGS84)
filter_points_in_area <- function(points_sf, boundary) {
  points_sf[sf::st_intersects(points_sf, boundary, sparse = FALSE)[, 1], ]
}
