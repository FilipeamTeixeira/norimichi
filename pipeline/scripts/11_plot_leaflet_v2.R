library(sf)
library(leaflet)

# ============================================================
# LOAD DATA
# ============================================================

hex <- st_read(
  "output/hexagons.geojson",
  quiet = TRUE
) |>
  st_transform(4326)

segments <- st_read(
  "output/segments.geojson",
  quiet = TRUE
) |>
  st_transform(4326)


# ============================================================
# HEXAGON PALETTES
# ============================================================

pal_population <- colorNumeric(
  "YlOrRd", hex$population, na.color = "transparent"
)

pal_production <- colorNumeric(
  "YlOrRd", hex$production_score, na.color = "transparent"
)

pal_attraction <- colorNumeric(
  "YlGnBu", hex$attraction_score, na.color = "transparent"
)

pal_demand <- colorNumeric(
  "YlOrRd", hex$potential_score, na.color = "transparent"
)

pal_stress <- colorNumeric(
  "PuBu", hex$stress_score, na.color = "transparent"
)

pal_infra <- colorNumeric(
  "YlGn", hex$infra_quality_score, na.color = "transparent"
)

pal_gap <- colorNumeric(
  "viridis", hex$gap_score, na.color = "transparent"
)

pal_schools <- colorNumeric(
  "YlGn", hex$schools_nearby, na.color = "transparent"
)

pal_stations <- colorNumeric(
  "YlOrBr", hex$stations_nearby, na.color = "transparent"
)

pal_shops <- colorNumeric(
  "YlOrRd", hex$shops_nearby, na.color = "transparent"
)

pal_flat <- colorNumeric(
  "Greens", hex$flat_terrain, na.color = "transparent"
)


# ============================================================
# SEGMENT PALETTES
# ============================================================

# Numeric
pal_lts <- colorNumeric(
  palette = "YlOrRd",
  domain = range(segments$lts, na.rm = TRUE),
  na.color = "transparent"
)

pal_length <- colorNumeric(
  palette = "Blues",
  domain = range(segments$length_m, na.rm = TRUE),
  na.color = "transparent"
)

# Categorical
pal_infra_gap <- colorFactor(
  palette = c("low" = "#2ca25f", "high" = "#de2d26"),
  domain = c("low", "high"),
  na.color = "transparent"
)

# Logical
pal_sidewalk <- colorFactor(
  palette = c("FALSE" = "#bdbdbd", "TRUE" = "#2171b5"),
  domain = c(FALSE, TRUE),
  na.color = "transparent"
)

pal_parking <- colorFactor(
  palette = c("FALSE" = "#bdbdbd", "TRUE" = "#e6550d"),
  domain = c(FALSE, TRUE),
  na.color = "transparent"
)


# ============================================================
# SEGMENT CATEGORICAL PALETTES
# ============================================================

binary_pal <- function(x) {
  vals <- sort(unique(na.omit(x)))

  colorFactor(
    palette = c("#d9d9d9", "#2171b5"),
    domain = vals,
    na.color = "transparent"
  )
}

pal_sidewalk <- binary_pal(segments$sidewalk_available)

pal_parking <- binary_pal(
  segments$likely_informal_parking
)

pal_school <- binary_pal(
  segments$school_nearby
)

pal_station <- binary_pal(
  segments$station_nearby
)

pal_cycling <- binary_pal(
  segments$existing_cycling
)


# ============================================================
# POPUPS
# ============================================================

hex_popup <- ~paste0(
  "<strong>Hex ID:</strong> ", hex_id,
  "<br><strong>Population:</strong> ", population,
  "<br><strong>Production:</strong> ", round(production_score, 3),
  "<br><strong>Attraction:</strong> ", round(attraction_score, 3),
  "<br><strong>Demand:</strong> ", round(potential_score, 3),
  "<br><strong>Stress:</strong> ", round(stress_score, 3),
  "<br><strong>Infrastructure:</strong> ",
  round(infra_quality_score, 3),
  "<br><strong>Gap:</strong> ", round(gap_score, 3),
  "<br><strong>Schools nearby:</strong> ", schools_nearby,
  "<br><strong>Stations nearby:</strong> ", stations_nearby,
  "<br><strong>Shops nearby:</strong> ", shops_nearby,
  "<br><strong>Flat terrain:</strong> ", round(flat_terrain, 3)
)

segment_popup <- ~paste0(
  "<strong>Way ID:</strong> ", way_id,
  "<br><strong>Length:</strong> ", round(length_m, 1), " m",
  "<br><strong>LTS:</strong> ", lts,
  "<br><strong>Sidewalk:</strong> ", sidewalk_available,
  "<br><strong>Informal parking:</strong> ", likely_informal_parking,
  "<br><strong>Infrastructure gap:</strong> ", infra_gap,
  "<br><strong>School nearby:</strong> ", school_nearby,
  "<br><strong>Station nearby:</strong> ", station_nearby,
  "<br><strong>Existing cycling:</strong> ", existing_cycling,
  "<br><strong>Recommendation:</strong> ", recommendation,
  "<br><strong>Estimated beneficiaries:</strong> ", estimated_beneficiaries
)


# ============================================================
# MAP
# ============================================================

m <- leaflet(
  options = leafletOptions(
    preferCanvas = TRUE
  )
) %>%

  addProviderTiles(
    providers$CartoDB.Positron
  )


# ============================================================
# HEXAGON LAYERS
# ============================================================

m <- m %>%

  addPolygons(
    data = hex,
    group = "Population",
    fillColor = ~pal_population(population),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Production score",
    fillColor = ~pal_production(production_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Attraction score",
    fillColor = ~pal_attraction(attraction_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Demand score",
    fillColor = ~pal_demand(potential_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Stress score",
    fillColor = ~pal_stress(stress_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Infrastructure quality",
    fillColor = ~pal_infra(infra_quality_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Gap score",
    fillColor = ~pal_gap(gap_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Schools nearby",
    fillColor = ~pal_schools(schools_nearby),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Stations nearby",
    fillColor = ~pal_stations(stations_nearby),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Shops nearby",
    fillColor = ~pal_shops(shops_nearby),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  ) %>%

  addPolygons(
    data = hex,
    group = "Flat terrain",
    fillColor = ~pal_flat(flat_terrain),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = hex_popup
  )


# ============================================================
# SEGMENT LAYERS
# ============================================================

m <- m %>%

  # LTS
  addPolylines(
    data = segments,
    group = "Segments: LTS",
    color = ~pal_lts(lts),
    weight = 4,
    opacity = 0.9,
    popup = segment_popup
  ) %>%

  # Length
  addPolylines(
    data = segments,
    group = "Segments: Length",
    color = ~pal_length(length_m),
    weight = 4,
    opacity = 0.9,
    popup = segment_popup
  ) %>%

  # Infrastructure gap
  addPolylines(
    data = segments,
    group = "Segments: Infrastructure gap",
    color = ~pal_infra_gap(infra_gap),
    weight = 4,
    opacity = 0.9,
    popup = segment_popup
  ) %>%

  # Sidewalk
  addPolylines(
    data = segments,
    group = "Segments: Sidewalk available",
    color = ~pal_sidewalk(sidewalk_available),
    weight = 4,
    opacity = 0.9,
    popup = segment_popup
  ) %>%

  # Informal parking
  addPolylines(
    data = segments,
    group = "Segments: Informal parking",
    color = ~pal_parking(likely_informal_parking),
    weight = 4,
    opacity = 0.9,
    popup = segment_popup
  )

# ============================================================
# LAYER CONTROL
# ============================================================

m <- m %>%

  addLayersControl(
    overlayGroups = c(
      # Hexagons
      "Population",
      "Production score",
      "Attraction score",
      "Demand score",
      "Stress score",
      "Infrastructure quality",
      "Gap score",
      "Schools nearby",
      "Stations nearby",
      "Shops nearby",
      "Flat terrain",

      # Segments
      "Segments: LTS",
      "Segments: Length",
      "Segments: Infrastructure gap",
      "Segments: Sidewalk available",
      "Segments: Informal parking"
    ),
    options = layersControlOptions(
      collapsed = FALSE
    )
  ) %>%

  hideGroup(c(
    "Population",
    "Production score",
    "Attraction score",
    "Demand score",
    "Stress score",
    "Infrastructure quality",
    "Gap score",
    "Schools nearby",
    "Stations nearby",
    "Shops nearby",
    "Flat terrain",

    "Segments: LTS",
    "Segments: Length",
    "Segments: Infrastructure gap",
    "Segments: Sidewalk available",
    "Segments: Informal parking"
  ))


# ============================================================
# DISPLAY
# ============================================================

m

