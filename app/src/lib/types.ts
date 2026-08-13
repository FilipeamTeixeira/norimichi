import type { Feature, MultiLineString, Point, Polygon } from "geojson";

/**
 * The five intervention labels. Mirrors INTERVENTION_TYPES in
 * pipeline/R/score_intervention.R — the pipeline emits exactly these
 * strings, so a filter can match `recommendation` directly instead of
 * pattern-matching free text.
 */
export type InterventionType =
  | "Protected cycle lane"
  | "Missing link"
  | "Traffic calming"
  | "Crossing improvement"
  | "Bike parking";

/**
 * Whether a row's recommended intervention corresponds to an input the
 * traffic-stress score actually models.
 *
 * This is the field that keeps the before/after honest, and it is not
 * decorative. `score_lts()` has no crossing or junction term at all, so
 * there is no edit to a way's tags meaning "the crossing got safer" — a
 * `not_modelled` row therefore carries `suitability_after: null` and the UI
 * must state its benefit in other terms. An earlier version of the pipeline
 * applied the *cycle lane* counterfactual to every type uniformly and
 * reported a mean 31 → 100 for crossing improvements: an intervention
 * scored by pretending a different one had been built. Never render an
 * arrow for a `not_modelled` row.
 *
 * See pipeline/R/score_intervention.R.
 */
export type BenefitKind = "lts_recalc" | "not_modelled";

/**
 * One fundable project — the Investment Ranking table's row.
 *
 * Segments that share a name (or are all unnamed) and run end to end into one
 * another, grouped by pipeline/R/build_corridors.R. Deliberately not one row
 * per OSM way: the median recommended way here is 119m, 57% are unnamed, and
 * one street runs across dozens of rows, so a way-level table ranks fragments
 * of the same few streets and labels more than half of them blank.
 *
 * `recommendation` is a property *of the corridor*, decided once from its
 * aggregate and inherited by its members — never part of what groups them.
 * It used to be, and that split streets wherever a mapping artefact moved one
 * way across a classification threshold.
 *
 * Comes from `investment_ranking.json`, precomputed by
 * pipeline/scripts/12_compute_investment_ranking.R. Every figure here is
 * computed in R — nothing on this page re-derives scoring, so the
 * classification and what-if logic lives next to score_lts.R rather than
 * being duplicated in TypeScript.
 */
export interface CorridorProperties {
  corridor_id: number;
  /**
   * The street name covering most of the corridor's length — not necessarily
   * every member's, since a named stretch absorbs the unnamed ones it runs
   * straight into. Null where no member names a street, which is most of them;
   * use corridorLabel(). A route designation like 横浜市道82号山下本牧磯子線 is
   * not treated as a street name upstream (it belongs in `ref`), so it appears
   * here only when a corridor has nothing better.
   */
  name: string | null;
  /** Nearest station, always present. The only label an unnamed corridor has. */
  nearest_station: string | null;
  recommendation: InterventionType;
  benefit_kind: BenefitKind;
  /** Plain-language description of what was simulated to get the after-number. */
  intervention_lever: string;
  cost_tier: "Low" | "Medium" | "High" | null;
  /** Dominant OSM highway class by length. */
  highway: string | null;
  segment_count: number;
  length_m: number;
  /** Member `way_id`s — internal row identities, for drill-down and map fly-to. */
  way_ids: number[];
  /** Real OSM way ids, for checking against openstreetmap.org/way/<id>. */
  osm_ids: string[];
  /** Lon/lat extent as [w, s, e, n], for flying the map to the whole corridor. */
  bbox: [number, number, number, number];
  lts_before: number;
  suitability_before: number;
  /** Null whenever `benefit_kind` is "not_modelled". Never fabricate one. */
  suitability_after: number | null;
  /**
   * Residents within 500m of the whole corridor, recomputed from a single
   * unioned buffer — never the sum of its segments' own values, whose 500m
   * buffers overlap almost completely. On the largest corridor here the
   * union gives 53,145 where the naive sum claims 790,407.
   */
  estimated_beneficiaries: number;
  network_criticality_score: number | null;
  bridges_islands: boolean;
  islands_adjacent: number | null;
  /**
   * Benefit statements for the interventions the stress score cannot model.
   *
   * `signalised_junctions` counts *distinct* junctions within 15m of the whole
   * corridor, with OSM's per-approach signal nodes clustered at 30m — not the
   * sum of the members' own signal counts, which double-counted every junction
   * between two members (the worst row claimed 77 against 20 real nodes).
   */
  signalised_junctions: number;
  /**
   * The same junctions as a rate: how often a cyclist would expect to stop.
   * A cost of riding the street in its own right, not only the sizing for a
   * crossing scheme — a signal every 100m is a bad ride whatever the
   * traffic-stress score says. Also what the classifier tests, since an
   * absolute count scales with how long a way happens to be.
   */
  signals_per_km: number;
  informal_parking_length_m: number;
  no_sidewalk_length_m: number;
  /**
   * Enclosing-hex figures. Neighbourhood *context*, not corridor-attributable
   * — `gap_score` and the ROI model are computed from hex-level population
   * for a whole ~0.1km² cell, so this is "what kind of area is this street
   * in", not "what fixing this street is worth". Label it as context in any
   * UI that shows it. See pipeline/R/join_hex_context.R.
   */
  context_hex_gap_score: number | null;
  context_hex_daily_savings_yen: number | null;
}

/**
 * The whole `investment_ranking.json` payload. The `notes` block ships with
 * the data rather than living only in the UI, because three of these columns
 * are honest only when read with their caveat.
 */
export interface InvestmentRanking {
  study_area: string;
  corridor_count: number;
  total_length_km: number;
  notes: Record<string, string>;
  corridors: CorridorProperties[];
}

/**
 * A corridor's display label. Falls back to location for the 52% of
 * corridors OSM gives no name — including, in this study area, the corridor
 * with the most residents within 500m.
 */
export function corridorLabel(p: CorridorProperties): string {
  if (p.name) return p.name;
  const kind = p.highway ? p.highway.replace(/_/g, " ") : "road";
  return p.nearest_station
    ? `Unnamed ${kind} near ${p.nearest_station}`
    : `Unnamed ${kind}`;
}

export const COST_TIER_ORDER: Record<string, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

export interface SegmentProperties {
  way_id: number;
  /** Real OSM way id, as a string. `way_id` is only a row index. */
  osm_id?: string;
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
  recommendation: InterventionType | null;
  cost_tier?: "Low" | "Medium" | "High" | null;
  /** Null whenever `benefit_kind` is "not_modelled". See BenefitKind. */
  suitability_after?: number | null;
  benefit_kind?: BenefitKind | null;
  intervention_lever?: string | null;
  /** Which corridor this segment rolls up into; null if not recommended. */
  corridor_id?: number | null;
  estimated_beneficiaries: number | null;
  /** Enclosing-hex context, not segment-attributable. See CorridorProperties. */
  context_hex_gap_score?: number | null;
  context_hex_demand_score?: number | null;
  context_hex_population?: number | null;
  context_hex_daily_savings_yen?: number | null;
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
