# 11_export.R
# Final step: writes the two GeoJSON files the Next.js app reads directly.
#
# The segment layer needs a few fields the earlier scripts don't produce
# yet (recommendation text, beneficiary estimate, school/station proximity
# per segment rather than per hex). Filled with placeholders below -
# turning "infra_gap = high" into an actual recommendation string is a
# judgment call worth making deliberately (by hand for your first pilot
# segments, or scripted once you decide the rule) rather than guessed here.

source("R/utils_config.R")
source("R/export_geojson.R")
library(sf)

cfg <- load_study_area()
hexes    <- sf::st_read(sprintf("output/%s_hexgrid_scored.gpkg", cfg$name), quiet = TRUE)
segments <- sf::st_read(sprintf("output/%s_segments.gpkg", cfg$name), quiet = TRUE)

segments$way_id                  <- seq_len(nrow(segments))
segments$length_m                <- as.numeric(sf::st_length(segments))
segments$infra_gap               <- ifelse(segments$lts >= 3, "high", "low")
segments$existing_cycling        <- NA_character_   # TODO: no direct source yet, see docs
segments$school_nearby           <- NA              # TODO: join from 08_join_poi.R's output
segments$station_nearby          <- NA              # TODO: same
segments$recommendation          <- NA_character_   # TODO: fill manually for pilot segments first
segments$estimated_beneficiaries <- NA_integer_      # TODO: derive from nearby hex population

export_hex_layer(hexes, "output/hexagons.geojson")
export_segment_layer(segments, "output/segments.geojson")

message("Exported hexagons.geojson and segments.geojson to the Next.js app")
