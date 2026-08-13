# build_corridors.R
# Groups recommended segments into corridors - the actionable unit for the
# Investment Ranking table.
#
# TWO FUNCTIONS, TWO PIPELINE STAGES. `assign_corridor_ids()` is segment-level
# enrichment and runs in 05d_score_interventions.R, which persists the id to
# the segment table so segments.geojson and the ranking agree on membership by
# construction rather than by both recomputing it. `aggregate_corridors()`
# rolls those groups up and runs in 12_compute_investment_ranking.R.
#
# WHY NOT ONE ROW PER SEGMENT
# `segments.geojson` holds whole OSM ways, and an OSM way is a mapping
# artefact, not a project. In this study area the median recommended way is
# 119m long, 57% of them carry no `name` at all, and one street
# (横浜市道82号山下本牧磯子線) is 6.6km spread across dozens of separate
# rows. A table of raw ways therefore ranks fragments of the same few
# streets against each other, with more than half the rows labelled blank -
# which is the opposite of the design's stated unit, "a specific street, a
# specific recommendation, specific beneficiaries". 704 recommended ways
# collapse to roughly a hundred-odd corridors, and a corridor is a thing
# somebody can actually fund.
#
# GROUPING RULE
# Connected components of the segment adjacency graph, restricted to edges
# where both segments share the same `recommendation` *and* the same `name`.
# Three consequences worth understanding:
#
#   - Contiguity is required, so a street name reused in two disconnected
#     parts of the ward yields two corridors, not one 6km phantom.
#   - Unnamed segments group with their unnamed neighbours (NA matches NA
#     along an edge), so they still form nameable-by-location corridors
#     instead of 400 orphan rows.
#   - A named street whose middle stretch already has a cycle lane splits
#     into two corridors, because the middle stretch has no recommendation
#     and so is not in the graph. That is correct: they are two separate
#     projects with a finished one between them.

library(sf)
library(dplyr)
library(igraph)

source("R/score_network.R")  # build_segment_adjacency(), METRIC_CRS

#' Assign each recommended segment a corridor id.
#'
#' @param segments sf object, the full segment table with `recommendation`
#'   and `name`
#' @return integer vector over all rows of `segments`; NA where the segment
#'   has no recommendation and so belongs to no corridor
assign_corridor_ids <- function(segments) {
  corridor_id <- rep(NA_integer_, nrow(segments))

  rec_rows <- which(!is.na(segments$recommendation))
  if (length(rec_rows) == 0) return(corridor_id)

  sub <- segments[rec_rows, ]
  g <- build_segment_adjacency(sub)

  edges <- igraph::as_edgelist(g)
  if (nrow(edges) > 0) {
    rec_a <- sub$recommendation[edges[, 1]]
    rec_b <- sub$recommendation[edges[, 2]]
    nm_a  <- sub$name[edges[, 1]]
    nm_b  <- sub$name[edges[, 2]]

    same_rec  <- rec_a == rec_b
    # NA name matches NA name: two adjacent unnamed stretches with the same
    # recommendation are one project. A named segment never merges with an
    # unnamed one.
    same_name <- (is.na(nm_a) & is.na(nm_b)) |
      (!is.na(nm_a) & !is.na(nm_b) & nm_a == nm_b)

    keep <- which(same_rec & same_name)
    g <- igraph::subgraph_from_edges(g, keep, delete.vertices = FALSE)
  } else {
    g <- igraph::delete_edges(g, igraph::E(g))
  }

  corridor_id[rec_rows] <- igraph::components(g)$membership
  corridor_id
}

#' Length-weighted mean, NA-safe. Used rather than a plain mean because a
#' corridor's members differ in length by more than an order of magnitude,
#' so an unweighted mean lets a 2m stub count as much as a 1.4km arterial.
weighted_mean_by_length <- function(x, length_m) {
  ok <- !is.na(x) & !is.na(length_m)
  if (!any(ok)) return(NA_real_)
  sum(x[ok] * length_m[ok]) / sum(length_m[ok])
}

#' The dearest tier among a corridor's members.
#'
#' Max rather than mean or mode: a corridor is only deliverable at the cost
#' of its most expensive stretch. A 2km calming scheme with one 6-lane
#' crossing in the middle is not a cheap project.
max_cost_tier <- function(tiers) {
  present <- tiers[!is.na(tiers)]
  if (length(present) == 0) return(NA_character_)
  COST_TIERS[max(match(present, COST_TIERS))]
}

#' Population within `buffer_m` of the whole corridor.
#'
#' Recomputed from a single buffer around the merged geometry rather than
#' summed across the members' own `estimated_beneficiaries`. Summing would
#' badly over-count: consecutive segments' 500m buffers overlap almost
#' completely, so a 20-segment corridor would claim its neighbourhood's
#' population roughly twenty times over.
#'
#' @param corridor_geoms sfc, one merged geometry per corridor, in METRIC_CRS
#' @param hexes_m sf POLYGON in METRIC_CRS with a `population` column
#' @param buffer_m buffer distance, matching BENEFICIARY_BUFFER_M in 11_export.R
corridor_beneficiaries <- function(corridor_geoms, hexes_m, buffer_m) {
  buffers <- sf::st_buffer(corridor_geoms, buffer_m)
  hits <- sf::st_intersects(buffers, hexes_m)
  vapply(hits, function(idx) {
    if (length(idx) == 0) return(0L)
    as.integer(round(sum(hexes_m$population[idx], na.rm = TRUE)))
  }, integer(1))
}

#' Nearest station name for each corridor, as a locality label.
#'
#' 193 of this study area's 372 corridors have no OSM `name` at all, and
#' they are not the unimportant ones - the corridor with the most residents
#' within 500m is unnamed. A table whose top row reads "(unnamed tertiary)"
#' fails the design's own unit test ("a specific street"), so an unnamed
#' corridor is labelled by where it is instead: "Unnamed tertiary near
#' 山手駅". That also matches the mockup's two-line panel header, which pairs
#' a street with an area rather than showing a street alone.
#'
#' @param corridor_geoms sfc in METRIC_CRS
#' @param stations sf object, KSJ N02 railway data (N02_005 = station name)
#' @return character vector of station names, NA if there are no stations
nearest_station_name <- function(corridor_geoms, stations) {
  if (is.null(stations) || nrow(stations) == 0) {
    return(rep(NA_character_, length(corridor_geoms)))
  }
  stations_m <- sf::st_transform(stations, METRIC_CRS)
  idx <- sf::st_nearest_feature(corridor_geoms, stations_m)
  as.character(stations_m$N02_005)[idx]
}

#' Aggregate corridor members into one row per fundable project.
#'
#' Expects `corridor_id` to already be on the table (assigned upstream by
#' assign_corridor_ids() in 05d) rather than recomputing it, so the ranking
#' cannot disagree with segments.geojson about which corridor a segment is in.
#'
#' @param segments sf object carrying `corridor_id`, `recommendation`, `name`,
#'   `length_m`, `suitability_score`, `suitability_after`, `benefit_kind`,
#'   `intervention_lever`, `cost_tier`, `lts`, `highway`, `way_id`, `osm_id`,
#'   `network_criticality_score`, `bridges_islands`, `islands_adjacent`,
#'   `traffic_signals_count`, `likely_informal_parking`, `sidewalk_available`,
#'   and the `context_hex_*` columns
#' @param hexes sf POLYGON object with `population`
#' @param buffer_m beneficiary buffer, matching BENEFICIARY_BUFFER_M in 05d
#' @param stations sf object for the locality label, or NULL
#' @return sf object, one MULTILINESTRING row per corridor
aggregate_corridors <- function(segments, hexes, buffer_m = 500, stations = NULL) {
  if (!"corridor_id" %in% names(segments)) {
    stop("segments has no corridor_id column - run 05d_score_interventions.R first")
  }

  members <- segments[!is.na(segments$corridor_id), ]
  if (nrow(members) == 0) {
    stop("no segments carry a recommendation - nothing to build corridors from")
  }

  members_m <- sf::st_transform(members, METRIC_CRS)
  hexes_m   <- sf::st_transform(hexes, METRIC_CRS)

  ids <- sort(unique(members$corridor_id))
  rows <- split(seq_len(nrow(members)), members$corridor_id)[as.character(ids)]

  geoms <- do.call(c, lapply(rows, function(r) {
    sf::st_combine(sf::st_geometry(members_m)[r])
  }))

  beneficiaries <- corridor_beneficiaries(geoms, hexes_m, buffer_m)
  near_station  <- nearest_station_name(geoms, stations)

  attrs <- sf::st_drop_geometry(members)

  build_row <- function(r, i) {
    a <- attrs[r, ]
    len <- a$length_m
    kind <- a$benefit_kind[1]

    # Dominant highway class by length - what the corridor mostly is, which
    # is the honest single label for a mixed-class street.
    hw <- tapply(len, a$highway, sum)
    dominant_highway <- if (length(hw) == 0) NA_character_ else
      names(hw)[which.max(hw)]

    data.frame(
      corridor_id     = ids[i],
      name            = a$name[1],
      # Locality label, always present - the only label 193 of these
      # corridors have. See nearest_station_name().
      nearest_station = near_station[i],
      recommendation  = a$recommendation[1],
      benefit_kind    = kind,
      intervention_lever = a$intervention_lever[1],
      cost_tier       = max_cost_tier(a$cost_tier),
      highway         = dominant_highway,
      segment_count   = nrow(a),
      length_m        = sum(len, na.rm = TRUE),
      # Internal row identities, for the frontend to pull the corridor's
      # member segments out of segments.geojson on drill-down.
      way_ids         = paste(a$way_id, collapse = ","),
      # Real OSM way ids, so a row in the ranking table can be checked
      # against openstreetmap.org/way/<id> by someone who doubts it.
      osm_ids         = paste(a$osm_id, collapse = ","),

      lts_before          = weighted_mean_by_length(a$lts, len),
      suitability_before  = weighted_mean_by_length(a$suitability_score, len),
      # NA for any corridor whose intervention the stress score does not
      # model, so the table cannot print a before/after it did not compute.
      suitability_after   = if (identical(kind, "lts_recalc"))
        weighted_mean_by_length(a$suitability_after, len) else NA_real_,

      estimated_beneficiaries = beneficiaries[i],

      # Why the corridor is worth doing, beyond the score change.
      network_criticality_score = suppressWarnings(max(a$network_criticality_score, na.rm = TRUE)),
      bridges_islands           = any(a$bridges_islands, na.rm = TRUE),
      islands_adjacent          = suppressWarnings(max(a$islands_adjacent, na.rm = TRUE)),

      # Benefit statements for the interventions the stress score cannot
      # model - see score_intervention.R. A crossing improvement is sized by
      # the signalised junctions it treats; kerbside pressure is what a
      # parking intervention addresses.
      signalised_junctions      = sum(a$traffic_signals_count, na.rm = TRUE),
      informal_parking_length_m = sum(len[dplyr::coalesce(a$likely_informal_parking, FALSE)], na.rm = TRUE),
      no_sidewalk_length_m      = sum(len[!dplyr::coalesce(a$sidewalk_available, FALSE)], na.rm = TRUE),

      # Neighbourhood context, not corridor-attributable. Length-weighted
      # means, never sums - see join_hex_context.R's header. Summing a
      # per-hex ROI along a corridor would count the same cell's benefit
      # once per segment crossing it.
      context_hex_gap_score = weighted_mean_by_length(a$context_hex_gap_score, len),
      # Rounded: the weighted mean of whole-yen per-hex figures is fractional,
      # and three decimal places on an order-of-magnitude estimate reads as
      # precision that is not there.
      context_hex_daily_savings_yen = round(
        weighted_mean_by_length(a$context_hex_daily_savings_yen, len)
      ),

      stringsAsFactors = FALSE
    )
  }

  out <- do.call(rbind, Map(build_row, rows, seq_along(rows)))

  # max() over an all-NA vector warns and returns -Inf; normalise those back.
  out$network_criticality_score[!is.finite(out$network_criticality_score)] <- NA_real_
  out$islands_adjacent[!is.finite(out$islands_adjacent)] <- NA_real_

  corridors <- sf::st_sf(out, geometry = geoms, crs = sf::st_crs(members_m))
  corridors <- sf::st_transform(corridors, sf::st_crs(segments))

  # Lon/lat extent, so the ranking table can fly the map to a whole corridor
  # without the page having to derive it from geometry itself. Four plain
  # columns here; nested into a [w,s,e,n] array by export_investment_ranking().
  bb <- vapply(sf::st_geometry(corridors),
               function(g) as.numeric(sf::st_bbox(g)), numeric(4))
  corridors$bbox_w <- bb[1, ]
  corridors$bbox_s <- bb[2, ]
  corridors$bbox_e <- bb[3, ]
  corridors$bbox_n <- bb[4, ]

  message(sprintf(
    "Corridors: %d from %d recommended segments (%.1f km total)",
    nrow(corridors), nrow(members), sum(corridors$length_m) / 1000
  ))
  message(sprintf("  named: %d, unnamed: %d",
                  sum(!is.na(corridors$name)), sum(is.na(corridors$name))))
  message("  by intervention type:")
  print(table(corridors$recommendation))

  corridors
}
