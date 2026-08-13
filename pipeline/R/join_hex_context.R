# join_hex_context.R
# Attaches the enclosing hex's neighbourhood figures to each segment.
#
# WHAT THESE FIELDS ARE, AND WHAT THEY ARE NOT
# Every column this adds is prefixed `context_hex_` on purpose. They are
# properties of the ~0.1km2 cell the segment sits in, not of the segment:
#
#   - `gap_score` is a hex-level missed-opportunity score computed from hex
#     population and hex infrastructure quality (score_gap.R).
#   - the `roi_*` fields are derived from hex population and an illustrative
#     20% mode-shift scenario (score_roi.R), for the *whole cell*.
#
# So a segment inheriting `context_hex_daily_savings_yen = 12000` does NOT
# mean fixing that segment saves ¥12,000/day. It means the segment sits in a
# cell where a full mode shift across every street in it is modelled to be
# worth that much. Attributing a cell's ROI to one of the dozen streets
# crossing it would be double-counting on a scale that makes the number
# worse than useless - eleven other segments in the same cell would each
# claim the same ¥12,000.
#
# They are joined anyway because "is this a street in a high-demand,
# under-served neighbourhood?" is a real and useful sorting question for an
# investment table, and it is exactly what `gap_score` answers. The naming
# and the UI labelling are what keep that an honest use of them.

library(sf)
library(dplyr)

# Japan Plane Rectangular zone IX - same value as 05_build_segment_table.R,
# 08_join_poi.R and score_network.R. Keep in sync.
METRIC_CRS <- 6677

#' Hex fields carried across to segments, and the names they land under.
#'
#' The three savings components are summed into one column rather than
#' carried separately: they share the same illustrative mode-shift
#' assumption, so a reader who sees them split is invited to treat the split
#' as more precise than it is. The components stay available per-hex in
#' hexagons.geojson for anyone who wants them.
HEX_CONTEXT_FIELDS <- c(
  context_hex_gap_score    = "gap_score",
  context_hex_demand_score = "demand_score",
  context_hex_population   = "population"
)

#' Join the enclosing hex's context figures onto each segment.
#'
#' Match rule: the segment's centroid is tested for containment in a hex,
#' with a nearest-hex fallback. The fallback is not a rare edge case here -
#' drop_empty_hexes() removes cells with neither roads nor residents, and
#' the H3 grid is clipped to the study boundary, so a coastal or
#' boundary-straddling segment can genuinely have its centroid outside every
#' surviving hex. Falling back to the nearest cell is better than an NA that
#' would silently drop the segment out of any sorted-by-context view.
#'
#' `st_point_on_surface` rather than `st_centroid`: a C-shaped or
#' boundary-hugging way can have its true centroid off the line entirely,
#' and in a coastal ward that can land it in the bay.
#'
#' @param segments sf LINESTRING/MULTILINESTRING object
#' @param hexes sf POLYGON object carrying the HEX_CONTEXT_FIELDS source
#'   columns plus the roi_* savings components
#' @return `segments` with the context_hex_* columns added
join_hex_context <- function(segments, hexes) {
  missing <- setdiff(
    c(unname(HEX_CONTEXT_FIELDS), "roi_congestion_savings_yen_day",
      "roi_operating_savings_yen_day", "roi_health_benefit_yen_day"),
    names(hexes)
  )
  if (length(missing) > 0) {
    stop("hex layer is missing columns needed for segment context: ",
         paste(missing, collapse = ", "))
  }

  segments_m <- sf::st_transform(segments, METRIC_CRS)
  hexes_m    <- sf::st_transform(hexes, METRIC_CRS)

  pts <- suppressWarnings(sf::st_point_on_surface(sf::st_geometry(segments_m)))

  hex_idx <- as.integer(sf::st_within(pts, hexes_m, sparse = FALSE) |>
    apply(1, function(row) if (any(row)) which(row)[1] else NA_integer_))

  outside <- which(is.na(hex_idx))
  if (length(outside) > 0) {
    hex_idx[outside] <- sf::st_nearest_feature(pts[outside], hexes_m)
  }
  message(sprintf(
    "Hex context: %d of %d segment centroids inside a hex, %d matched to nearest",
    sum(!is.na(hex_idx)) - length(outside), nrow(segments), length(outside)
  ))

  hex_attrs <- sf::st_drop_geometry(hexes_m)

  for (target in names(HEX_CONTEXT_FIELDS)) {
    segments[[target]] <- hex_attrs[[HEX_CONTEXT_FIELDS[[target]]]][hex_idx]
  }

  # The cell's modelled daily benefit under score_roi.R's illustrative 20%
  # mode-shift scenario. See the header note: this is the cell's figure, not
  # the segment's share of it.
  segments$context_hex_daily_savings_yen <- round(
    dplyr::coalesce(hex_attrs$roi_congestion_savings_yen_day[hex_idx], 0) +
    dplyr::coalesce(hex_attrs$roi_operating_savings_yen_day[hex_idx], 0) +
    dplyr::coalesce(hex_attrs$roi_health_benefit_yen_day[hex_idx], 0)
  )

  segments
}
