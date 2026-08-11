import type { Feature, MultiLineString, Point, Polygon } from "geojson";

export interface SegmentProperties {
  way_id: number;
  name?: string | null;
  highway?: string;
  length_m: number;
  lts: number;
  speed_kmh: number;
  lanes_n?: number;
  traffic_signals_count: number;
  has_cycle_infra?: boolean;
  sidewalk_available: boolean;
  likely_informal_parking: boolean;
  school_nearby: number | null;
  station_nearby: number | null;
  existing_cycling: boolean | null;
  mean_slope_deg?: number | null;
  flat_terrain?: boolean;
  infra_gap: string;
  recommendation: string | null;
  estimated_beneficiaries: number | null;
}

export interface HexProperties {
  hex_id: string;
  population: number;
  production_score: number;
  attraction_score: number;
  demand_score: number | null;
  stress_score: number;
  infra_quality_score: number;
  gap_score: number | null;
  schools_nearby: number;
  stations_nearby: number;
  shops_nearby: number;
  bike_parking_nearby: number;
  bike_parking_capacity_nearby: number;
  bike_sharing_nearby: number;
  bike_sharing_capacity_nearby: number;
  flat_terrain: number | null;
  roi_car_trips_per_day: number;
  roi_congestion_cost_yen_day: number;
  roi_operating_cost_yen_day: number;
  roi_emissions_kg_day: number;
  roi_shifted_trips_per_day: number;
  roi_congestion_savings_yen_day: number;
  roi_operating_savings_yen_day: number;
  roi_emissions_avoided_kg_day: number;
  roi_health_benefit_yen_day: number;
  roi_parking_spaces_freed: number;
}

export interface BikeFacilityProperties {
  osm_id: string;
  name: string | null;
  amenity: string;
  capacity: number | null;
  facility_type: "parking" | "sharing";
  fee: string | null;
  brand: string | null;
  operator: string | null;
}

export interface StudySummary {
  network: {
    total_segments: number;
    total_length_km: number;
    lts_distribution: Record<string, number>;
    pct_high_stress_length: number | string;
    pct_no_sidewalk_length: number | string;
    pct_no_safe_option_length: number | string;
    pct_likely_informal_parking: number;
  };
  destinations: {
    shops_and_restaurants: number;
    schools: number;
    stations: number;
  };
  demand: {
    total_population: number;
    avg_demand_score: number;
    avg_gap_score: number;
    missed_opportunity_hexes: number;
    population_in_missed_opportunity_hexes: number;
  };
  roi_scenario: {
    note: string;
    daily_car_trips: number;
    daily_congestion_cost_yen: number;
    daily_operating_cost_yen: number;
    daily_shifted_trips: number;
    daily_congestion_savings_yen: number;
    daily_operating_savings_yen: number;
    daily_emissions_avoided_kg: number;
    daily_health_benefit_yen: number;
    parking_spaces_freed: number;
  };
}

export type SegmentFeature = Feature<MultiLineString, SegmentProperties>;
export type HexFeature = Feature<Polygon, HexProperties>;
export type BikeFacilityFeature = Feature<Point, BikeFacilityProperties>;

export function ltsToSuitability(lts: number): number {
  return Math.round(100 - ((lts - 1) / 3) * 100);
}

export function suitabilityColor(score: number): string {
  if (score >= 67) return "#22c55e"; // green
  if (score >= 34) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

export function suitabilityLabel(score: number): string {
  if (score >= 67) return "Good";
  if (score >= 34) return "Moderate";
  return "Bottleneck";
}
