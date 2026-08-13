# build_corridors.R
# Groups recommended segments into corridors - the actionable unit for the
# Investment Ranking table.
#
# TWO PIPELINE STAGES. `assign_corridor_ids()` and
# `corridor_classification_inputs()` are segment-level enrichment and run in
# 05d_score_interventions.R, which persists the id and the resulting label to
# the segment table so segments.geojson and the ranking agree on both by
# construction rather than by each recomputing them. `aggregate_corridors()`
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
# Connected components of a *continuity* graph over the segments worth
# spending money on. Two segments are joined when all three hold:
#
#   1. Both are recommendable at all - no cycle infrastructure already and
#      LTS 3+ (is_recommendable() in score_intervention.R). A stretch that
#      already has a lane therefore still splits a street in two, which is
#      correct: those are two schemes with a finished one between them.
#   2. Their street names do not *conflict*. Only two different real street
#      names block an edge; a named stretch may absorb the unnamed and
#      designation-labelled ones it runs straight into, and unnamed joins
#      unnamed as before. See is_street_name() for why a municipal route
#      number is not a street name, and the union loop for the lock that stops
#      X - unnamed - Y from laundering two streets into one corridor.
#   3. They meet *end to end* and the street carries on through the shared
#      node: deflection under CORRIDOR_MAX_DEFLECTION_DEG and, where three
#      or more ways meet there, they are each other's straightest
#      continuation.
#
# WHY NOT ALSO REQUIRE THE SAME `recommendation` - IT USED TO
# That was this file's original rule and it split streets down the middle.
# `recommendation` is decided from a way's own attributes, and two of the
# inputs behind it are absolute counts inside a buffer: `traffic_signals_count`
# (signals within 15m, 05_build_segment_table.R) and `nearby_poi_count` behind
# `likely_informal_parking` (score_lts.R). Both scale with how long the way
# happens to be, so the label flipped wherever OSM had cut the street. The
# case that surfaced it: way 26489352 (192m, 3 signals) typed "Crossing
# improvement" and way 1527703595 (47m, 1 signal) typed "Protected cycle
# lane", when the two are one 239m unnamed tertiary, identical in class, LTS,
# speed, lanes and sidewalk. On this study area 312 adjacent same-street pairs
# were split that way, 235 of them meeting end to end.
#
# So the order is inverted: group on what makes two stretches the same
# *street* (above), then classify the corridor once from its aggregate and
# write that label down onto its members - classify_corridor_recommendation()
# in score_intervention.R, called from 05d. A corridor cannot then contain two
# recommendations, and the label no longer depends on where a way was cut.
#
# The continuity test in (3) is what makes that safe. Adjacency in
# score_network.R is "shares any vertex", which is right for the network
# analysis (you can turn at a junction) but wrong for street identity:
# dropping `recommendation` from the key without it merged unnamed runs
# through crossings into a single 27.8km phantom corridor.

library(sf)
library(dplyr)
library(igraph)

source("R/score_network.R")  # METRIC_CRS, VERTEX_SNAP_M

# How far a street may bend at a shared node and still count as continuing
# into the next way, in degrees off straight-through. Japanese city streets
# kink at junctions, so this is deliberately loose - it is here to reject
# crossings and side alleys, not to enforce straightness. Anything tighter
# than ~45 starts cutting real corridors at dog-legs; anything looser than
# ~75 starts absorbing side streets.
CORRIDOR_MAX_DEFLECTION_DEG <- 60

# How far along a way its bearing at a terminal node is measured. A single
# vertex pair is often a 1-2m micro-jog in the OSM geometry, which points
# nowhere near the direction the street actually runs.
BEARING_SPAN_M <- 15

# Distance from a road within which a signal node belongs to it. Must match
# SIGNAL_BUFFER_M in scripts/05_build_segment_table.R, which computes the
# per-segment `traffic_signals_count`, or a corridor's junction count would
# not be comparable with its members'.
SIGNAL_NEAR_ROAD_M <- 15

# Distance within which two OSM signal nodes are the same junction. OSM tags
# signals per approach, so a crossroads is commonly 3-4 nodes a few metres
# apart: in this study area the median signal's nearest neighbour is 16m away
# while the 75th percentile is 60m, so a 30m threshold splits blobs from
# streets cleanly and turns 465 nodes into 294 junctions - the same ~1.6x
# over-count the old note on this field told readers to live with.
#
# Deliberately the same value and the same single-link clustering as
# SIGNAL_JUNCTION_CLUSTER_M in app/src/lib/scoring-constants.ts, which the
# route scorer already used to charge a rider 18s per junction. Keep the two in
# sync: they are answering one question - how often does a cyclist stop - on
# two different geometries, and a corridor claiming fewer stops than the route
# through it would be indefensible.
SIGNAL_JUNCTION_CLUSTER_M <- 30

# A `name` matching this is a route designation, not a street name: 国道133号,
# 神奈川県道xx号...線, 横浜市道82号山下本牧磯子線. It belongs in `ref`, and
# where OSM puts it in `name` instead it is not evidence of street identity -
# a municipal route number is administrative, and the road it designates
# usually has an ordinary name over part of its length and nothing over the
# rest. Treating it as a name split 山下公園通り from the stretch it runs dead
# straight into (1 degree of deflection) because that stretch was labelled
# 横浜市道82号山下本牧磯子線. One designation covers 18 segments here - the
# 6.6km street this file's header already cites as the reason corridors exist.
#
# Every quantifier here applies to a *group*, never to a bare multibyte
# character: is_street_name() matches in byte mode, where `第?` would quantify
# only the last byte of 第 and so require the first two of them always -
# silently matching nothing at all for the common 市道82号 form that omits it.
ROUTE_DESIGNATION_PATTERN <-
  "(国道|都道|道道|府道|県道|市道|町道|村道)[[:space:]]*(第)?[0-9]+号"

#' Whether a `name` value identifies a street, as opposed to being absent or a
#' route designation. See ROUTE_DESIGNATION_PATTERN.
#'
#' `useBytes` is required, not tidiness: `Rscript` here runs under LC_CTYPE=C,
#' where a UTF-8 regex cannot be translated to a wide string and grepl() errors
#' outright ("regular expression is invalid"). The pattern and the names read
#' back from the GeoPackage are both UTF-8 byte sequences, and the only
#' metacharacters in the pattern are ASCII, so matching bytes is exact here and
#' independent of whatever locale the pipeline is run in.
is_street_name <- function(name) {
  !is.na(name) & nzchar(trimws(name)) &
    !grepl(ROUTE_DESIGNATION_PATTERN, name, useBytes = TRUE)
}

#' Terminal vertices of each segment, with the bearing the way leaves them on.
#'
#' One row per (segment, end). Multi-part geometries - 25 of this study area's
#' 3188 segments - contribute both ends of every part, which is what a way
#' broken into pieces actually offers a neighbour to meet at.
#'
#' @param segments_m sf LINESTRING/MULTILINESTRING in METRIC_CRS
#' @return data.frame with `segment` (row index into `segments_m`), `x`, `y`,
#'   and `bearing` in degrees, pointing away from the terminal into the way
segment_terminals <- function(segments_m) {
  xy <- sf::st_coordinates(segments_m)

  # st_coordinates labels the originating feature L2 for MULTILINESTRING and
  # L1 for LINESTRING; for MULTILINESTRING, L1 is the part within the feature.
  has_parts <- "L2" %in% colnames(xy)
  feature <- if (has_parts) xy[, "L2"] else xy[, "L1"]
  part    <- if (has_parts) paste(xy[, "L2"], xy[, "L1"], sep = ":") else
    as.character(xy[, "L1"])

  ends <- lapply(split(seq_len(nrow(xy)), part), function(ii) {
    n <- length(ii)
    if (n < 2) return(NULL)
    pts <- xy[ii, c("X", "Y"), drop = FALSE]

    one_end <- function(walk) {
      anchor <- pts[walk[1], ]
      d <- sqrt((pts[walk, 1] - anchor[1])^2 + (pts[walk, 2] - anchor[2])^2)
      # First vertex at least BEARING_SPAN_M away; the far end if the whole
      # part is shorter than that.
      j <- which(d >= BEARING_SPAN_M)[1]
      if (is.na(j)) j <- length(walk)
      ref <- pts[walk[j], ]
      c(anchor[1], anchor[2],
        atan2(ref[2] - anchor[2], ref[1] - anchor[1]) * 180 / pi)
    }

    rbind(one_end(seq_len(n)), one_end(rev(seq_len(n))))
  })

  ends <- ends[!vapply(ends, is.null, logical(1))]
  m <- do.call(rbind, ends)
  seg <- rep(vapply(names(ends), function(k) {
    feature[match(k, part)]
  }, numeric(1)), each = 2)

  data.frame(segment = as.integer(seg), x = m[, 1], y = m[, 2],
             bearing = m[, 3])
}

#' Pairs of segments that meet end to end, with how sharply the street turns
#' through the shared node.
#'
#' @param segments_m sf object in METRIC_CRS
#' @return data.frame with `a`, `b` (row indices into `segments_m`), `node`
#'   (snapped vertex key) and `deflection` in degrees: 0 where the two run
#'   dead straight into one another, 90 at a right-angle turn, 180 where one
#'   doubles back along the other
corridor_candidate_edges <- function(segments_m) {
  empty <- data.frame(a = integer(), b = integer(), node = character(),
                      deflection = numeric())

  term <- segment_terminals(segments_m)
  if (nrow(term) == 0) return(empty)

  node <- paste(round(term$x / VERTEX_SNAP_M), round(term$y / VERTEX_SNAP_M),
                sep = "_")
  by_node <- split(seq_len(nrow(term)), node)
  by_node <- by_node[lengths(by_node) >= 2]
  if (length(by_node) == 0) return(empty)

  out <- lapply(names(by_node), function(nd) {
    ii <- by_node[[nd]]
    pairs <- utils::combn(ii, 2)
    a <- term$segment[pairs[1, ]]
    b <- term$segment[pairs[2, ]]

    # Both bearings point away from the node into their own way, so two ways
    # forming a straight line differ by 180 degrees.
    between <- abs((term$bearing[pairs[1, ]] - term$bearing[pairs[2, ]] + 180)
                   %% 360 - 180)

    keep <- a != b
    data.frame(a = a[keep], b = b[keep], node = nd,
               deflection = (180 - between)[keep])
  })

  do.call(rbind, out)
}

#' Assign each recommendable segment a corridor id.
#'
#' Runs *before* classification, not after - see this file's header. The label
#' is a property of the corridor this produces, so it cannot be part of the
#' rule that produces it.
#'
#' @param segments sf object, the full segment table with `name` and whatever
#'   `is_recommendable()` reads
#' @param recommendable logical vector over `segments`, TRUE where the segment
#'   is worth spending money on at all. Defaults to `is_recommendable()`;
#'   passed in only by tests wanting to group a hypothetical subset.
#' @return integer vector over all rows of `segments`; NA where the segment is
#'   not recommendable and so belongs to no corridor
assign_corridor_ids <- function(segments, recommendable = NULL) {
  if (is.null(recommendable)) recommendable <- is_recommendable(segments)

  corridor_id <- rep(NA_integer_, nrow(segments))
  rec_rows <- which(recommendable)
  if (length(rec_rows) == 0) return(corridor_id)

  sub <- segments[rec_rows, ]
  cand <- corridor_candidate_edges(sf::st_transform(sub, METRIC_CRS))

  street <- ifelse(is_street_name(sub$name), sub$name, NA_character_)

  if (nrow(cand) > 0) {
    nm_a <- street[cand$a]
    nm_b <- street[cand$b]
    # Only a *conflict* of street names blocks an edge. Two stretches that
    # both name a street, differently, are two streets meeting end-on (21
    # pairs here). Everything else may join: name to no-name lets a named
    # street absorb the unnamed and designation-labelled stretches it runs
    # straight into (81 pairs), which is what OSM's inconsistent naming of one
    # physical road looks like from below. No-name to no-name is unchanged.
    conflict <- !is.na(nm_a) & !is.na(nm_b) & nm_a != nm_b

    cand <- cand[!conflict & cand$deflection <= CORRIDOR_MAX_DEFLECTION_DEG, ]
  }

  parent <- seq_len(nrow(sub))
  find <- function(x) {
    while (parent[x] != x) x <- parent[x]
    x
  }
  # The street name a component has claimed so far, so a chain cannot launder
  # one street into another through an unnamed stretch between them: A(named X)
  # - B(unnamed) - C(named Y) would otherwise put X and Y in one corridor.
  claimed <- street

  if (nrow(cand) > 0) {
    # Straightest continuation first, and one continuation per way per node:
    # at a staggered crossroads of four same-named arms, every arm would
    # otherwise merge with every other and the "corridor" would be the
    # junction. Ordering by deflection within the node makes the pairing take
    # the through-route and leave the turns.
    cand <- cand[order(cand$node, cand$deflection), ]
    chosen <- unlist(lapply(split(seq_len(nrow(cand)), cand$node), function(k) {
      used <- integer(0)
      keep <- integer(0)
      for (i in k) {
        if (cand$a[i] %in% used || cand$b[i] %in% used) next
        keep <- c(keep, i)
        used <- c(used, cand$a[i], cand$b[i])
      }
      keep
    }), use.names = FALSE)

    # Merged in global straightness order so that where a name has to be
    # decided, the straighter continuation is the one that gets to claim it.
    for (i in chosen[order(cand$deflection[chosen])]) {
      ra <- find(cand$a[i])
      rb <- find(cand$b[i])
      if (ra == rb) next
      if (!is.na(claimed[ra]) && !is.na(claimed[rb]) &&
          claimed[ra] != claimed[rb]) next
      name <- if (is.na(claimed[ra])) claimed[rb] else claimed[ra]
      parent[rb] <- ra
      claimed[ra] <- name
    }
  }

  roots <- vapply(seq_len(nrow(sub)), find, integer(1))
  corridor_id[rec_rows] <- match(roots, sort(unique(roots)))
  corridor_id
}

#' One merged geometry per corridor, in METRIC_CRS.
#'
#' Shared by 05d (which needs corridor geometry to classify) and
#' aggregate_corridors() (which needs it to roll up), so the two cannot
#' disagree about what a corridor's extent is.
#'
#' @param members_m sf object in METRIC_CRS, recommendable rows only
#' @param corridor_id integer vector over `members_m`
#' @return list with `ids` (sorted unique corridor ids), `rows` (row indices
#'   per corridor) and `geoms` (sfc, one merged geometry per corridor)
corridor_geometries <- function(members_m, corridor_id) {
  ids <- sort(unique(corridor_id))
  rows <- split(seq_len(nrow(members_m)), corridor_id)[as.character(ids)]
  geoms <- do.call(c, lapply(rows, function(r) {
    sf::st_combine(sf::st_geometry(members_m)[r])
  }))
  list(ids = ids, rows = rows, geoms = geoms)
}

#' Group signal nodes into junctions.
#'
#' Single-linkage clustering at SIGNAL_JUNCTION_CLUSTER_M. Done once over the
#' whole layer rather than per corridor, so a junction has one identity
#' however many corridors touch it.
#'
#' @param signals_m sf POINT in METRIC_CRS
#' @return integer vector over `signals_m`, the junction each node belongs to
signal_junction_ids <- function(signals_m) {
  n <- nrow(signals_m)
  near <- sf::st_is_within_distance(signals_m, signals_m,
                                    SIGNAL_JUNCTION_CLUSTER_M)
  el <- do.call(rbind, lapply(seq_len(n), function(i) {
    j <- near[[i]][near[[i]] > i]
    if (length(j) == 0) NULL else cbind(i, j)
  }))

  g <- igraph::make_empty_graph(n = n, directed = FALSE)
  if (!is.null(el)) g <- igraph::add_edges(g, as.vector(t(el)))
  igraph::components(g)$membership
}

#' Signalised junctions on each corridor.
#'
#' Distinct junctions near the merged geometry, not the sum of the members'
#' own `traffic_signals_count`. Summing double-counts twice over: a signal at
#' a junction *between* two members is within SIGNAL_NEAR_ROAD_M of both, and
#' OSM's per-approach tagging means one crossroads is several nodes. On the
#' old summed field 70 of this study area's 120 multi-segment corridors
#' overstated their junction count, the worst claiming 77 where 20 nodes and
#' 8 junctions lie within 15m of the corridor.
#'
#' @param corridor_geoms sfc in METRIC_CRS
#' @param signals_m sf POINT in METRIC_CRS
#' @return integer vector, junctions per corridor
corridor_signal_junctions <- function(corridor_geoms, signals_m) {
  if (is.null(signals_m) || nrow(signals_m) == 0) {
    return(rep(0L, length(corridor_geoms)))
  }
  junction <- signal_junction_ids(signals_m)
  hits <- sf::st_is_within_distance(corridor_geoms, signals_m,
                                    SIGNAL_NEAR_ROAD_M)
  vapply(hits, function(idx) length(unique(junction[idx])), integer(1))
}

#' The corridor-level inputs classify_corridor_recommendation() reads.
#'
#' Every field is scale-free - a share of the corridor's length, an any(), or
#' a per-km rate - because the whole point of classifying here rather than per
#' segment is that the answer must not depend on where OSM cut the street.
#'
#' @param segments sf object carrying `corridor_id` and the attributes below
#' @param signals sf POINT layer of traffic signals, any CRS
#' @return data.frame, one row per corridor
corridor_classification_inputs <- function(segments, signals) {
  members <- segments[!is.na(segments$corridor_id), ]
  members_m <- sf::st_transform(members, METRIC_CRS)

  cg <- corridor_geometries(members_m, members$corridor_id)
  junctions <- corridor_signal_junctions(
    cg$geoms, sf::st_transform(signals, METRIC_CRS)
  )

  a <- sf::st_drop_geometry(members)
  share_of_length <- function(r, flag) {
    len <- a$length_m[r]
    sum(len[dplyr::coalesce(flag[r], FALSE)], na.rm = TRUE) /
      sum(len, na.rm = TRUE)
  }

  wide_or_fast <- dplyr::coalesce(a$lanes_n >= 3, FALSE) |
    dplyr::coalesce(a$speed_kmh > 40, FALSE)

  length_m <- vapply(cg$rows, function(r) sum(a$length_m[r], na.rm = TRUE),
                     numeric(1))

  data.frame(
    corridor_id = cg$ids,
    length_m = length_m,
    # A share, not an any(). One bridging segment in a 1km street does not make
    # the street a connection project - and nothing is lost by not saying so,
    # because the corridor row carries `bridges_islands` as a flag either way.
    # On this study area the two tests differ on 14 corridors of 76: where a
    # corridor bridges islands at all it usually does so along most of its
    # length (median share 0.89).
    bridges_islands_share = vapply(cg$rows, share_of_length, numeric(1),
                                   flag = a$bridges_islands),
    wide_or_fast_share = vapply(cg$rows, share_of_length, numeric(1),
                                flag = wide_or_fast),
    informal_parking_share = vapply(cg$rows, share_of_length, numeric(1),
                                    flag = a$likely_informal_parking),
    signalised_junctions = junctions,
    # Stops per km, which is what a signal costs a cyclist. Also the honest
    # form of the old `traffic_signals_count >= 2` test, which fired on a 47m
    # stub and not on the 192m street it continued into.
    signals_per_km = junctions / (length_m / 1000),
    row.names = NULL
  )
}

#' Length-weighted mean, NA-safe. Used rather than a plain mean because a
#' corridor's members differ in length by more than an order of magnitude,
#' so an unweighted mean lets a 2m stub count as much as a 1.4km arterial.
weighted_mean_by_length <- function(x, length_m) {
  ok <- !is.na(x) & !is.na(length_m)
  if (!any(ok)) return(NA_real_)
  sum(x[ok] * length_m[ok]) / sum(length_m[ok])
}

#' The name to put on a corridor whose members disagree.
#'
#' Since a named stretch may now absorb the unnamed and designation-labelled
#' ones it runs straight into, `name[1]` is no longer a safe label - the first
#' member could be the unnamed end of 山下公園通り, or carry a municipal route
#' number while the rest of the corridor has a real name. So: the street name
#' covering most of the corridor's length, or the designation if that is all
#' there is (better than blank), or NA to let the locality label take over.
#'
#' @param names character vector of member `name` values
#' @param length_m member lengths
dominant_name <- function(names, length_m) {
  pick <- function(keep) {
    if (!any(keep)) return(NULL)
    by_name <- tapply(length_m[keep], names[keep], sum, na.rm = TRUE)
    names(by_name)[which.max(by_name)]
  }
  street <- pick(is_street_name(names))
  if (!is.null(street)) return(street)
  designation <- pick(!is.na(names) & nzchar(trimws(names)))
  if (!is.null(designation)) return(designation)
  NA_character_
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
#' @param signals sf POINT layer of traffic signals, for the junction count
#' @param buffer_m beneficiary buffer, matching BENEFICIARY_BUFFER_M in 05d
#' @param stations sf object for the locality label, or NULL
#' @return sf object, one MULTILINESTRING row per corridor
aggregate_corridors <- function(segments, hexes, signals, buffer_m = 500,
                                stations = NULL) {
  if (!"corridor_id" %in% names(segments)) {
    stop("segments has no corridor_id column - run 05d_score_interventions.R first")
  }

  members <- segments[!is.na(segments$corridor_id), ]
  if (nrow(members) == 0) {
    stop("no segments carry a recommendation - nothing to build corridors from")
  }

  members_m <- sf::st_transform(members, METRIC_CRS)
  hexes_m   <- sf::st_transform(hexes, METRIC_CRS)

  cg    <- corridor_geometries(members_m, members$corridor_id)
  ids   <- cg$ids
  rows  <- cg$rows
  geoms <- cg$geoms

  beneficiaries <- corridor_beneficiaries(geoms, hexes_m, buffer_m)
  near_station  <- nearest_station_name(geoms, stations)
  junctions     <- corridor_signal_junctions(
    geoms, sf::st_transform(signals, METRIC_CRS)
  )

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
      name            = dominant_name(a$name, len),
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
      #
      # Distinct junctions near the merged geometry, NOT the sum of the
      # members' `traffic_signals_count` - see corridor_signal_junctions().
      signalised_junctions      = junctions[i],
      # How often a cyclist would expect to stop along it. The reason this
      # matters beyond costing a crossing scheme: a street with a signal
      # every 100m is a bad ride whatever its LTS says.
      signals_per_km            = round(
        junctions[i] / (sum(len, na.rm = TRUE) / 1000), 1),
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
