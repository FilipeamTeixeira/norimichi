# fetch_schools.R
# One school layer out of two sources that disagree about what exists.
#
# WHY THIS FILE EXISTS
#
# KSJ P29 was the only source of schools, and it is incomplete - it misses
# schools that are plainly there on the ground. That matters more here than a
# missing shop would, because schools are load-bearing in three separate
# places: `schools_nearby` on the hex grid (08), `school_nearby` on segments
# (05b), and every origin on the Access page (13). A school KSJ has never
# heard of is invisible in all three, and invisible in the way that is hardest
# to notice - no error, no gap, just a number that is quietly too small.
#
# So OSM fills in behind it. Same .osm.pbf the road network and the boundary
# already come from, so no new dependency and no network call.
#
# THE TWO HARD PARTS
#
# 1. **Deciding what an OSM `amenity=school` actually is.** In Japan the tag
#    is also used for 学習塾 and 予備校 - cram schools, which are private
#    businesses in an office suite, not places a child rides to every morning.
#    Nothing in the tagging separates them reliably. The name does: Japanese
#    school names carry their level as a suffix (小学校 / 中学校 / 高等学校),
#    and a cram school does not. So classification is by name, and anything
#    that does not classify is left out **and reported**, rather than dropped
#    in silence. See `report_unclassified()`.
#
# 2. **Not counting the same school twice.** A school is usually in both
#    sources, and often twice within OSM alone - once as a node, once as the
#    campus polygon. `merge_schools()` matches on name and position, and both
#    rules are stated with the case they are there to catch.
#
# WHAT COMES OUT
#
# A single point layer with a source-independent schema, so nothing
# downstream has to know which source a school came from:
#
#   school_id     "ksj:<学校コード>" or "osm:<node|way>/<id>"
#   name          the school's name
#   address       KSJ's 所在地; NA for OSM, which rarely carries one
#   school_class  normalised level - see SCHOOL_CLASSES
#   source        "ksj" or "osm"
#
# The KSJ columns (P29_*) do not travel. Everything that used to read them
# reads the five above instead.

library(osmextract)
library(sf)
library(dplyr)

source("R/geometry_points.R")

#' The normalised levels. Wider than the Access page's own filter on purpose:
#' this layer feeds the hex and segment counts too, which count every school
#' whatever its level, so the vocabulary has to cover everything both sources
#' can produce. ACCESS_SCHOOL_CLASSES in score_access.R picks from this.
SCHOOL_CLASSES <- c(
  "elementary", "junior_high", "high", "international",
  "kindergarten", "special", "tertiary", "vocational"
)

#' KSJ P29 学校分類コード -> level.
#'
#' 16003 中等教育学校 and a combined 中高一貫 both take `junior_high`: they
#' serve two levels at one site, and the younger cohort is the one the access
#' question is about.
#'
#' 16015 各種学校 -> `international` is a **local** reading, not a definition.
#' The code is a legal category that elsewhere also covers driving schools and
#' evening language schools; in this study area it is the international and
#' ethnic schools on the Yamate bluff. Re-check it if the study area moves.
KSJ_SCHOOL_CLASSES <- c(
  "16001" = "elementary",
  "16002" = "junior_high",
  "16003" = "junior_high",
  "16004" = "high",
  "16005" = "tertiary",
  "16007" = "tertiary",
  "16011" = "kindergarten",
  "16012" = "special",
  "16013" = "kindergarten",
  "16015" = "international",
  "16016" = "vocational"
)

#' Name patterns -> level, tried in order.
#'
#' Order is the classification rule, not a formality. A 中高一貫 school is
#' named 「…中学校・高等学校」and matches two patterns; elementary comes first,
#' then junior high, so a combined school lands on its youngest cohort - the
#' same choice KSJ_SCHOOL_CLASSES makes for 中等教育学校.
#'
#' 特別支援学校 and 高等専修学校 are tested **before** the plain 高等学校 and
#' 学校 patterns they contain, or every one of them would be classified as an
#' ordinary high school.
OSM_SCHOOL_NAME_CLASSES <- c(
  "特別支援学校|養護学校|盲学校|聾学校"                = "special",
  "幼稚園|保育園|保育所|こども園|幼保"                  = "kindergarten",
  "小学校|初等部|Elementary School|Primary School"       = "elementary",
  "高等専修学校|専修学校|専門学校"                      = "vocational",
  "中学校|中等教育学校|中学部|Junior High"              = "junior_high",
  "高等学校|高校|高等部|High School"                    = "high",
  "インターナショナルスクール|International School|中華學院|中華学院|朝鮮学校|外国人学校" = "international",
  "大学|高等専門学校|College|University"                = "tertiary"
)

#' Classify a school name into one of SCHOOL_CLASSES, or NA if nothing matches.
#'
#' NA is the interesting answer: it is how a 学習塾 tagged `amenity=school`
#' comes out, and it is what `report_unclassified()` prints so the residue is
#' looked at rather than assumed empty.
classify_school_name <- function(name) {
  out <- rep(NA_character_, length(name))
  for (pattern in names(OSM_SCHOOL_NAME_CLASSES)) {
    hit <- is.na(out) & !is.na(name) & grepl(pattern, name)
    out[hit] <- OSM_SCHOOL_NAME_CLASSES[[pattern]]
  }
  out
}

#' Pull one tag out of GDAL's `other_tags` hstore column.
#'
#' `name:en` is read this way rather than promoted with `extra_tags` because
#' the promoted column's name is `name:en` or `name.en` depending on the GDAL
#' and sf versions in play, and a silently-absent column here is a silently
#' dropped school.
other_tag_value <- function(other_tags, key) {
  x <- as.character(other_tags)
  out <- rep(NA_character_, length(x))
  if (length(x) == 0) return(out)

  has <- !is.na(x) & grepl(sprintf('"%s"=>"', key), x, fixed = TRUE)
  if (!any(has)) return(out)

  out[has] <- sub(sprintf('.*"%s"=>"([^"]*)".*', key), "\\1", x[has])
  out
}

#' Separator for the alternative-name list carried on one column.
ALT_NAME_SEP <- "\u001f"

#' Every name a feature is known by, plus the one to display it under.
#'
#' OSM does not guarantee a `name`. 横浜インターナショナルスクール is tagged
#' with `name:en`, a phone number, a website and a `wikipedia` link, and **no
#' `name` at all** - so reading only `name` dropped it as unnamed, and the
#' international schools are exactly the population most likely to be tagged
#' that way.
#'
#' The alternatives are not only for classification. They are what lets the
#' merge recognise a school across languages: KSJ knows this school as
#' 「横浜インターナショナルスクール」and the OSM feature is named
#' "Yokohama International School", which share no substring at all - but its
#' `wikipedia` tag is `ja:横浜インターナショナルスクール`, which is exactly
#' KSJ's string. Without that the two would both survive as separate schools
#' 1.5km apart, which is the duplicate this whole file exists to avoid.
#'
#' The label prefers Japanese, because the rest of the interface is.
school_names <- function(name, name_ja, name_en, wikipedia) {
  blank <- function(x) is.na(x) | !nzchar(x)
  chr <- function(x) {
    x <- as.character(x)
    x[is.na(x)] <- ""
    x
  }
  name <- chr(name)
  name_ja <- chr(name_ja)
  name_en <- chr(name_en)
  # "ja:横浜インターナショナルスクール" -> the title after the language prefix.
  wiki_ja <- sub("^ja:", "", chr(wikipedia))
  wiki_ja[!grepl("^ja:", chr(wikipedia))] <- ""

  label <- ifelse(!blank(name), name,
                  ifelse(!blank(name_ja), name_ja,
                         ifelse(!blank(wiki_ja), wiki_ja, name_en)))
  label[blank(label)] <- NA_character_

  list(
    label = label,
    alt = paste(name, name_ja, name_en, wiki_ja, sep = ALT_NAME_SEP)
  )
}

#' Split an alt-name string back into its candidates, dropping the empties.
alt_name_list <- function(alt) {
  lapply(strsplit(as.character(alt), ALT_NAME_SEP, fixed = TRUE), function(x) {
    x <- x[!is.na(x) & nzchar(x)]
    unique(x)
  })
}

#' Reduce a school name to the part that identifies it, for matching across
#' sources.
#'
#' KSJ writes 「大鳥小学校」where OSM writes 「横浜市立大鳥小学校」, so the
#' operator prefix has to go or the two never match. Everything up to and
#' including a 「…立」is dropped, along with whitespace of both widths and the
#' punctuation OSM sprinkles through combined names.
normalise_school_name <- function(name) {
  x <- as.character(name)
  x[is.na(x)] <- ""
  # 横浜市立 / 神奈川県立 / 国立 / 私立 ... anything ending in 立, up to 5
  # characters, at the start of the name.
  x <- sub("^.{1,5}立", "", x)
  x <- gsub("[[:space:]　・･,、'’\"“”()（）]", "", x)
  x <- gsub("学校法人|学園|附属|付属", "", x)
  x
}

#' Read schools out of the local .osm.pbf, from both nodes and campus
#' polygons.
#'
#' Both layers, and that is not belt and braces: in Japan most schools are
#' mapped as the campus **area**, so a points-only read would find a minority
#' of them and look like it had worked. Polygons are reduced to a point on the
#' surface, which is what every consumer of this layer wants anyway.
#'
#' @param pbf_path path to the same .osm.pbf used for roads and the boundary
#' @param boundary sf/sfc polygon to clip to (WGS84)
#' @return sf POINT with school_id, name, address, school_class, source
get_osm_schools <- function(pbf_path, boundary) {
  read_layer <- function(layer) {
    osmextract::oe_read(
      pbf_path,
      layer = layer,
      extra_tags = c("amenity", "name"),
      boundary = boundary,
      boundary_type = "clipsrc",
      # Same combination fetch_poi.R settles on: extra_tags with
      # force_vectortranslate, and no custom vectortranslate_options, which
      # made the extra columns vanish.
      force_vectortranslate = TRUE,
      quiet = TRUE
    )
  }

  # `amenity=college` and `=university` are read as well so that the tertiary
  # class is populated from both sources rather than only from KSJ - the hex
  # counts include them, so leaving them to KSJ alone would make the OSM top-up
  # lopsided.
  wanted <- c("school", "kindergarten", "college", "university")

  # The multipolygons read translates the whole layer, which on a regional pbf
  # is minutes rather than seconds. Said out loud so a long pause reads as
  # work rather than as a hang.
  message("Reading OSM schools (the campus-polygon pass is the slow one)...")

  # A node carries its id in `osm_id`; a closed way carries it in
  # `osm_way_id` with `osm_id` empty. Same convention export_geojson.R's
  # osm_canonical_id() handles - not reused, because this file has no business
  # depending on the export layer.
  as_layer <- function(x) {
    if (nrow(x) == 0) return(NULL)
    way <- if ("osm_way_id" %in% names(x)) as.character(x$osm_way_id) else NA_character_
    id <- as.character(x$osm_id)
    kind <- ifelse(!is.na(id) & nzchar(id), paste0("node/", id), paste0("way/", way))
    # `name:en` rides in other_tags. If the translation ever stops emitting
    # that column this must say so rather than quietly classifying every
    # English-named school as unnamed - the exact failure this fixes.
    if (!"other_tags" %in% names(x)) {
      warning("no other_tags column in the OSM read: name:en cannot be read, ",
              "and schools tagged only in English will be dropped as unnamed")
      x$other_tags <- NA_character_
    }
    named <- school_names(
      x$name,
      other_tag_value(x$other_tags, "name:ja"),
      other_tag_value(x$other_tags, "name:en"),
      other_tag_value(x$other_tags, "wikipedia")
    )
    sf::st_sf(
      school_id = paste0("osm:", kind),
      name      = named$label,
      alt_names = named$alt,
      # The centre of the campus, not an arbitrary point inside it - see
      # R/geometry_points.R. On an L-shaped site the difference is the
      # building the pin lands on.
      geometry  = representative_point(sf::st_geometry(x))
    )
  }

  nodes <- read_layer("points") |> dplyr::filter(.data$amenity %in% wanted)
  areas <- read_layer("multipolygons") |> dplyr::filter(.data$amenity %in% wanted)

  message(sprintf("OSM schools: %d node(s), %d campus polygon(s)",
                  nrow(nodes), nrow(areas)))

  parts <- Filter(Negate(is.null), list(as_layer(nodes), as_layer(areas)))
  if (length(parts) == 0) {
    stop("no OSM schools found in the study area - check the pbf covers it, ",
         "and that `amenity` survived the read (see the extra_tags note above)")
  }
  combined <- do.call(rbind, parts)

  combined$address      <- NA_character_
  combined$school_class <- classify_school_name(combined$alt_names)
  combined$source       <- "osm"

  report_unclassified(combined)

  # `alt_names` travels as far as merge_schools() and no further - it is
  # matching scaffolding, not something the map or the Access page has any use
  # for.
  combined[!is.na(combined$school_class),
           c("school_id", "name", "address", "school_class", "source", "alt_names")]
}

#' Print what the name rules threw away.
#'
#' The point of this project's worst bug so far was an include-list that
#' removed rows with no trace (PROJECT_STATUS G.4). Anything the classifier
#' cannot place is listed here, so the residue is a thing somebody has looked
#' at rather than a thing nobody knew about. Expect 学習塾 and unnamed
#' features; anything else in this list is a rule that needs widening.
report_unclassified <- function(schools) {
  left <- schools$name[is.na(schools$school_class)]
  if (length(left) == 0) {
    message("  every OSM school name classified")
    return(invisible(NULL))
  }
  unnamed <- sum(is.na(left) | !nzchar(left))
  named <- sort(unique(left[!is.na(left) & nzchar(left)]))
  message(sprintf("  %d OSM feature(s) not classified and left out (%d unnamed):",
                  length(left), unnamed))
  for (n in named) message("    ", n)
  invisible(named)
}

#' Normalise the KSJ layer into the shared schema.
#'
#' @param schools sf POINT, KSJ P29 as read by 03_download_ksj.R
ksj_schools <- function(schools) {
  sf::st_sf(
    school_id    = paste0("ksj:", schools$P29_002),
    name         = schools$P29_004,
    address      = schools$P29_005,
    school_class = unname(KSJ_SCHOOL_CLASSES[as.character(schools$P29_003)]),
    source       = "ksj",
    geometry     = sf::st_geometry(schools)
  )
}

#' Metric CRS for the distance rules below. Japan Plane Rectangular zone IX,
#' the same value the rest of the pipeline uses.
SCHOOL_METRIC_CRS <- 6677

#' An OSM school this close to a same-named KSJ school is the same school.
#'
#' Generous, because the two sources point at different parts of one campus:
#' KSJ gives a representative point that is often the office, OSM gives the
#' centre of the grounds. Within a ward, two schools sharing a normalised name
#' is not a thing that happens, so the name is doing the work and the distance
#' is only there to stop a name coincidence across the study area.
SCHOOL_NAME_MATCH_M <- 1500

#' An OSM school this close to a KSJ school **of the same level** is the same
#' school even if the names do not match.
#'
#' Catches the name variants normalisation cannot: an English name against a
#' Japanese one, an old name, a typo. Tight, and restricted to a matching
#' level, because two schools of the same level this close together do not
#' exist - where a 小学校 and a 中学校 share a campus, the level check keeps
#' them apart.
SCHOOL_POSITION_MATCH_M <- 150

#' How far a KSJ point may be moved onto its OSM match without the move being
#' called out by name in the log.
#'
#' Not a limit - every match takes OSM's position. It is a reporting
#' threshold, because a move this size is either a school that has relocated
#' or a match that is wrong, and both are things to look at rather than to
#' discover later on a map.
SCHOOL_RELOCATION_REPORT_M <- 250

#' Merge the two sources into one layer: KSJ's attributes, OSM's position.
#'
#' The split is not a compromise, it is what each source is actually good at.
#'
#' KSJ carries the address and the official 学校分類コード, which OSM mostly
#' does not, so its **attributes** win. But its **geometry** is a point
#' geocoded from that address, and the address can be years stale: P29-21 puts
#' 横浜インターナショナルスクール at 山手町258, where it no longer is - OSM has
#' it at 小港2-100-1 with a phone number and a website, **1.5km away**. Saint
#' Maur is 85m out the same way. An earlier version of this function kept KSJ's
#' point on the reasoning that it was "a deliberate representative location";
#' it is not, and the visible symptom was a map with no pin over either school.
#'
#' So a matched pair keeps KSJ's row and takes OSM's coordinates, and every
#' move past SCHOOL_RELOCATION_REPORT_M is printed - a large move is either a
#' relocation or a bad match, and both deserve a look.
#'
#' @param ksj sf POINT from ksj_schools()
#' @param osm sf POINT from get_osm_schools()
#' @return sf POINT, the union, deduplicated
merge_schools <- function(ksj, osm) {
  if (nrow(osm) == 0) return(ksj)
  if (nrow(ksj) == 0) return(osm)

  ksj_m <- sf::st_transform(sf::st_geometry(ksj), SCHOOL_METRIC_CRS)
  osm_m <- sf::st_transform(sf::st_geometry(osm), SCHOOL_METRIC_CRS)

  ksj_key <- normalise_school_name(ksj$name)
  # Every name the OSM feature is known by, not just its label - see
  # school_names(). This is what lets 「横浜インターナショナルスクール」 find
  # "Yokohama International School" via its `wikipedia` tag.
  osm_keys <- lapply(alt_name_list(osm$alt_names), normalise_school_name)

  by_name <- sf::st_is_within_distance(osm_m, ksj_m, SCHOOL_NAME_MATCH_M)
  by_position <- sf::st_is_within_distance(osm_m, ksj_m, SCHOOL_POSITION_MATCH_M)

  # Which KSJ row each OSM row is, or NA. An index rather than a flag, because
  # a match is now also the instruction to move that KSJ row's coordinates.
  matched <- vapply(seq_len(nrow(osm)), function(i) {
    near_name <- by_name[[i]]
    keys <- osm_keys[[i]]
    keys <- keys[nzchar(keys)]

    if (length(keys) > 0 && length(near_name) > 0) {
      # Either containing the other, so 「大鳥小学校」matches
      # 「大鳥小学校・大鳥中学校」as well as itself. Any of the feature's names
      # will do - a match on the English one is as good as on the Japanese.
      same <- Reduce(`|`, lapply(keys, function(key) {
        grepl(key, ksj_key[near_name], fixed = TRUE) |
          vapply(ksj_key[near_name], function(k) {
            nzchar(k) && grepl(k, key, fixed = TRUE)
          }, logical(1))
      }))
      if (any(same)) return(near_name[which(same)[1]])
    }

    near_position <- by_position[[i]]
    same_class <- which(ksj$school_class[near_position] == osm$school_class[i])
    if (length(same_class) == 0) return(NA_integer_)
    near_position[same_class[1]]
  }, integer(1))

  # Take OSM's position for every matched pair. Built as one replacement
  # geometry column rather than assigned row by row into `ksj`, which would
  # copy the whole layer per match. Where two OSM rows land on one KSJ row the
  # first wins - after dedupe_schools() that is a rare tie, and picking
  # deterministically matters more than which one it picks.
  geometry <- sf::st_geometry(ksj)
  osm_geometry <- sf::st_geometry(osm)
  taken <- rep(FALSE, nrow(ksj))
  moved <- 0L

  for (i in which(!is.na(matched))) {
    k <- matched[i]
    if (taken[k]) next
    taken[k] <- TRUE
    moved <- moved + 1L

    shift <- as.numeric(sf::st_distance(ksj_m[k], osm_m[i]))
    geometry[k] <- osm_geometry[i]
    if (shift >= SCHOOL_RELOCATION_REPORT_M) {
      message(sprintf("  moved %.0fm onto its OSM position: %s",
                      shift, ksj$name[k]))
    }
  }
  sf::st_geometry(ksj) <- geometry

  message(sprintf(
    "Merged schools: %d from KSJ + %d from OSM, of which %d already in KSJ (%d repositioned) -> %d total",
    nrow(ksj), nrow(osm), sum(!is.na(matched)), moved,
    nrow(ksj) + sum(is.na(matched))
  ))
  # The residual accuracy problem, stated rather than left to be discovered on
  # a map. These rows still sit where KSJ's geocoder put their street address,
  # which is the thing that puts a marker on the building next door - OSM has
  # nothing to correct them with.
  message(sprintf(
    "  %d KSJ school(s) kept their own geocoded point - no OSM match, so those markers are only as good as KSJ's address geocoding",
    nrow(ksj) - moved
  ))

  added <- osm[is.na(matched), ]
  if (nrow(added) > 0) {
    message("  new from OSM:")
    for (i in seq_len(nrow(added))) {
      message(sprintf("    [%s] %s", added$school_class[i],
                      if (is.na(added$name[i])) "(unnamed)" else added$name[i]))
    }
  }

  # `alt_names` is dropped here: it exists to match on and has no meaning to
  # anything downstream.
  rbind(ksj, added[, names(ksj)])
}

#' Drop schools that are the same school twice **within one source**.
#'
#' OSM maps a school as a node and as the campus polygon often enough that
#' this is the common case, not an edge one. Same rules as the cross-source
#' merge, applied within the layer; the first row of each group survives, and
#' since nodes are read before polygons that is the node.
dedupe_schools <- function(schools) {
  if (nrow(schools) < 2) return(schools)

  xy <- sf::st_transform(sf::st_geometry(schools), SCHOOL_METRIC_CRS)
  # Every name each feature carries, for the same reason the cross-source
  # merge uses them: the node may be tagged only in English and the campus
  # polygon only in Japanese, and those are one school.
  keys <- if ("alt_names" %in% names(schools)) {
    lapply(alt_name_list(schools$alt_names), normalise_school_name)
  } else {
    as.list(normalise_school_name(schools$name))
  }
  shares_name <- function(a, b) {
    a <- a[nzchar(a)]
    b <- b[nzchar(b)]
    length(a) > 0 && length(b) > 0 && length(intersect(a, b)) > 0
  }

  # Two radius queries rather than a distance call per candidate pair: in a
  # dense ward each school has dozens of neighbours inside the name radius,
  # and st_distance() per pair is the whole cost of this function.
  near_name <- sf::st_is_within_distance(xy, xy, SCHOOL_NAME_MATCH_M)
  near_position <- sf::st_is_within_distance(xy, xy, SCHOOL_POSITION_MATCH_M)

  keep <- rep(TRUE, nrow(schools))
  for (i in seq_len(nrow(schools))) {
    if (!keep[i]) next
    close <- near_position[[i]]
    for (j in near_name[[i]]) {
      if (j <= i || !keep[j]) next
      same_name <- shares_name(keys[[i]], keys[[j]])
      same_class <- isTRUE(schools$school_class[i] == schools$school_class[j])
      if (same_name || (j %in% close && same_class)) keep[j] <- FALSE
    }
  }

  if (any(!keep)) {
    message(sprintf("  %d duplicate(s) within the layer removed", sum(!keep)))
  }
  schools[keep, ]
}
