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
import type { ProviderId, RouteAlternative, RouteType } from "./routing/types";

export interface RouteScoreRequest {
  /** `[lon, lat]`, as GeoJSON and MapLibre both order it. */
  origin: [number, number];
  destination: [number, number];
  /**
   * Optional; defaults to `efficient`. Whether it changes anything depends on
   * the active provider — see `RouteScoreResponse.provider.supports_route_types`.
   */
  route_type?: RouteType;
  /**
   * Optional; defaults to 0, the best route under `route_type`. 1-3 ask for
   * progressively costlier ways round. Honoured only where
   * `provider.supports_alternatives` is true.
   */
  alternative?: RouteAlternative;
}

/** A bike parking site or sharing dock at the destination end of the trip. */
export interface NearbyFacility {
  /** `node/<id>` or `way/<id>` — see BikeFacilityProperties in types.ts. */
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

/** Which backend drew this line, and what it can actually honour. */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /**
   * False means the provider took `route_type` and ignored it. The UI is
   * expected to say so rather than imply three answers came back when one did.
   */
  supports_route_types: boolean;
  /** False means `alternative` was accepted and ignored, as above. */
  supports_alternatives: boolean;
  /** What was asked for, echoed back — honoured or not. */
  route_type: RouteType;
  alternative: RouteAlternative;
}

export interface RouteScoreResponse {
  /** Pre-cut and pre-classed by LTS. The client renders it, nothing more. */
  geometry: FeatureCollection<LineString, RoutePieceProperties>;
  /**
   * Where the route actually starts and ends, which is not where the reader
   * put the pins: every provider snaps the request onto the nearest thing it
   * can route along. The map draws pin→snapped as a dashed access leg, so the
   * distance between the two reads as "walk this bit" rather than as the route
   * having been drawn in the wrong place.
   */
  snapped: { origin: [number, number]; destination: [number, number] };
  stats: RouteAggregate;
  /** Our estimate, from our own data. */
  ours: TimeEstimate;
  provider: ProviderInfo;
  /**
   * The provider's own distance and duration, shown beside ours rather than
   * replacing them. Null where the provider has nothing independent to say —
   * the `graph` provider being the case, since its numbers would be ours
   * computed a second time.
   */
  reported: { distance_m: number; minutes: number } | null;
  car: CarComparison;
  facilities: NearbyFacility[];
  /** True when this came back from the coordinate-grid cache, not the provider. */
  cached: boolean;
}

/**
 * Failure is a first-class state here, not an exception. The free ORS tier is
 * 2,000 directions requests a day, so "we are out of quota until tomorrow" is
 * a thing that will genuinely happen to this app and has to say so plainly
 * rather than looking like a bug.
 *
 * These are deliberately provider-independent. BRouter's failure mode — a
 * volunteer-run public server that may simply not answer — needs no new
 * variant: `unavailable` already means "the upstream did not give us a route
 * and it is not your fault or your quota", which is exactly it. Adding a
 * per-provider variant would push provider identity into a type whose whole
 * job is to describe what the *user* should do next.
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
