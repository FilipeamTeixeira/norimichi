/**
 * The contract between /api/route-score and the Route Analysis page.
 *
 * Kept in its own file rather than exported from the route handler so that a
 * client component can import the shape without pulling a server module — and
 * its `fs` and API key with it — into the browser bundle.
 */

import type { FeatureCollection, LineString } from "geojson";
import type {
  RouteAggregate,
  RoutePieceProperties,
  TimeEstimate,
} from "./route-matching";

export interface RouteScoreRequest {
  /** `[lon, lat]`, as GeoJSON and MapLibre both order it. */
  origin: [number, number];
  destination: [number, number];
}

/** A bike parking site or sharing dock at the destination end of the trip. */
export interface NearbyFacility {
  osm_id: string;
  name: string | null;
  facility_type: "parking" | "sharing";
  capacity: number | null;
  distance_m: number;
  /** `[lon, lat]` — the map draws these, so they travel with the panel data. */
  at: [number, number];
}

/**
 * What the same trip would have cost by car. Not a claim that this trip *was*
 * a car trip — it is the counterfactual that makes an individual journey
 * legible in the same units as the study-area ROI figures.
 */
export interface CarComparison {
  /** At the pipeline's own effective urban car speed, including parking. */
  minutes: number;
  /** MLIT time value applied to those minutes. */
  time_value_yen: number;
  /** MLIT per-km operating cost applied to this distance. */
  operating_cost_yen: number;
  co2_kg: number;
  /** The other direction: what cycling this distance is worth in health terms. */
  health_benefit_yen: number;
}

export interface RouteScoreResponse {
  /** Pre-cut and pre-classed by LTS. The client renders it, nothing more. */
  geometry: FeatureCollection<LineString, RoutePieceProperties>;
  stats: RouteAggregate;
  /** Our estimate, from our own data. */
  ours: TimeEstimate;
  /** ORS's own numbers, shown beside ours rather than replaced by them. */
  ors: { distance_m: number; minutes: number };
  car: CarComparison;
  facilities: NearbyFacility[];
  /** True when this came back from the coordinate-grid cache, not from ORS. */
  cached: boolean;
}

/**
 * Failure is a first-class state here, not an exception. The free ORS tier is
 * 2,000 directions requests a day, so "we are out of quota until tomorrow" is
 * a thing that will genuinely happen to this app and has to say so plainly
 * rather than looking like a bug.
 */
export type RouteErrorKind =
  | "not_configured"
  | "quota"
  | "unavailable"
  | "no_route"
  | "out_of_area"
  | "bad_request";

export interface RouteScoreError {
  error: RouteErrorKind;
  message: string;
}

export function isRouteError(
  body: RouteScoreResponse | RouteScoreError
): body is RouteScoreError {
  return "error" in body;
}
