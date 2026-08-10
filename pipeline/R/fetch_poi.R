# fetch_poi.R
# Reads commercial/dining points of interest from the local .osm.pbf -
# used for two things: the "attraction" side of hex demand (people cycle
# TO shops/restaurants, not just from home) and a proxy for informal
# on-street parking (roads fronted by dense shops/restaurants/services are
# where drivers commonly stop briefly to run errands in Japan, even
# without a marked parking lane - see score_lts.R).
#
# Same local-file approach as study_area_bbox_sf() in utils_config.R and
# get_osm_roads() in fetch_osm.R - no separate network source needed,
# since this is already in the pbf the road network comes from.
#
# Needs the osmextract package.

library(osmextract)
library(sf)
library(dplyr)

# OSM tag values covering the destination categories relevant here. Not
# exhaustive - extend if your area has other common destinations worth
# counting (e.g. shop=pharmacy, amenity=bank).
POI_SHOP_TAGS <- c(
  "supermarket", "convenience", "bakery", "clothes", "laundry",
  "dry_cleaning", "hairdresser", "pharmacy"
)
POI_AMENITY_TAGS <- c(
  "restaurant", "cafe", "fast_food", "bar", "izakaya"
)

#' Load shop/restaurant/service POIs for the study area from the local
#' .osm.pbf, clipped to the study area boundary.
#'
#' @param pbf_path path to the same .osm.pbf used for roads/boundary
#' @param boundary sf/sfc polygon used to clip the extract (WGS84)
#' @return sf POINT, one row per POI, columns: shop, amenity, name
get_poi <- function(pbf_path, boundary) {
  points <- osmextract::oe_read(
    pbf_path,
    layer = "points",
    extra_tags = c("shop", "amenity", "name"),
    boundary = boundary,
    boundary_type = "clipsrc",     # same reliable approach as fetch_osm.R -
    force_vectortranslate = TRUE,  # custom vectortranslate_options previously
    quiet = FALSE                  # caused extra_tags columns to disappear
  )

  points |>
    dplyr::filter(shop %in% POI_SHOP_TAGS | amenity %in% POI_AMENITY_TAGS)
}
