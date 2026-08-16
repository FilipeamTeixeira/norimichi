# fetch_census_mesh.R
# Reads the census mesh table of commuting mode, and undoes its disclosure
# control so the counts land in the right place.
#
# This is the only *measured* input in the project. Everything else is
# modelled, so the whole value of this file is that its output can disagree
# with the model. See R/observed_mode_share.R for what is and is not a fair
# thing to conclude from that disagreement.
#
# THE DISCLOSURE CONTROL, WHICH IS NOT OPTIONAL TO HANDLE
#
# Three columns in the file describe it, and getting them wrong would be
# invisible:
#
#   HTKSYORI = 0   ordinary cell, values are its own
#   HTKSYORI = 2   too few people to publish. Every value is the string "*",
#                  and the real counts have been **moved into another cell**,
#                  named in HTKSAKI.
#   HTKSYORI = 1   the cell that received them. Its values cover itself plus
#                  every cell listed in GASSAN.
#
# Read naively, "*" parses to 0 and 1,516 of the study area's cells report no
# commuters at all, while 15 others report several cells' worth as if they
# were their own. Both errors survive an area-weighted join to the hex grid
# and come out the far end as a plausible-looking map.
#
# So a suppression group is put back together and then spread across its
# member cells **in proportion to the population already on those cells**,
# which the pipeline has at exactly this resolution. That preserves the group
# total exactly, puts people roughly where they live, and needs no assumption
# the project does not already make elsewhere. Where a group has no population
# at all to weight by, it splits evenly - rare, and the alternative is
# dropping real commuters on the floor.

library(dplyr)

#' Read one prefecture's census mesh file.
#'
#' @param path e.g. "../data/estat_bike_data/tblT001109Q14.txt"
#' @param columns named list of column codes, from config/observed_cycling.yml
#' @return data frame: mesh_code, htksyori, htksaki, gassan, and one numeric
#'   column per entry in `columns`, with "*" read as NA rather than 0
read_census_mesh <- function(path, columns) {
  if (!file.exists(path)) {
    stop("no census mesh file at ", path, "\n",
         "  Download the prefecture's tblT001109Q<NN>.txt from\n",
         "  https://www.e-stat.go.jp/dbview?sid=0003454513 into data_dir.")
  }

  # Shift-JIS, and a two-row header: codes then Japanese labels. The labels
  # row is skipped rather than parsed - config/observed_cycling.yml carries
  # the code -> meaning mapping, so that the two cannot drift silently.
  header <- utils::read.csv(path, nrows = 1, fileEncoding = "SHIFT-JIS",
                            check.names = FALSE, colClasses = "character")
  raw <- utils::read.csv(path, skip = 2, header = FALSE,
                         fileEncoding = "SHIFT-JIS",
                         check.names = FALSE, colClasses = "character")
  names(raw) <- names(header)

  missing <- setdiff(unlist(columns), names(raw))
  if (length(missing) > 0) {
    stop("the census file has no column(s) ", paste(missing, collapse = ", "),
         "\n  e-Stat renumbers these between census years - check `columns:` ",
         "in config/observed_cycling.yml against the file's own header row.")
  }

  out <- data.frame(
    mesh_code = as.character(raw$KEY_CODE),
    htksyori  = as.character(raw$HTKSYORI),
    htksaki   = as.character(raw$HTKSAKI),
    gassan    = as.character(raw$GASSAN),
    stringsAsFactors = FALSE
  )
  for (name in names(columns)) {
    # "*" is a suppressed value, not a zero. suppressWarnings because that is
    # exactly the coercion being relied on, and it is checked immediately
    # below rather than trusted.
    out[[name]] <- suppressWarnings(as.numeric(raw[[columns[[name]]]]))
  }

  unexpected <- setdiff(unique(out$htksyori), c("0", "1", "2"))
  if (length(unexpected) > 0) {
    stop("unknown HTKSYORI value(s): ", paste(unexpected, collapse = ", "),
         " - the disclosure-control encoding has changed and ",
         "redistribute_suppressed() no longer describes the file.")
  }

  out
}

#' Put suppressed cells back where their people live.
#'
#' Each `HTKSYORI == 1` cell holds the counts for itself and for the cells
#' listed in its `GASSAN`. Those counts are redistributed across the group in
#' proportion to `weight`, and the group's total is preserved exactly.
#'
#' @param mesh data frame from read_census_mesh()
#' @param value_cols which columns to redistribute
#' @param weight named numeric, mesh_code -> population. Cells absent from it
#'   weigh zero; a group with no weight at all splits evenly.
#' @return `mesh` with the value columns redistributed and every "*" cell now
#'   carrying a number
redistribute_suppressed <- function(mesh, value_cols, weight) {
  groups <- which(mesh$htksyori == "1" & nzchar(mesh$gassan))
  if (length(groups) == 0) return(mesh)

  row_of <- stats::setNames(seq_len(nrow(mesh)), mesh$mesh_code)
  moved <- 0L
  orphaned <- 0L

  for (g in groups) {
    members <- strsplit(mesh$gassan[g], ";", fixed = TRUE)[[1]]
    members <- trimws(members)
    idx <- c(g, unname(row_of[members]))
    idx <- idx[!is.na(idx)]
    orphaned <- orphaned + sum(is.na(row_of[members]))
    if (length(idx) < 2) next

    w <- unname(weight[mesh$mesh_code[idx]])
    w[is.na(w)] <- 0
    # A group whose cells the population layer has never heard of still holds
    # real commuters. Splitting evenly is the least-wrong thing available.
    if (sum(w) <= 0) w <- rep(1, length(idx))
    share <- w / sum(w)

    for (col in value_cols) {
      total <- mesh[[col]][g]
      if (is.na(total)) next
      mesh[[col]][idx] <- total * share
    }
    moved <- moved + length(idx) - 1L
  }

  message(sprintf(
    "  disclosure control: %d group(s), %d cell(s) restored by population share%s",
    length(groups), moved,
    if (orphaned > 0) sprintf(", %d listed cell(s) not in this file", orphaned) else ""
  ))

  # Anything still NA was suppressed and never named as anyone's source - it
  # stays NA rather than becoming a zero, so a share computed from it is
  # missing rather than confidently wrong.
  mesh
}
