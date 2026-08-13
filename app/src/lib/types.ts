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
  /** Null on anything that is not cycling infrastructure. */
  cycleway_type?: CyclewayType | null;
  sidewalk_available: boolean;
  likely_informal_parking: boolean;
  school_nearby: number | null;
  station_nearby: number | null;
  existing_cycling: boolean | null;
  mean_slope_deg?: number | null;
  flat_terrain?: boolean;
  // B.3: suitability score + stress-based network analysis
  suitability_score?: number;
  network_criticality_score?: number;
  bridges_islands?: boolean;
  islands_adjacent?: number;
  island_id?: number | null;
  display_category?: DisplayCategory;
  infra_gap: string;
  recommendation: string | null;
  cost_tier?: string | null;
  suitability_after?: number | null;
  estimated_beneficiaries: number | null;
}

/**
 * The four map colour categories. `bottleneck` and `low_priority` are both
 * low-suitability roads — the difference is whether the network analysis
 * found that upgrading them would join otherwise-severed low-stress areas.
 * See pipeline/R/score_network.R.
 */
export type DisplayCategory =
  | "high"
  | "moderate"
  | "bottleneck"
  | "low_priority";

/**
 * What kind of cycling provision a way already is. Mirrors
 * classify_cycleway_type() in pipeline/R/score_lts.R — three categories
 * because those are the three a planner has to tell apart, not because OSM
 * tags them that way (it is far more granular than any decision needs).
 *
 * The distinction that matters most here is `dedicated` vs `shared_path`:
 * a shared bike/pedestrian path is the standard Japanese 自転車歩行者道, it
 * is legal provision and it is most of what exists — but counting it as
 * cycle route km is how a network gets overstated. They are never summed
 * into one number in the UI for that reason.
 */
export type CyclewayType = "dedicated" | "shared_path" | "on_road";

export const CYCLEWAY_TYPE_LABELS: Record<CyclewayType, string> = {
  dedicated: "Dedicated cycleway",
  shared_path: "Shared with pedestrians",
  on_road: "On-road lane",
};

export interface CyclewayProperties {
  way_id: number;
  name: string | null;
  highway: string;
  cycleway_type: CyclewayType;
  length_m: number;
  lts: number;
  surface: string | null;
  lit: string | null;
}

export type CyclewayFeature = Feature<MultiLineString, CyclewayProperties>;

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

/**
 * Mirrors export_bike_facilities_layer() in pipeline/R/export_geojson.R: the
 * six source columns plus the eight keys parsed out of OSM's `other_tags`.
 */
export interface BikeFacilityProperties {
  /**
   * `node/<id>` or `way/<id>` — namespaced because a facility mapped as a
   * building outline is a way and node/way ids are independent OSM
   * sequences. Unique per feature, so the map uses it as the feature's
   * identity for hit-testing and highlighting.
   */
  osm_id: string;
  name: string | null;
  ref: string | null;
  amenity: string;
  capacity: number | null;
  facility_type: "parking" | "sharing";
  fee: string | null;
  brand: string | null;
  access: string | null;
  covered: string | null;
  supervised: string | null;
  note: string | null;
  operator: string | null;
  opening_hours: string | null;
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
  existing_cycling_network: {
    total_length_km: number;
    pct_of_network_length: number;
    dedicated_km: number;
    shared_path_km: number;
    on_road_km: number;
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

/**
 * Colours keyed to display_category rather than raw score, so that a
 * low-scoring road that connects nothing reads as de-prioritised (neutral
 * grey) instead of urgent (red). Kept in sync with the thresholds in
 * pipeline/R/score_suitability.R.
 */
export const CATEGORY_COLORS: Record<DisplayCategory, string> = {
  high: "#22c55e",
  moderate: "#f59e0b",
  bottleneck: "#ef4444",
  low_priority: "#9ca3af",
};

/**
 * Genuinely additive layers, and only those. They draw *on top of* whichever
 * view is active without taking the colour channel from it, which is what
 * makes them safe to combine freely.
 *
 * "Disconnected networks" used to live here and did not belong: it recoloured
 * the same street lines and suppressed the active view to do it. It is a view
 * now (VIEWS in metrics.ts), not an overlay.
 */
export type ToggleKey =
  | "amenities"
  | "bike_facilities"
  | "cycleways"
  | "recommendations";

export type ToggleState = Record<ToggleKey, boolean>;

/** Everything starts off: the map opens as a basemap and waits to be asked. */
export const DEFAULT_TOGGLES: ToggleState = {
  amenities: false,
  bike_facilities: false,
  cycleways: false,
  recommendations: false,
};

export interface AmenityProperties {
  amenity_id: number;
  kind: "school" | "station" | "shop";
  name: string | null;
  detail: string | null;
}

export type AmenityFeature = Feature<Point, AmenityProperties>;

export const CATEGORY_LABELS: Record<DisplayCategory, string> = {
  high: "High suitability",
  moderate: "Moderate",
  bottleneck: "Strategic bottleneck",
  low_priority: "Low priority",
};

/**
 * Resolve a segment's category, falling back to its LTS-derived score for
 * data exported before the network analysis existed.
 */
export function segmentCategory(p: SegmentProperties): DisplayCategory {
  if (p.display_category) return p.display_category;
  const score = p.suitability_score ?? ltsToSuitability(p.lts);
  if (score >= 67) return "high";
  if (score >= 34) return "moderate";
  return "bottleneck";
}

export function segmentSuitability(p: SegmentProperties): number {
  return p.suitability_score ?? ltsToSuitability(p.lts);
}
