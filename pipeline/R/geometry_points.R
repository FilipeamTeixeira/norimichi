# geometry_points.R
# Reducing a feature to the one point that should carry its marker.
#
# WHY THIS IS NOT JUST st_point_on_surface()
#
# Three places needed a point per feature - the amenities export, the OSM
# school read, and the Access origins - and all three called
# `st_point_on_surface()` on lon/lat geometry. That is wrong twice over, and
# the run said so three times per export:
#
#   st_point_on_surface may not give correct results for longitude/latitude data
#
# 1. **It is planar maths on degrees.** sf warns because the algorithm treats
#    a degree of longitude and a degree of latitude as the same unit. At this
#    latitude they differ by about 20%, so the point it picks is skewed east-
#    west relative to the shape it is picking from.
#
# 2. **"On the surface" is not "in the middle".** The guarantee is only that
#    the point lies inside the polygon; it is found on a scanline, so on a
#    school campus - an L around a sports field, say - it can sit hard against
#    an edge. The visible symptom is a pin on the building next door.
#
# So: project first, then take the **centroid** of an area, which is its
# centre of mass and the thing a reader expects a marker to sit on. Fall back
# to a point on the surface only where the centroid falls outside its own
# polygon, which is the case the centroid genuinely cannot handle.
#
# Lines keep `st_point_on_surface()` on purpose. A station is several platform
# centrelines, and a point *on a platform* is more useful than the centre of
# mass of the set, which for a curved or split station is beside the tracks.

library(sf)

#' Japan Plane Rectangular zone IX - the same value used everywhere else in
#' this pipeline that needs metres.
POINT_METRIC_CRS <- 6677

#' One representative point per feature, in the input's CRS.
#'
#' @param geometry sf/sfc of any geometry type, WGS84
#' @return sfc POINT, same length and order, same CRS as the input
representative_point <- function(geometry) {
  g <- sf::st_geometry(geometry)
  if (length(g) == 0) return(g)

  crs_in <- sf::st_crs(g)
  projected <- sf::st_transform(g, POINT_METRIC_CRS)

  # Projected, so neither call warns and both are computed in metres.
  points <- sf::st_point_on_surface(projected)

  areal <- grepl("POLYGON", as.character(sf::st_geometry_type(projected)))
  if (any(areal)) {
    idx <- which(areal)
    centres <- sf::st_centroid(projected[idx])

    # Elementwise "is this centroid in its own polygon", not an all-pairs
    # test: st_intersects returns the indices each centroid hits, and the
    # only one that matters is its own.
    hits <- sf::st_intersects(centres, projected[idx])
    inside <- mapply(function(h, i) i %in% h, hits, seq_along(hits))

    points[idx[inside]] <- centres[inside]
  }

  sf::st_transform(points, crs_in)
}
