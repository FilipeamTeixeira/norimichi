# score_roi.R
# "Cycling return on investment" estimates per hex - congestion cost,
# vehicle operating cost, emissions, and a simplified health-benefit
# proxy for a hypothetical mode shift from car to bike on short trips,
# plus what that shift could free up in parking demand.
#
# IMPORTANT - read before putting these numbers in front of anyone:
# Two very different kinds of number are mixed together here.
#
#   SOURCED, current, official figures (MLIT's 費用便益分析マニュアル,
#   令和7年8月改訂 - 令和6年価格, the standard unit values Japanese road
#   project cost-benefit analyses use):
#     - Time value: ¥43.74/minute/passenger car
#     - Vehicle operating cost: ¥24.43/km, urban road (市街地), 40km/h
#     https://www.mlit.go.jp/road/ir/ir-hyouka/ben-eki_2.pdf
#     (independently confirmed via a 2026 University of Tokyo public
#     policy paper citing the same manual and figures)
#
#   ILLUSTRATIVE DEFAULTS, not sourced from measured local data - flagged
#   individually below (trip generation rate, short-trip share, current
#   car mode share, average trip length/duration, CO2 factor, health
#   value per km cycled, parking-space assumption, and the assumed
#   mode-shift share itself). There is no direct open dataset for most of
#   these at neighbourhood level (see the wider project's data-sources
#   notes).
#
# Treat the resulting yen figures as order-of-magnitude - useful for
# comparing hexes against each other and for framing a conversation, NOT
# as an audit-ready cost-benefit analysis. For a properly rigorous
# health-benefit number specifically, use the WHO HEAT tool directly:
# https://heatwalkingcycling.org/

library(dplyr)

# --- Sourced constants (MLIT, 令和6年価格) ------------------------------
TIME_VALUE_YEN_PER_CAR_MIN    <- 43.74  # ¥/minute/passenger car
RUNNING_COST_YEN_PER_CAR_KM   <- 24.43  # ¥/km/passenger car, urban road, 40km/h

# --- Illustrative defaults - replace with local data where you have it -
TRIPS_PER_PERSON_PER_DAY            <- 2.5   # typical range in trip surveys is 2-3
SHORT_TRIP_SHARE                    <- 0.4   # share of daily trips under ~3km
CURRENT_CAR_MODE_SHARE              <- 0.7   # matches the example used earlier in this project
AVG_SHORT_TRIP_KM                   <- 2.0
AVG_SHORT_TRIP_CAR_MINUTES          <- 8     # short urban car trip, incl. traffic/parking search
CO2_KG_PER_CAR_KM                   <- 0.13  # typical passenger car tailpipe figure - verify locally
HEALTH_YEN_PER_KM_CYCLED            <- 15    # simplified proxy, NOT a HEAT calculation
CAR_PARKING_SPACES_PER_TRIP_SHIFTED <- 0.02  # each shifted trip incrementally reduces peak
                                              # parking demand, not a 1:1 relationship

#' Estimate daily short car trips currently made in a hex, from
#' population alone - there's no direct trip-count data source for this.
estimate_car_short_trips <- function(population,
                                      trips_per_person = TRIPS_PER_PERSON_PER_DAY,
                                      short_trip_share = SHORT_TRIP_SHARE,
                                      car_mode_share = CURRENT_CAR_MODE_SHARE) {
  population * trips_per_person * short_trip_share * car_mode_share
}

#' Daily congestion cost (yen) of those car trips, using MLIT's official
#' time-value unit. Treats each trip's time value as a stand-in for its
#' congestion cost - a simplification (it doesn't model how removing
#' trips changes travel time for remaining traffic), but is the standard
#' unit Japanese road project appraisals use for exactly this purpose.
estimate_congestion_cost_yen <- function(car_trips,
                                          minutes_per_trip = AVG_SHORT_TRIP_CAR_MINUTES,
                                          yen_per_min = TIME_VALUE_YEN_PER_CAR_MIN) {
  car_trips * minutes_per_trip * yen_per_min
}

#' Daily vehicle operating cost (yen) of those car trips - fuel,
#' maintenance, tires etc., using MLIT's official per-km unit cost.
estimate_operating_cost_yen <- function(car_trips,
                                         km_per_trip = AVG_SHORT_TRIP_KM,
                                         yen_per_km = RUNNING_COST_YEN_PER_CAR_KM) {
  car_trips * km_per_trip * yen_per_km
}

#' Daily CO2 emissions (kg) from those car trips.
estimate_emissions_kg <- function(car_trips,
                                   km_per_trip = AVG_SHORT_TRIP_KM,
                                   kg_co2_per_km = CO2_KG_PER_CAR_KM) {
  car_trips * km_per_trip * kg_co2_per_km
}

#' Simplified daily health-benefit proxy (yen) for trips shifted from car
#' to bike. NOT a HEAT calculation - see the module-level note above.
estimate_health_benefit_yen <- function(shifted_trips,
                                         km_per_trip = AVG_SHORT_TRIP_KM,
                                         yen_per_km = HEALTH_YEN_PER_KM_CYCLED) {
  shifted_trips * km_per_trip * yen_per_km
}

#' Parking spaces freed by shifted trips - illustrative, not a real
#' parking-demand model.
estimate_parking_spaces_freed <- function(shifted_trips,
                                           spaces_per_trip = CAR_PARKING_SPACES_PER_TRIP_SHIFTED) {
  shifted_trips * spaces_per_trip
}

#' Compute a full "cycling ROI" scenario per hex: current car-trip
#' congestion/operating-cost/emissions burden, and potential daily
#' savings if a given share of those trips shifted to cycling.
#'
#' @param hexes data frame/sf with a `population` column
#' @param shift_share assumed share of current car short trips that would
#'   shift to cycling given better infrastructure. Default 0.2 (20%) is a
#'   round, deliberately modest planning assumption, not a prediction -
#'   treat this as the main dial to turn for a "what if" scenario.
#' @return the same object with roi_* columns added
compute_hex_roi <- function(hexes, shift_share = 0.2) {
  hexes |>
    mutate(
      roi_car_trips_per_day          = estimate_car_short_trips(population),
      roi_congestion_cost_yen_day    = estimate_congestion_cost_yen(roi_car_trips_per_day),
      roi_operating_cost_yen_day     = estimate_operating_cost_yen(roi_car_trips_per_day),
      roi_emissions_kg_day           = estimate_emissions_kg(roi_car_trips_per_day),
      roi_shifted_trips_per_day      = roi_car_trips_per_day * shift_share,
      roi_congestion_savings_yen_day = estimate_congestion_cost_yen(roi_shifted_trips_per_day),
      roi_operating_savings_yen_day  = estimate_operating_cost_yen(roi_shifted_trips_per_day),
      roi_emissions_avoided_kg_day   = estimate_emissions_kg(roi_shifted_trips_per_day),
      roi_health_benefit_yen_day     = estimate_health_benefit_yen(roi_shifted_trips_per_day),
      roi_parking_spaces_freed       = estimate_parking_spaces_freed(roi_shifted_trips_per_day)
    )
}
