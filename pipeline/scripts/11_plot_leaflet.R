library(sf)
library(leaflet)

# ------------------------------------------------------------
# Load hexagons
# ------------------------------------------------------------

hex <- st_read(
  "output/hexagons.geojson",
  quiet = TRUE
)

# Transform to WGS84 for Leaflet
hex <- st_transform(hex, 4326)


# ------------------------------------------------------------
# Fields
# ------------------------------------------------------------

layers <- c(
  "population",
  "production_score",
  "attraction_score",
  "demand_score",
  "stress_score",
  "infra_quality_score",
  "gap_score",
  "schools_nearby",
  "stations_nearby",
  "shops_nearby",
  "flat_terrain"
)

# Check fields
missing <- setdiff(layers, names(hex))

if (length(missing) > 0) {
  stop(
    "Missing fields: ",
    paste(missing, collapse = ", ")
  )
}


# ------------------------------------------------------------
# Colour palettes
# ------------------------------------------------------------

pal_population <- colorNumeric(
  "YlOrRd",
  domain = hex$population,
  na.color = "transparent"
)

pal_production <- colorNumeric(
  "YlOrRd",
  domain = hex$production_score,
  na.color = "transparent"
)

pal_attraction <- colorNumeric(
  "YlGnBu",
  domain = hex$attraction_score,
  na.color = "transparent"
)

pal_demand <- colorNumeric(
  "YlOrRd",
  domain = hex$demand_score,
  na.color = "transparent"
)

pal_stress <- colorNumeric(
  "PuBu",
  domain = hex$stress_score,
  na.color = "transparent"
)

pal_infra <- colorNumeric(
  "YlGn",
  domain = hex$infra_quality_score,
  na.color = "transparent"
)

pal_gap <- colorNumeric(
  "viridis",
  domain = hex$gap_score,
  na.color = "transparent"
)

pal_schools <- colorNumeric(
  "YlGn",
  domain = hex$schools_nearby,
  na.color = "transparent"
)

pal_stations <- colorNumeric(
  "YlOrBr",
  domain = hex$stations_nearby,
  na.color = "transparent"
)

pal_shops <- colorNumeric(
  "YlOrRd",
  domain = hex$shops_nearby,
  na.color = "transparent"
)

pal_flat <- colorNumeric(
  "Greens",
  domain = hex$flat_terrain,
  na.color = "transparent"
)


# ------------------------------------------------------------
# Helper for popups
# ------------------------------------------------------------

popup <- ~paste0(
  "<strong>Hex ID:</strong> ", hex_id,
  "<br><strong>Population:</strong> ", population,
  "<br><strong>Production:</strong> ", round(production_score, 3),
  "<br><strong>Attraction:</strong> ", round(attraction_score, 3),
  "<br><strong>Demand:</strong> ", round(demand_score, 3),
  "<br><strong>Stress:</strong> ", round(stress_score, 3),
  "<br><strong>Infrastructure quality:</strong> ",
  round(infra_quality_score, 3),
  "<br><strong>Gap:</strong> ", round(gap_score, 3),
  "<br><strong>Schools nearby:</strong> ", schools_nearby,
  "<br><strong>Stations nearby:</strong> ", stations_nearby,
  "<br><strong>Shops nearby:</strong> ", shops_nearby,
  "<br><strong>Flat terrain:</strong> ", round(flat_terrain, 3)
)


# ------------------------------------------------------------
# Map
# ------------------------------------------------------------

m <- leaflet(
  options = leafletOptions(
    preferCanvas = TRUE
  )
) %>%

  addProviderTiles(
    providers$CartoDB.Positron
  ) %>%


  # Population
  addPolygons(
    data = hex,
    group = "Population",
    fillColor = ~pal_population(population),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Production
  addPolygons(
    data = hex,
    group = "Production score",
    fillColor = ~pal_production(production_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Attraction
  addPolygons(
    data = hex,
    group = "Attraction score",
    fillColor = ~pal_attraction(attraction_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Demand
  addPolygons(
    data = hex,
    group = "Demand score",
    fillColor = ~pal_demand(demand_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Stress
  addPolygons(
    data = hex,
    group = "Stress score",
    fillColor = ~pal_stress(stress_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Infrastructure quality
  addPolygons(
    data = hex,
    group = "Infrastructure quality",
    fillColor = ~pal_infra(infra_quality_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Gap
  addPolygons(
    data = hex,
    group = "Gap score",
    fillColor = ~pal_gap(gap_score),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Schools
  addPolygons(
    data = hex,
    group = "Schools nearby",
    fillColor = ~pal_schools(schools_nearby),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Stations
  addPolygons(
    data = hex,
    group = "Stations nearby",
    fillColor = ~pal_stations(stations_nearby),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Shops
  addPolygons(
    data = hex,
    group = "Shops nearby",
    fillColor = ~pal_shops(shops_nearby),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Flat terrain
  addPolygons(
    data = hex,
    group = "Flat terrain",
    fillColor = ~pal_flat(flat_terrain),
    fillOpacity = 0.7,
    color = "#444444",
    weight = 0.2,
    opacity = 0.5,
    popup = popup
  ) %>%

  # Layer switcher
  addLayersControl(
    overlayGroups = c(
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
      "Flat terrain"
    ),
    options = layersControlOptions(
      collapsed = FALSE
    )
  )


# ------------------------------------------------------------
# Display
# ------------------------------------------------------------

m
