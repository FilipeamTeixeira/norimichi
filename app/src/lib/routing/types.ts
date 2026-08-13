/**
 * The contract every routing backend implements.
 *
 * The point of this layer is that the *scoring* is provider-independent. A
 * provider's only job is to produce a path — a plain LineString — plus whatever
 * distance and duration it wants to claim for it. Everything that makes this
 * project's answer worth reading (the LTS breakdown, sidewalk and informal
 * parking exposure, the signal-aware travel time) is then derived by
 * `matchRoute` in lib/route-matching.ts, identically, whichever provider drew
 * the line. That keeps two routes from two providers directly comparable, which
 * is the whole reason for having more than one.
 *
 * See PROJECT_STATUS.md C.3 for why this exists: V1 overlaid our data on
 * somebody else's geometry, and the open question was whether to route on our
 * own network instead. The answer here is "both, behind a switch", so the two
 * can be held up against each other rather than argued about.
 */

import type { Feature, LineString } from "geojson";
import type { RouteErrorKind } from "../route-types";

/**
 * What the rider is asking for. These are *preferences over the same network*,
 * not different vehicles.
 *
 * - `relaxed`   — avoid stressful roads, accept detour.
 * - `efficient` — a sane balance; the default.
 * - `quick`     — shortest time, accept traffic.
 *
 * Not every provider can honour these. `RouteProvider.supportsRouteTypes` says
 * whether the distinction is real for that backend or merely accepted and
 * ignored, and the UI is expected to say so rather than imply three different
 * answers came back when only one did.
 */
export type RouteType = "efficient" | "relaxed" | "quick";

export const ROUTE_TYPES: readonly RouteType[] = [
  "efficient",
  "relaxed",
  "quick",
] as const;

export function isRouteType(v: unknown): v is RouteType {
  return typeof v === "string" && (ROUTE_TYPES as readonly string[]).includes(v);
}

export type ProviderId = "graph" | "ors" | "brouter";

/**
 * Which of several equally-requested routes to return: 0 is the optimum under
 * the current cost model, 1-3 are progressively more expensive detours that
 * still get there.
 *
 * This is BRouter's `alternativeidx` and its range is BRouter's — all four
 * values return genuinely different routes for every profile we use. It is
 * modelled as a general request parameter rather than a BRouter quirk because
 * "show me another way" is a reasonable thing to ask any router; the providers
 * that cannot answer it say so through `supportsAlternatives` rather than by
 * the caller knowing which backend is which.
 */
export type RouteAlternative = 0 | 1 | 2 | 3;

export const ROUTE_ALTERNATIVES: readonly RouteAlternative[] = [
  0, 1, 2, 3,
] as const;

export function isRouteAlternative(v: unknown): v is RouteAlternative {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

export interface RouteRequest {
  /** `[lon, lat]`, already snapped to the cache grid by the caller. */
  origin: [number, number];
  destination: [number, number];
  routeType: RouteType;
  /** Defaults to 0 — the best route under the chosen `routeType`. */
  alternative: RouteAlternative;
}

/**
 * A provider's own claim about the route it just drew.
 *
 * Deliberately kept separate from our own `TimeEstimate`: this is the backend's
 * generic profile talking, and the UI shows it *beside* our number rather than
 * instead of it. Null where a provider has nothing independent to say — the
 * graph provider being the obvious case, since its numbers would just be our
 * numbers again.
 */
export interface ReportedFigures {
  distance_m: number;
  minutes: number;
}

export interface ProviderRoute {
  line: Feature<LineString>;
  reported: ReportedFigures | null;
}

export type ProviderResult =
  | { ok: true; route: ProviderRoute }
  /**
   * Failure is data, not an exception — the handler turns `kind` into a user
   * facing message and an HTTP status. `detail` is for the server log only.
   */
  | { ok: false; kind: RouteErrorKind; detail?: string };

export interface RouteProvider {
  id: ProviderId;
  /** Shown in the UI beside the provider's own reported time. */
  label: string;
  /**
   * True when the three `RouteType`s genuinely produce different routes on this
   * backend. False means the provider accepts the parameter and ignores it, and
   * the caller should not pretend otherwise.
   */
  supportsRouteTypes: boolean;
  /**
   * True when `RouteRequest.alternative` above 0 returns a different route.
   * False means the provider only ever has one answer per route type, and a
   * UI offering alternatives against it would be offering nothing.
   */
  supportsAlternatives: boolean;
  route(req: RouteRequest): Promise<ProviderResult>;
}
