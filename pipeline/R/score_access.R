# score_access.R
# Who can actually get somewhere, and who is cut off from it.
#
# WHY THIS FILE EXISTS
#
# Everything else in this pipeline scores a *place* - a hex, a way, a
# corridor. That answers "where should money go", and it is the whole of the
# planner's question. It is none of a resident's. A parent does not want a
# ranked list of streets; they want to know whether their child can ride to
# school without being put on an arterial, and a commuter wants to know
# whether the station is a fifteen-minute ride or a fifteen-minute ride they
# would not let their own child make.
#
# Both are the same measurement, taken from a destination rather than about a
# street: reach. From one origin, over our own network, how far can you get -
# and how much of that shrinks if you refuse to ride anything above
# CALM_MAX_LTS.
#
# THE NUMBER THIS PRODUCES
#
# Two surfaces per origin, measured identically, and the gap between them:
#
#   population_any   residents who can reach this origin within the band
#   population_calm  residents who can do it without leaving low-stress streets
#   severed          the first minus the second
#
# `severed` is the project's "missed opportunity" thesis stated as people
# rather than as a score. It is also robust in a way neither surface is on its
# own: both are measured with the same buffer, the same mesh and the same
# graph, so the ratio survives every arbitrary constant below. If
# ACCESS_BUFFER_M is too generous it inflates both numbers and leaves the
# share roughly where it was. Quote the share; treat the absolute counts as
# the order-of-magnitude figures the rest of this pipeline's population work
# already is.
#
# WHAT MAKES IT A COUNTERFACTUAL AND NOT A COMPLAINT
#
# A severed number on its own is a lament. The last stage here re-runs the
# calm surface with one corridor's stress removed and reports the difference,
# so the output is "upgrading this street brings N more residents into calm
# reach of this school" - the same move score_intervention.R makes on
# score_lts(), applied to reach instead of to a single way. It is subject to
# exactly the same honesty rule: a corridor whose own `benefit_kind` is
# `not_modelled` gets no unlock number, because we have no modelled after
# state to route on. See `frontier_corridors()`.
#
# GRAPH MODEL - reused, not rebuilt
#
# `build_segment_adjacency()` from score_network.R is the graph, unchanged:
# nodes are segments, two segments are adjacent if they share a vertex at
# VERTEX_SNAP_M. That reuse is deliberate and load-bearing. The calm surface
# here is a distance-limited walk over the same subgraph whose connected
# components B.3 calls low-stress islands, so "this school sits on a big calm
# island" and "this school has wide calm reach" cannot disagree - they are one
# fact read two ways. Building a second topology (vertex-level, planar-noded,
# whatever) would let them.
#
# The one addition is edge weight. B.3 counts hops, which is right for "how
# many segments would an upgrade span"; reach needs metres. On a segment-dual
# graph the natural weight for the edge between segments i and j is
# (length_i + length_j) / 2, and a source is seeded at length/2. A path then
# costs the full length of every segment crossed plus half of the one you
# started and finished on - i.e. distances are measured midpoint to midpoint,
# which is the honest reading of "you reached this street" when the street is
# the atom.

library(igraph)
library(sf)
library(dplyr)

source("R/score_network.R")      # build_segment_adjacency(), VERTEX_SNAP_M, METRIC_CRS
source("R/score_suitability.R")  # NO_SAFE_OPTION_PENALTY, and the LTS -> 0-100 mapping

# --- Constants -----------------------------------------------------------

#' The distance bands, in metres of network distance.
#'
#' Not straight-line: 3km here means 3km of riding, which is the number a
#' parent is actually weighing and roughly 12 minutes at a child's pace.
#'
#' 1500 is the walking catchment a Japanese elementary school's 通学区域 is
#' usually drawn at, so the first band asks whether cycling adds anything to
#' the area that already walks. 3000 and 5000 are the two figures the
#' project's own framing keeps returning to - the trip lengths a bicycle
#' beats a car over.
ACCESS_BANDS_M <- c(1500, 3000, 5000)

#' The band the headline figures are quoted at, and the one the app opens on.
#'
#' Stated here rather than chosen in the frontend so that "N residents are cut
#' off from this school" means the same thing in the export, in the ranked
#' list and in whatever gets pasted into a slide.
ACCESS_PRIMARY_BAND_M <- 3000

#' How far a resident is assumed to be willing to walk their bike to reach a
#' street the analysis has scored.
#'
#' A 250m mesh cell is 250m across, so 150m from its centroid covers most of
#' the cell. Generous on purpose: this constant sets how many people the
#' surfaces claim, and being generous inflates *both* surfaces, which leaves
#' the severed share - the number worth quoting - close to unchanged.
ACCESS_BUFFER_M <- 150

#' How far from the origin point a segment may be and still count as "the
#' street at the gate". KSJ places a school at a representative point rather
#' than at its entrance, and stations are collapsed from platform centrelines,
#' so a tight radius would leave real origins unsnapped.
ORIGIN_SNAP_M <- 150

#' The stress ceiling for the calm surface. Identical to score_network.R's
#' definition of a low-stress segment, and deliberately so: the calm reach of
#' a school is a distance-limited slice of the low-stress island it sits on.
CALM_MAX_LTS <- 2

#' Whether a corridor's *modelled after state* would be calm enough to route
#' on, expressed in `suitability_after`'s units so this file invents no
#' second threshold.
#'
#' score_suitability() maps LTS 2 to 67, or 57 once NO_SAFE_OPTION_PENALTY
#' applies. Anything at or above 57 therefore came from an after-LTS of 2 or
#' better. Below it, the corridor stays high-stress even once built, so
#' routing the calm surface through it would claim an unlock the intervention
#' does not deliver.
CALM_AFTER_SUITABILITY_MIN <- 57

#' How many frontier corridors an origin reports an unlock figure for.
#'
#' A cap, and therefore stated rather than silent: origins in the dense
#' centre of the ward can have dozens of high-stress streets on the edge of
#' their calm area, and each one costs a counterfactual Dijkstra. The ones
#' dropped are the shortest, on the grounds that a 40m stub is not the
#' project anybody funds. `frontier_corridor_count` in the export carries how
#' many there were before the cut.
MAX_FRONTIER_CORRIDORS <- 8

#' KSJ P29 学校分類コード -> the label this project uses.
#'
#' Only the three classes where "can a child get here by bicycle" is a real
#' question. 幼稚園 (16011) and 認定こども園 (16013) are excluded because
#' nobody cycles to them unaccompanied; 大学 (16007), 専修学校 (16016) and
#' 各種学校 (16015) because their catchment is regional rather than local and
#' a 5km reach surface says nothing useful about them. 特別支援学校 (16012)
#' is excluded for a different reason worth stating: its pupils' journeys are
#' overwhelmingly not made by bicycle, and including it would put a number
#' next to a school where the number means something else entirely.
#'
#' Stations are handled separately and have no class.
ACCESS_SCHOOL_CLASSES <- c(
  "16001" = "elementary",
  "16002" = "junior_high",
  "16004" = "high"
)

# --- Origins -------------------------------------------------------------

#' Build the origin table: the places whose reach is worth measuring.
#'
#' @param schools sf POINT, KSJ P29 (P29_003 class, P29_004 name, P29_005 address)
#' @param stations sf, KSJ N02 platform centrelines (N02_003 line, N02_005 name)
#' @return sf POINT with origin_id, kind, school_class, name, detail
build_access_origins <- function(schools, stations) {
  school_class <- unname(ACCESS_SCHOOL_CLASSES[as.character(schools$P29_003)])
  keep <- !is.na(school_class)

  schools_pts <- sf::st_sf(
    kind         = "school",
    school_class = school_class[keep],
    name         = schools$P29_004[keep],
    detail       = schools$P29_005[keep],
    geometry     = sf::st_point_on_surface(sf::st_geometry(schools[keep, ]))
  )

  # One row per platform centreline collapses to one origin per station, the
  # same collapse export_amenities_layer() makes - so a station has the same
  # marker and the same name in both layers.
  station_groups <- stations |>
    dplyr::group_by(station = .data$N02_005) |>
    dplyr::summarise(
      detail = paste(unique(.data$N02_003), collapse = " / "),
      .groups = "drop"
    )

  stations_pts <- sf::st_sf(
    kind         = "station",
    school_class = NA_character_,
    name         = station_groups$station,
    detail       = station_groups$detail,
    geometry     = sf::st_point_on_surface(sf::st_geometry(station_groups))
  )

  origins <- rbind(schools_pts, stations_pts)

  # Stable within a run and readable in a URL. Not stable across runs if the
  # KSJ extract changes - the app treats it as an opaque key and always reads
  # the index for the list, so a shifted id is a stale bookmark rather than a
  # wrong answer.
  origins$origin_id <- sprintf("%s_%d", origins$kind, seq_len(nrow(origins)))
  origins[, c("origin_id", "kind", "school_class", "name", "detail")]
}

# --- Population mesh -----------------------------------------------------

#' The column e-Stat's mesh table puts its category in.
#'
#' Found by prefix rather than hardcoded in full: the header carries trailing
#' ideographic whitespace that is easy to lose in an edit, and a silently
#' missing filter here would let every age band be summed into one population
#' figure several times the truth.
mesh_category_column <- function(population) {
  col <- grep("^年齢別人口", names(population), value = TRUE)
  if (length(col) != 1) {
    stop("could not find the age/category column in the e-Stat mesh table.\n",
         "  Columns present: ", paste(names(population), collapse = ", "))
  }
  col
}

#' Load every ward's e-Stat mesh extract and merge them into one 250m grid.
#'
#' Mesh cells straddle ward boundaries, so the same code comes back in two
#' wards' fetches. Deduplicated on the code, not summed - the value is the
#' cell's whole population either time it arrives.
#'
#' Age bands are picked up if the table carries them and left NA if it does
#' not, rather than being approximated from the total. Which bands exist is
#' reported, because "child population" is the single most persuasive number
#' this analysis can produce and its absence should be visible in the run
#' rather than discovered as a column of nulls in the app.
#'
#' @param ward_names character vector of the `wards:` names in study_area.yml
#' @return sf POLYGON, one row per 250m cell: mesh_code, population,
#'   population_child, population_elderly (the last two possibly all NA)
load_population_mesh <- function(ward_names) {
  paths <- sprintf("output/%s_population_mesh.rds", ward_names)
  missing <- paths[!file.exists(paths)]
  if (length(missing) > 0) {
    stop("no population mesh for: ", paste(missing, collapse = ", "),
         "\n  Run scripts/02_download_estat.R for each ward first.")
  }

  population <- dplyr::bind_rows(lapply(paths, readRDS))
  cat_col <- mesh_category_column(population)
  categories <- unique(population[[cat_col]])

  # One per line, numbered. This list is the thing to read when an age band
  # comes back NA, and a single collapsed line of thirty Japanese labels is
  # not readable in a terminal or pasteable into a message.
  message(sprintf("Mesh categories available (%d):", length(categories)))
  for (i in seq_along(categories)) {
    message(sprintf("  [%2d] %s", i, trimws(categories[i])))
  }

  # The three we want, each matched on the substring that identifies it. The
  # total's label is exact (07_join_population.R uses the same one); the age
  # bands are matched loosely, because e-Stat is inconsistent about how it
  # writes a range - wave dash, full-width tilde or hyphen - and about whether
  # the digits are half or full width. Normalising the haystack rather than
  # widening the pattern keeps the patterns readable.
  ascii <- chartr("０１２３４５６７８９", "0123456789", categories)
  pick <- function(pattern) {
    hit <- grep(pattern, ascii)
    if (length(hit) == 0) return(NULL)
    categories[hit[1]]
  }
  cat_total   <- pick("人口（総数）")
  cat_child   <- pick("0.{0,2}14.?歳")
  cat_elderly <- pick("65.?歳以上")

  if (is.null(cat_total)) {
    stop("the mesh table has no 人口（総数）category - cannot compute reach ",
         "population.\n  Categories: ", paste(categories, collapse = " | "))
  }
  # list(), not c(): c("child", NULL) drops the NULL and yields a length-1
  # vector, so band[[2]] is a subscript error on exactly the branch this loop
  # exists to report.
  for (band in list(list("child", cat_child), list("elderly", cat_elderly))) {
    if (is.null(band[[2]])) {
      message(sprintf("  no %s age band matched - %s population will be NA",
                      band[[1]], band[[1]]))
    } else {
      message(sprintf("  %s band: %s", band[[1]], trimws(band[[2]])))
    }
  }

  value_for <- function(category) {
    if (is.null(category)) return(NULL)
    population |>
      dplyr::filter(.data[[cat_col]] == category, !is.na(.data$value)) |>
      dplyr::transmute(
        mesh_code = as.character(.data$area_code),
        value = as.numeric(.data$value)
      ) |>
      dplyr::distinct(.data$mesh_code, .keep_all = TRUE)
  }

  totals <- value_for(cat_total)
  if (nrow(totals) == 0) stop("no population records after filtering to ", cat_total)

  cells <- totals |> dplyr::rename(population = "value")
  for (band in list(list("population_child", cat_child),
                    list("population_elderly", cat_elderly))) {
    vals <- value_for(band[[2]])
    if (is.null(vals)) {
      cells[[band[[1]]]] <- NA_real_
    } else {
      names(vals)[names(vals) == "value"] <- band[[1]]
      cells <- dplyr::left_join(cells, vals, by = "mesh_code")
    }
  }

  message(sprintf("Merged %d distinct 250m mesh cells across %d ward(s), %.0f residents",
                  nrow(cells), length(ward_names), sum(cells$population, na.rm = TRUE)))

  geometry <- sf::st_sfc(
    lapply(cells$mesh_code, function(code) jpmesh::export_mesh(code)[[1]]),
    crs = 4326
  )
  sf::st_sf(cells, geometry = geometry)
}

# --- The reach graph -----------------------------------------------------

#' Stamp metre weights onto the graph's edges, once.
#'
#' See the file header: the edge between two segments costs half of each, so
#' a path's total is the length of every segment fully crossed plus half of
#' the first and last.
#'
#' Carried as an edge *attribute* rather than a parallel vector because every
#' calm surface below is an induced subgraph, and a parallel vector would
#' have to be re-indexed by hand for each one. igraph carries edge attributes
#' through induced_subgraph(), so the weights follow the edges they belong to
#' and cannot be silently mismatched by a reordering.
#'
#' @param g segment adjacency graph from build_segment_adjacency()
#' @param length_m numeric vector of segment lengths, indexed by vertex
#' @return `g` with an `edge_m` edge attribute
with_edge_metres <- function(g, length_m) {
  ends <- igraph::ends(g, igraph::E(g), names = FALSE)
  igraph::E(g)$edge_m <- (length_m[ends[, 1]] + length_m[ends[, 2]]) / 2
  g
}

#' Restrict the network to the segments a rider is willing to use.
#'
#' The subgraph is how the calm surface is expressed: keep only the vertices
#' a rider will accept and the search physically cannot leave them, so a calm
#' reach can never be a high-stress path that happens to end calmly.
#'
#' Prepared as its own object because the expensive part - building the
#' induced subgraph over ~13k vertices - depends only on which segments are
#' allowed, not on where the origin is. Three of these are built per run
#' (all streets, calm streets, and one per counterfactual corridor) and every
#' origin reuses them.
#'
#' @param g segment adjacency graph carrying `edge_m`, from with_edge_metres()
#' @param allowed integer vector of vertices the search may use
prepare_subnetwork <- function(g, allowed) {
  n <- igraph::vcount(g)
  allowed <- sort(unique(as.integer(allowed)))

  # induced_subgraph() numbers its vertices in the original graph's order, so
  # `allowed` has to be sorted for this positional map to be right. Whole
  # network is the common case and needs no copy at all.
  sub <- if (length(allowed) == n) g else igraph::induced_subgraph(g, allowed)
  pos <- rep(NA_integer_, n)
  pos[allowed] <- seq_along(allowed)

  list(sub = sub, pos = pos, allowed = allowed, n = n)
}

#' Network distance from an origin to every segment, over a prepared subnetwork.
#'
#' @param net from prepare_subnetwork()
#' @param length_m segment lengths, indexed by vertex of the full graph
#' @param seeds integer vector of vertices the origin snaps to (intersected
#'   with the subnetwork; an empty result yields all-Inf, which is the correct
#'   answer for an origin with no usable street at its gate)
#' @return numeric vector over all vertices of the full graph, Inf where
#'   unreachable
reach_distances <- function(net, length_m, seeds) {
  out <- rep(Inf, net$n)

  seeds <- intersect(seeds, net$allowed)
  if (length(seeds) == 0) return(out)

  # Multi-source Dijkstra via a temporary super-source, one distances() call
  # for every seed at once. The edge to each seed costs half that seed's
  # length: you join the network partway along the street at the gate, not at
  # its far end.
  g_tmp <- igraph::add_vertices(net$sub, 1)
  src <- igraph::vcount(g_tmp)
  g_tmp <- igraph::add_edges(g_tmp, as.vector(rbind(src, net$pos[seeds])))
  w_tmp <- c(igraph::E(net$sub)$edge_m, length_m[seeds] / 2)

  d <- as.vector(igraph::distances(g_tmp, v = src, weights = w_tmp))
  out[net$allowed] <- d[seq_along(net$allowed)]
  out
}

# --- Mesh <-> network ----------------------------------------------------

#' Which segments are close enough to serve each mesh cell.
#'
#' Computed once for the whole study area and reused for every origin, which
#' is what keeps 135 origins x 2 surfaces x 8 counterfactuals affordable.
#'
#' Matched from the cell's centroid rather than by intersecting its polygon
#' with a buffer, and the reason is not speed. Area-weighting a buffer would
#' produce a fractional population for a cell, implying we know how the
#' cell's residents are distributed inside it, which we do not - the mesh is
#' the finest thing e-Stat publishes. The centroid stands for the cell's
#' residents and the answer is binary: this cell's people either have a
#' scored street within a short walk or they do not.
#'
#' @param mesh sf POLYGON from load_population_mesh()
#' @param segments sf LINESTRING, the region's segment table
#' @return list of integer vectors, one per mesh row, of segment row indices
cells_to_segments <- function(mesh, segments) {
  centroids <- sf::st_centroid(sf::st_transform(sf::st_geometry(mesh), METRIC_CRS))
  near <- sf::st_is_within_distance(
    centroids,
    sf::st_transform(sf::st_geometry(segments), METRIC_CRS),
    dist = ACCESS_BUFFER_M
  )
  lapply(near, as.integer)
}

#' Collapse a per-segment distance vector to a per-cell one.
#'
#' A cell's distance is the smallest distance of any segment serving it: if
#' one street within walking distance is 2km from the school, the cell is 2km
#' from the school regardless of how far the other streets are.
#'
#' @param seg_dist numeric over segments, from reach_distances()
#' @param cell_segs list from cells_to_segments()
#' @return numeric over cells, Inf where no serving segment is reachable
cell_distances <- function(seg_dist, cell_segs) {
  vapply(cell_segs, function(idx) {
    if (length(idx) == 0) return(Inf)
    min(seg_dist[idx])
  }, numeric(1))
}

#' Population totals within each band, for one surface.
#'
#' @param cell_dist numeric over cells, from cell_distances()
#' @param mesh sf from load_population_mesh()
#' @param bands numeric vector of band distances
#' @return data frame, one row per band: band_m, cells, population,
#'   population_child, population_elderly
band_population <- function(cell_dist, mesh, bands = ACCESS_BANDS_M) {
  # An age band the source table did not carry is NA for every cell, and
  # sum(na.rm = TRUE) would turn that into a confident 0. Kept as NA so the
  # export can say "this run has no child figures" rather than "no children
  # live near any school in Yokohama".
  total <- function(x) if (all(is.na(x))) NA_real_ else sum(x, na.rm = TRUE)

  do.call(rbind, lapply(bands, function(band) {
    inside <- cell_dist <= band
    data.frame(
      band_m             = band,
      cells              = sum(inside),
      population         = total(mesh$population[inside]),
      population_child   = total(mesh$population_child[inside]),
      population_elderly = total(mesh$population_elderly[inside])
    )
  }))
}

# --- Frontier corridors --------------------------------------------------

#' The corridors standing between an origin and the rest of its neighbourhood.
#'
#' A frontier corridor has a member segment that is (a) high-stress, so it is
#' not already in the calm surface, (b) reachable within the largest band on
#' the any-street surface, so it is genuinely nearby rather than across the
#' ward, and (c) adjacent to a segment the calm surface reaches - i.e. it is
#' the next street along from where a cautious rider has to stop.
#'
#' Where the calm surface is empty, (c) is vacuous and would return nothing
#' for exactly the origins with the worst problem. Those fall back to the
#' corridors at the gate, which is the same claim: the barrier is the first
#' street you meet.
#'
#' Only corridors whose modelled after state is actually calm are returned -
#' see CALM_AFTER_SUITABILITY_MIN. A crossing improvement has no modelled
#' after state at all (`benefit_kind == "not_modelled"`), so routing through
#' it would be the exact error score_intervention.R was written to stop.
#'
#' @param g segment adjacency graph
#' @param segments the segment table (needs corridor_id, lts, length_m,
#'   suitability_after, benefit_kind)
#' @param dist_any,dist_calm per-segment distances from reach_distances()
#' @param gate_segs integer vector of segments at the origin
#' @return list with `corridor_ids` (integer, capped) and `total` (integer,
#'   before the cap)
frontier_corridors <- function(g, segments, dist_any, dist_calm, gate_segs) {
  max_band <- max(ACCESS_BANDS_M)

  upgradeable <- !is.na(segments$corridor_id) &
    dplyr::coalesce(segments$benefit_kind, "") == "lts_recalc" &
    dplyr::coalesce(segments$suitability_after, -1) >= CALM_AFTER_SUITABILITY_MIN &
    dplyr::coalesce(segments$lts, 4) > CALM_MAX_LTS

  nearby <- upgradeable & is.finite(dist_any) & dist_any <= max_band
  if (!any(nearby)) return(list(corridor_ids = integer(0), total = 0L))

  reached_calm <- which(is.finite(dist_calm))
  if (length(reached_calm) > 0) {
    touching <- unique(unlist(igraph::adjacent_vertices(g, reached_calm)))
    on_frontier <- nearby & seq_along(nearby) %in% touching
  } else {
    # No calm street anywhere near this origin: the frontier is the gate.
    on_frontier <- nearby & seq_along(nearby) %in% gate_segs
  }
  if (!any(on_frontier)) return(list(corridor_ids = integer(0), total = 0L))

  # Rank by the corridor's total length inside the frontier, so the cap drops
  # stubs rather than arterials.
  #
  # Back to integer after the tapply: `corridor_id` is an integer column here,
  # in the GeoPackage and in investment_ranking.json, and tapply's names are
  # always character. Letting that leak would make this the one place in the
  # project where a corridor id is a string.
  by_corridor <- tapply(segments$length_m[on_frontier],
                        segments$corridor_id[on_frontier], sum)
  ordered <- as.integer(names(sort(by_corridor, decreasing = TRUE)))

  list(
    corridor_ids = utils::head(ordered, MAX_FRONTIER_CORRIDORS),
    total = length(ordered)
  )
}
