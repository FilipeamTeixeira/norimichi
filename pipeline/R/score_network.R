# score_network.R
# Stress-based network connectivity analysis: finds the "low-stress islands"
# in the cycling network, then identifies which high-stress segments would
# merge two otherwise-disconnected islands if upgraded.
#
# WHY THIS EXISTS (and why it isn't just "LTS 4 = red"):
# The design's red category means "improving this unlocks major network
# connectivity", NOT "this road is dangerous". Those are different claims.
# A stressful cul-de-sac scores terribly on LTS but connects nothing - it
# is a poor candidate for investment. A stressful 200m link between two
# large calm neighbourhoods scores identically on LTS but is the single
# highest-value intervention on the map. Only a graph analysis can tell
# them apart, because criticality is a property of a segment's *position
# in the network*, not of its own tags.
#
# GRAPH MODEL - segment adjacency, not planar noding:
# Nodes are segments; two segments are adjacent if they share a geometry
# vertex. This deliberately avoids splitting the network at intersections
# (planar noding), which would be the textbook approach but needs either
# sfnetworks or fiddly st_intersection surgery. For connected-component and
# shortest-path work the adjacency graph gives the same answers, because
# "can a cyclist get from segment A to segment B" is exactly "is there a
# chain of vertex-sharing segments between them".
#
# A useful side effect: grade-separated crossings (a bridge over a road,
# with no shared OSM node) correctly come out as NOT adjacent, whereas a
# naive "endpoints within N metres" rule would wrongly connect them.

library(igraph)
library(sf)

# Metric CRS for coordinate snapping - Japan Plane Rectangular zone IX,
# same value as 05_build_segment_table.R and 08_join_poi.R. Keep in sync.
METRIC_CRS <- 6677

# Vertices within this distance are treated as the same graph node. Small -
# it exists to absorb floating-point noise and coordinate round-tripping
# through GeoPackage, not to bridge real gaps in the network.
VERTEX_SNAP_M <- 0.5

# An island smaller than this is not a meaningful destination - connecting
# two 30m stubs is not an investment case. Filters noise out of the
# criticality scores below.
MIN_ISLAND_LENGTH_M <- 200

# How many consecutive high-stress segments an upgrade may span. 1 = only
# direct single-segment bridges. 3 allows a short corridor of a few
# segments to be credited as one project, which matches how interventions
# actually get built, while keeping "upgrade this and two islands merge"
# a claim that stays true at a plausible project scale.
MAX_CHAIN_SEGMENTS <- 3

#' Build the segment adjacency graph (see the graph-model note above).
#'
#' @param segments sf LINESTRING/MULTILINESTRING object
#' @return undirected igraph with one vertex per row of `segments`, in the
#'   same order (vertex i == segments[i, ])
build_segment_adjacency <- function(segments) {
  xy <- sf::st_coordinates(sf::st_transform(segments, METRIC_CRS))

  # st_coordinates labels the originating feature L2 for MULTILINESTRING
  # and L1 for LINESTRING.
  seg_of_vertex <- if ("L2" %in% colnames(xy)) xy[, "L2"] else xy[, "L1"]

  vertex_key <- paste(
    round(xy[, "X"] / VERTEX_SNAP_M),
    round(xy[, "Y"] / VERTEX_SNAP_M),
    sep = "_"
  )

  segs_at_vertex <- split(seg_of_vertex, vertex_key)
  segs_at_vertex <- lapply(segs_at_vertex, unique)
  segs_at_vertex <- segs_at_vertex[lengths(segs_at_vertex) >= 2]

  edge_pairs <- lapply(segs_at_vertex, function(segs) {
    t(utils::combn(segs, 2))
  })
  edge_pairs <- do.call(rbind, edge_pairs)

  g <- igraph::make_empty_graph(n = nrow(segments), directed = FALSE)
  g <- igraph::add_edges(g, as.vector(t(edge_pairs)))
  igraph::simplify(g)
}

#' Find connected components of the low-stress network ("low-stress
#' islands"), keeping only those long enough to be a real destination.
#'
#' @param g segment adjacency graph from build_segment_adjacency()
#' @param is_low logical vector, TRUE where the segment is low-stress
#' @param length_m numeric vector of segment lengths
#' @return list with `island_id` (integer vector over all segments, NA where
#'   the segment is high-stress or in a below-threshold island) and
#'   `island_length_m` (named numeric, total length per surviving island)
find_low_stress_islands <- function(g, is_low, length_m) {
  low_idx <- which(is_low)
  comp <- igraph::components(igraph::induced_subgraph(g, low_idx))

  raw_id <- rep(NA_integer_, igraph::vcount(g))
  raw_id[low_idx] <- comp$membership

  total_length <- tapply(length_m[low_idx], comp$membership, sum)
  significant <- names(total_length)[total_length >= MIN_ISLAND_LENGTH_M]

  # Renumber the surviving islands 1..n so downstream indexing is dense.
  keep <- as.integer(significant)
  remap <- rep(NA_integer_, comp$no)
  remap[keep] <- seq_along(keep)

  island_id <- rep(NA_integer_, igraph::vcount(g))
  island_id[low_idx] <- remap[comp$membership]

  list(
    island_id = island_id,
    island_length_m = as.numeric(total_length[significant])
  )
}

#' Score how much network connectivity each high-stress segment would
#' unlock if it were upgraded.
#'
#' Method: contract each low-stress island to a source, then breadth-first
#' search outward *through high-stress segments only*, giving every
#' high-stress segment its hop distance to each island. A segment that can
#' reach two different islands within MAX_CHAIN_SEGMENTS hops sits on a
#' plausible corridor between them; its value is the size of the smaller
#' island it would join (the binding constraint - connecting a huge island
#' to a small one is worth about what the small one is worth), discounted
#' by how many segments the upgrade would span.
#'
#' @param g segment adjacency graph
#' @param island_id integer vector from find_low_stress_islands()
#' @param island_length_m numeric vector of island weights
#' @param is_high logical vector, TRUE where the segment is high-stress
#' @return list with `criticality_raw`, `criticality_score` (0-100),
#'   `islands_adjacent`, `bridges_islands`
compute_network_criticality <- function(g, island_id, island_length_m, is_high) {
  n_seg <- igraph::vcount(g)
  high_idx <- which(is_high)
  n_islands <- length(island_length_m)

  criticality_raw <- rep(0, n_seg)
  islands_adjacent <- rep(0L, n_seg)

  if (n_islands < 2 || length(high_idx) == 0) {
    return(list(
      criticality_raw = criticality_raw,
      criticality_score = rep(0, n_seg),
      islands_adjacent = islands_adjacent,
      bridges_islands = rep(FALSE, n_seg)
    ))
  }

  # Subgraph of high-stress segments only. Upgrading a corridor means
  # upgrading high-stress links; paths are not allowed to route through
  # already-calm segments (those are the islands themselves).
  g_high <- igraph::induced_subgraph(g, high_idx)
  pos_in_high <- rep(NA_integer_, n_seg)
  pos_in_high[high_idx] <- seq_along(high_idx)

  neighbors_of <- igraph::adjacent_vertices(g, high_idx)

  # dist_to_island[k, j] = hops from island k to high-stress segment j
  dist_to_island <- matrix(Inf, nrow = n_islands, ncol = length(high_idx))

  for (k in seq_len(n_islands)) {
    island_segs <- which(island_id == k)
    if (length(island_segs) == 0) next

    # High-stress segments directly touching this island are the BFS seeds.
    touching <- unique(unlist(igraph::adjacent_vertices(g, island_segs)))
    seeds <- pos_in_high[intersect(touching, high_idx)]
    seeds <- seeds[!is.na(seeds)]
    if (length(seeds) == 0) next

    # Multi-source BFS via a temporary super-source, so one distances()
    # call covers every seed at once.
    g_tmp <- igraph::add_vertices(g_high, 1)
    src <- igraph::vcount(g_tmp)
    g_tmp <- igraph::add_edges(g_tmp, as.vector(rbind(src, seeds)))

    d <- as.vector(igraph::distances(g_tmp, v = src))[seq_along(high_idx)]
    dist_to_island[k, ] <- d
  }

  # Count islands each high-stress segment directly touches (distance 1).
  islands_adjacent[high_idx] <- colSums(dist_to_island == 1)

  for (j in seq_along(high_idx)) {
    reachable <- which(dist_to_island[, j] <= MAX_CHAIN_SEGMENTS)
    if (length(reachable) < 2) next

    # Keep the most promising islands if a segment sits near many, so the
    # pairwise step stays cheap. Ranked by weight/distance, i.e. the same
    # quantity the scoring below rewards.
    if (length(reachable) > 8) {
      rank_by <- island_length_m[reachable] / dist_to_island[reachable, j]
      reachable <- reachable[order(rank_by, decreasing = TRUE)[1:8]]
    }

    pairs <- utils::combn(reachable, 2)
    scores <- apply(pairs, 2, function(pr) {
      d_total <- dist_to_island[pr[1], j] + dist_to_island[pr[2], j]
      min(island_length_m[pr]) / (d_total - 1)
    })
    criticality_raw[high_idx[j]] <- max(scores)
  }

  # Scale to 0-100 by percentile rank among segments that scored at all.
  # Rank rather than a linear stretch because the raw values are heavily
  # right-skewed (a handful of segments border very large islands), and a
  # linear scale would compress everything else into the low single digits
  # and make the colour thresholds meaningless.
  criticality_score <- rep(0, n_seg)
  scored <- which(criticality_raw > 0)
  if (length(scored) > 1) {
    criticality_score[scored] <- round(
      100 * (rank(criticality_raw[scored], ties.method = "min") - 1) /
        (length(scored) - 1)
    )
  } else if (length(scored) == 1) {
    criticality_score[scored] <- 100
  }

  list(
    criticality_raw = criticality_raw,
    criticality_score = criticality_score,
    islands_adjacent = islands_adjacent,
    bridges_islands = islands_adjacent >= 2
  )
}
