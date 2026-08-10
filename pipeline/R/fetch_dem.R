# fetch_dem.R
# Elevation via GSI's standard DEM tile service, used to compute a slope
# ("flat terrain") layer per hex.
#
# GSI publishes DEM as individual XYZ tiles of elevation values (plain
# text, not images):
#   https://cyberjapandata.gsi.go.jp/xyz/dem5a/{z}/{x}/{y}.txt   (5m mesh, most populated areas)
#   https://cyberjapandata.gsi.go.jp/xyz/dem10b/{z}/{x}/{y}.txt  (10m mesh, fallback where 5a is missing)
#
# CAUTION: this is the one script in the pipeline most worth testing
# manually on a single tile before running at scale. The text format
# (comma-separated rows, "e" for no-data) is documented at
# https://maps.gsi.go.jp/development/demtile.html - double-check the
# parsing below against that page for your R/environment setup, since a
# parsing mistake here fails silently (wrong numbers) rather than
# throwing an error.
#
# Needs the terra package: install.packages("terra")

library(terra)

#' Convert lon/lat to the standard Web Mercator tile x/y at a given zoom.
lonlat_to_tile <- function(lon, lat, zoom) {
  n <- 2^zoom
  xtile <- floor((lon + 180) / 360 * n)
  lat_rad <- lat * pi / 180
  ytile <- floor((1 - log(tan(lat_rad) + 1 / cos(lat_rad)) / pi) / 2 * n)
  list(x = xtile, y = ytile, z = zoom)
}

GSI_TILE_SIZE <- 256L   # standard pixel dimension of a GSI/Web Mercator tile

#' Force a parsed elevation matrix to the standard 256x256 tile size,
#' padding with NA or truncating as needed.
#'
#' Real tile text occasionally parses to a row/column count that's off by
#' one - e.g. a trailing comma producing an extra empty field, or a
#' truncated last row. Left uncorrected, that tile's computed resolution
#' (extent width / actual column count) ends up very slightly different
#' from its neighbors, which is enough to make terra::mosaic() fail with
#' "resolution does not match" even though the tiles' geographic extents
#' line up correctly. Confirmed this reproduces and this fixes it against
#' a synthetic 255-vs-256-column pair.
normalize_tile_dims <- function(mat, size = GSI_TILE_SIZE) {
  if (nrow(mat) != size) {
    fixed <- matrix(NA_real_, nrow = size, ncol = ncol(mat))
    keep <- seq_len(min(nrow(mat), size))
    fixed[keep, ] <- mat[keep, ]
    mat <- fixed
  }
  if (ncol(mat) != size) {
    fixed <- matrix(NA_real_, nrow = nrow(mat), ncol = size)
    keep <- seq_len(min(ncol(mat), size))
    fixed[, keep] <- mat[, keep]
    mat <- fixed
  }
  mat
}

#' Standard Web Mercator (EPSG:3857) tile extent in meters for a given
#' x/y/z. All tiles at a given zoom are exactly the same size in meters -
#' that uniformity is what makes them safe to mosaic directly.
#'
#' An earlier version of this function built each tile's extent straight
#' in lat/lon degrees instead. That looks reasonable for a single tile,
#' but Web Mercator compresses latitude non-linearly, so adjacent tiles
#' end up with very slightly different degree-heights - enough to make
#' terra::mosaic() fail with "resolution does not match" even after every
#' tile was normalized to an identical pixel grid. Building tiles in their
#' native projection and reprojecting only once, after mosaicking (see
#' fetch_dem_for_bbox()), avoids that entirely. Confirmed against two
#' adjacent tiles that previously failed to mosaic.
webmercator_tile_extent <- function(x, y, z) {
  earth_circumference <- 2 * pi * 6378137   # meters, Web Mercator sphere radius
  tile_size_m <- earth_circumference / 2^z
  origin_shift <- earth_circumference / 2

  xmin <- x * tile_size_m - origin_shift
  xmax <- (x + 1) * tile_size_m - origin_shift
  ymax <- origin_shift - y * tile_size_m
  ymin <- origin_shift - (y + 1) * tile_size_m

  terra::ext(xmin, xmax, ymin, ymax)
}

#' Download and parse one GSI DEM tile into a terra SpatRaster, in its
#' native Web Mercator (EPSG:3857) projection.
#' @param x,y,z tile coordinates (see lonlat_to_tile())
#' @param dataset "dem5a" (5m, laser survey, most of Japan) or "dem10b" (10m)
fetch_dem_tile <- function(x, y, z, dataset = "dem5a") {
  url <- sprintf("https://cyberjapandata.gsi.go.jp/xyz/%s/%d/%d/%d.txt", dataset, z, x, y)
  raw <- readLines(url, warn = FALSE)

  # Each line is one row of comma-separated elevation values in meters;
  # "e" marks no-data cells.
  rows <- lapply(strsplit(raw, ","), function(row) {
    row[row == "e"] <- NA
    as.numeric(row)
  })
  mat <- do.call(rbind, rows)
  mat <- normalize_tile_dims(mat)

  terra::rast(
    mat,
    extent = webmercator_tile_extent(x, y, z),
    crs = "EPSG:3857"
  )
}

#' Fetch and mosaic all DEM tiles covering a bounding box, returning the
#' result reprojected to WGS84 (EPSG:4326) to match the rest of the
#' pipeline.
#' @param bbox named numeric vector/list with xmin, ymin, xmax, ymax (WGS84)
#' @param zoom GSI tile zoom level - 14 is the native resolution for dem5a
#' @param dataset "dem5a" or "dem10b" - falls back to 10b tiles that fail
#'   to download under 5a, since 5a coverage has gaps outside cities
fetch_dem_for_bbox <- function(bbox, zoom = 14, dataset = "dem5a") {
  tl <- lonlat_to_tile(bbox["xmin"], bbox["ymax"], zoom)
  br <- lonlat_to_tile(bbox["xmax"], bbox["ymin"], zoom)

  tiles <- list()
  for (tx in tl$x:br$x) {
    for (ty in tl$y:br$y) {
      tile <- tryCatch(fetch_dem_tile(tx, ty, zoom, dataset), error = function(e) NULL)
      if (is.null(tile) && dataset == "dem5a") {
        tile <- tryCatch(fetch_dem_tile(tx, ty, zoom, "dem10b"), error = function(e) NULL)
      }
      if (!is.null(tile)) tiles[[length(tiles) + 1]] <- tile
    }
  }
  if (length(tiles) == 0) stop("No DEM tiles found for this bbox at zoom ", zoom)

  mosaicked <- do.call(terra::mosaic, tiles)
  terra::project(mosaicked, "EPSG:4326")
}

#' Compute slope (degrees) from a DEM raster - used as the "flat terrain"
#' input to the demand score.
compute_slope <- function(dem_raster) {
  terra::terrain(dem_raster, v = "slope", unit = "degrees")
}
