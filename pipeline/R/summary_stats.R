# summary_stats.R
# Rolls up hex- and segment-level scores into study-area-wide headline
# numbers - the kind of figures worth putting in front of a city official
# on one slide, rather than requiring them to explore the full map.

library(dplyr)
library(sf)

#' Compute study-area-wide summary statistics.
#'
#' @param hexes scored hex data frame/sf, post score_potential()/score_gap()/
#'   compute_hex_roi()
#' @param segments scored segment data frame/sf, post score_lts()
#' @param poi_count,schools_count,stations_count raw counts of each POI
#'   type actually present in the study area - pass nrow() of the
#'   respective layers, NOT the per-hex "nearby" columns, which
#'   deliberately double-count since hexes' 1km catchment radii overlap
#' @param gap_threshold gap_score above which a hex counts as a "missed
#'   opportunity" for the headline count below. 0.2 is a starting point -
#'   tune once you see the real distribution for your area.
#' @param observed_cycling optional list from summarise_observed_cycling() -
#'   the one measured figure in the file, carried alongside the modelled ones
#'   rather than folded into them
#' @return a named list, ready for jsonlite::toJSON()
compute_study_area_summary <- function(hexes, segments,
                                        poi_count, schools_count, stations_count,
                                        gap_threshold = 0.2,
                                        observed_cycling = NULL) {

  segments_df <- sf::st_drop_geometry(segments)
  hexes_df    <- sf::st_drop_geometry(hexes)

  total_length_km <- sum(segments_df$length_m, na.rm = TRUE) / 1000
  high_stress_length_km <- sum(segments_df$length_m[segments_df$lts >= 3], na.rm = TRUE) / 1000

  # Existing provision. Reported as length by kind rather than a single
  # "km of cycleway" figure because the three kinds are not
  # interchangeable: a shared bike/pedestrian path is legal provision that
  # a planner cannot claim as a cycle route with a straight face, and
  # summing it with dedicated cycleway km is how a network gets overstated.
  # `cycleway_type` is NA on everything that is not cycling infrastructure
  # (see classify_cycleway_type() in score_lts.R).
  cycleway_length_km_by_type <- function(type) {
    round(sum(segments_df$length_m[
      !is.na(segments_df$cycleway_type) & segments_df$cycleway_type == type
    ], na.rm = TRUE) / 1000, 1)
  }
  cycle_infra_length_km <- sum(
    segments_df$length_m[!is.na(segments_df$cycleway_type)], na.rm = TRUE
  ) / 1000
  no_sidewalk_length_km <- sum(segments_df$length_m[!segments_df$sidewalk_available], na.rm = TRUE) / 1000
  no_safe_option_length_km <- sum(
    segments_df$length_m[segments_df$lts >= 3 & !segments_df$sidewalk_available],
    na.rm = TRUE
  ) / 1000

  list(
    network = list(
      total_segments = nrow(segments_df),
      total_length_km = round(total_length_km, 1),
      lts_distribution = as.list(table(segments_df$lts)),
      pct_high_stress_length = round(100 * high_stress_length_km / total_length_km, 1),
      pct_no_sidewalk_length = round(100 * no_sidewalk_length_km / total_length_km, 1),
      # "No safe option" = stressful road AND no sidewalk workaround either -
      # the strongest possible case for intervention, since there's nowhere
      # comfortable to ride, on-road or off.
      pct_no_safe_option_length = round(100 * no_safe_option_length_km / total_length_km, 1),
      pct_likely_informal_parking = round(100 * mean(segments_df$likely_informal_parking, na.rm = TRUE), 1)
    ),
    existing_cycling_network = list(
      total_length_km = round(cycle_infra_length_km, 1),
      pct_of_network_length = round(100 * cycle_infra_length_km / total_length_km, 1),
      dedicated_km = cycleway_length_km_by_type("dedicated"),
      shared_path_km = cycleway_length_km_by_type("shared_path"),
      on_road_km = cycleway_length_km_by_type("on_road")
    ),
    destinations = list(
      shops_and_restaurants = poi_count,
      schools = schools_count,
      stations = stations_count
    ),
    demand = list(
      total_population = round(sum(hexes_df$population, na.rm = TRUE)),
      avg_potential_score = round(mean(hexes_df$potential_score, na.rm = TRUE), 3),
      avg_gap_score = round(mean(hexes_df$gap_score, na.rm = TRUE), 3),
      missed_opportunity_hexes = sum(hexes_df$gap_score > gap_threshold, na.rm = TRUE),
      population_in_missed_opportunity_hexes = round(
        sum(hexes_df$population[hexes_df$gap_score > gap_threshold], na.rm = TRUE)
      )
    ),
    # The only measurement here. Everything above and below it is modelled,
    # and keeping it in its own block rather than merged into `demand` is the
    # point: a reader has to be able to see which figures were observed and
    # which were derived, and a merged block would let the modelled ones
    # borrow this one's authority. NULL until config/observed_cycling.yml is
    # filled in - absent rather than guessed.
    observed = observed_cycling,

    roi_scenario = list(
      note = "Illustrative order-of-magnitude estimates - see R/score_roi.R for assumptions and sources",
      daily_car_trips = round(sum(hexes_df$roi_car_trips_per_day, na.rm = TRUE)),
      daily_congestion_cost_yen = round(sum(hexes_df$roi_congestion_cost_yen_day, na.rm = TRUE)),
      daily_operating_cost_yen = round(sum(hexes_df$roi_operating_cost_yen_day, na.rm = TRUE)),
      daily_shifted_trips = round(sum(hexes_df$roi_shifted_trips_per_day, na.rm = TRUE)),
      daily_congestion_savings_yen = round(sum(hexes_df$roi_congestion_savings_yen_day, na.rm = TRUE)),
      daily_operating_savings_yen = round(sum(hexes_df$roi_operating_savings_yen_day, na.rm = TRUE)),
      daily_emissions_avoided_kg = round(sum(hexes_df$roi_emissions_avoided_kg_day, na.rm = TRUE), 1),
      daily_health_benefit_yen = round(sum(hexes_df$roi_health_benefit_yen_day, na.rm = TRUE)),
      parking_spaces_freed = round(sum(hexes_df$roi_parking_spaces_freed, na.rm = TRUE), 1)
    )
  )
}
