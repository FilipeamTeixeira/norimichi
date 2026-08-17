/**
 * Score one A→B cycling trip against this project's own segment data.
 *
 * The division of labour is the whole design: a `RouteProvider` supplies *only*
 * the path geometry, and everything that makes the answer worth reading — the
 * stress breakdown, the sidewalk and informal-parking exposure, the
 * signal-aware travel time, the cost and CO₂ comparison — comes from
 * segments.geojson via lib/route-matching.ts. That split is what lets three
 * different backends be compared: the scoring is identical whoever drew the
 * line, so a difference between two routes is a difference in the routing.
 *
 * Which backend runs is `ROUTING_PROVIDER` — see lib/routing/index.ts. Two of
 * the three (`ors`, `brouter`) route on generic profiles that have never seen
 * `lts` and cannot avoid a hostile road; this endpoint reports what their route
 * runs along, it does not look for a better one. The third (`graph`) routes on
 * our own network with our own stress data as the cost function, which is the
 * PROJECT_STATUS.md C.3 "V2" path.
 *
 * The ORS key stays server-side. It is read from ORS_API_KEY, deliberately not
 * prefixed NEXT_PUBLIC_, and the client only ever talks to this handler.
 */

import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { FeatureCollection } from "geojson";
import { estimateCyclingTime, matchRoute } from "@/lib/route-matching";
import {
  loadFacilities,
  loadIndex,
  loadJunctions,
} from "@/lib/routing/data";
import { activeProvider } from "@/lib/routing";
import { findRegion } from "@/lib/regions.server";
import {
  isRouteAlternative,
  isRouteType,
  type RouteAlternative,
  type RouteType,
} from "@/lib/routing/types";
import type {
  NearbyFacility,
  RouteErrorKind,
  RouteScoreError,
  RouteScoreResponse,
} from "@/lib/route-types";
import type { BikeFacilityProperties } from "@/lib/types";
import {
  CO2_KG_PER_CAR_KM,
  DESTINATION_FACILITY_RADIUS_M,
  HEALTH_YEN_PER_KM_CYCLED,
  RUNNING_COST_YEN_PER_CAR_KM,
  TIME_VALUE_YEN_PER_CAR_MIN,
  URBAN_CAR_SPEED_KMH,
} from "@/lib/scoring-constants";

/** Reads GeoJSON off disk and holds a spatial index in memory. */
export const runtime = "nodejs";

// --- Cache --------------------------------------------------------------

/**
 * ~10m coordinate grid. Four decimal places is 11m of latitude and 9m of
 * longitude at Yokohama's latitude, so a click and a click a moment later on
 * the same spot are one route and one upstream request.
 *
 * Three decimals — a ~100m cell — was the earlier choice, on the reasoning that
 * the router snaps to the nearest road anyway. It does, but the *pin* doesn't:
 * the marker sits where the reader clicked while the route starts wherever the
 * rounded point landed, which showed up as a visible gap of up to ~78m between
 * the two. The cache exists to save quota, and it still does for the case that
 * actually spends it — flipping route type or alternative re-sends identical
 * coordinates — so the coarser cell was buying very little at the price of
 * putting the route somewhere the reader didn't ask for.
 *
 * The rounded coordinates are what is sent upstream, not just what is used as
 * the key. Keying on a rounded value while requesting an unrounded one would
 * file a whole cell's worth of genuinely different routes under one entry.
 */
const GRID_DECIMALS = 4;
const snap = (v: number) => Number(v.toFixed(GRID_DECIMALS));

/**
 * In-process only, so it empties whenever the instance is recycled and is not
 * shared between concurrent serverless instances. That is a real limit on how
 * much upstream traffic it saves in production, and the honest fix is a shared
 * store (KV) rather than pretending this is one — but it costs nothing and it
 * covers the case that actually burns quota, which is one person trying the
 * same trip repeatedly while reading the panel.
 */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; payload: RouteScoreResponse }>();

/**
 * Provider, route type and alternative index are all part of the key, not just
 * the coordinates.
 *
 * They have to be. The same O/D pair returns a different route from each of the
 * three backends, from each of BRouter's three profiles, and from each of its
 * four alternative indices — keying on coordinates alone would serve whichever
 * answer happened to be cached first under every other combination's name,
 * which is worse than not caching: the response says `provider.id` and
 * `route_type` and would be lying about both. Every request-shaping parameter
 * has to appear here; adding one without adding it to this key is the bug to
 * watch for.
 */
function cacheKey(
  region: string,
  providerId: string,
  routeType: RouteType,
  alternative: RouteAlternative,
  from: [number, number],
  to: [number, number]
): string {
  // Region first, and not optional. Coordinates alone would be a near-miss
  // key: two study areas can abut or overlap, and the scored result depends on
  // which region's segment network the line was matched against, not only on
  // where the line is.
  return `${region}|${providerId}|${routeType}|${alternative}|${from[0]},${from[1]}|${to[0]},${to[1]}`;
}

function cacheGet(key: string): RouteScoreResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Re-insert so the eviction below drops the least recently *used*, not the
  // oldest — a popular route shouldn't age out from under a demo.
  cache.delete(key);
  cache.set(key, hit);
  return hit.payload;
}

function cacheSet(key: string, payload: RouteScoreResponse): void {
  cache.set(key, { at: Date.now(), payload });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

// --- Helpers ------------------------------------------------------------

function fail(error: RouteErrorKind, message: string, status: number): Response {
  return Response.json({ error, message } satisfies RouteScoreError, { status });
}

function isCoordinate(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

/**
 * A generous margin on the study-area extent. A trip may reasonably start just
 * off the edge of the ward, but one starting in Tokyo would match nothing and
 * produce a panel full of confident zeroes.
 */
const OUT_OF_AREA_PAD_DEG = 0.02;

function insideStudyArea(
  [lon, lat]: [number, number],
  bbox: [number, number, number, number]
): boolean {
  return (
    lon >= bbox[0] - OUT_OF_AREA_PAD_DEG &&
    lon <= bbox[2] + OUT_OF_AREA_PAD_DEG &&
    lat >= bbox[1] - OUT_OF_AREA_PAD_DEG &&
    lat <= bbox[3] + OUT_OF_AREA_PAD_DEG
  );
}

function facilitiesNear(
  destination: [number, number],
  facilities: FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
): NearbyFacility[] {
  const at = point(destination);
  const found: NearbyFacility[] = [];

  // A single point against ~500 facilities: no index earns its keep here, and
  // no map-matching is needed either — this is a radius, not a path.
  for (const f of facilities.features) {
    const p = f.properties;
    if (!p) continue;
    const d = distance(at, f.geometry, { units: "meters" });
    if (d > DESTINATION_FACILITY_RADIUS_M) continue;
    found.push({
      osm_id: p.osm_id,
      name: p.name,
      facility_type: p.facility_type,
      capacity: p.capacity,
      distance_m: d,
      at: [f.geometry.coordinates[0], f.geometry.coordinates[1]],
    });
  }

  return found.sort((a, b) => a.distance_m - b.distance_m);
}

/** One message per failure state, so every one of them reads as deliberate. */
const MESSAGES: Record<RouteErrorKind, [string, number]> = {
  quota: [
    "The routing service has hit its daily request limit. Route scoring will work again tomorrow; everything else on the site is unaffected.",
    503,
  ],
  not_configured: [
    "The routing service rejected our API key. Check ORS_API_KEY on the server, or set ROUTING_PROVIDER=graph to route on our own network instead.",
    503,
  ],
  no_route: [
    "No cycling route could be found between those two points. Try moving one of them nearer a road.",
    422,
  ],
  unavailable: [
    "The routing service is temporarily unavailable. Try again in a moment.",
    503,
  ],
  out_of_area: ["Outside the study area.", 400],
  bad_request: ["Bad request.", 400],
};

// --- Handler ------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_request", "Expected a JSON body.", 400);
  }

  const {
    region: requestedRegion,
    origin,
    destination,
    route_type: requestedType,
    alternative: requestedAlternative,
  } = (body ?? {}) as Record<string, unknown>;

  // Validated against the manifest before it reaches any loader: it becomes
  // part of a filesystem path there, and "is this a real published region" is
  // the only check that actually establishes that.
  if (typeof requestedRegion !== "string" || !requestedRegion) {
    return fail("bad_request", "region must be a published region slug.", 400);
  }
  if (!(await findRegion(requestedRegion))) {
    return fail("bad_request", `Unknown study area: ${requestedRegion}`, 400);
  }
  const region = requestedRegion;

  if (!isCoordinate(origin) || !isCoordinate(destination)) {
    return fail(
      "bad_request",
      "origin and destination must each be a [lon, lat] pair.",
      400
    );
  }
  if (requestedType !== undefined && !isRouteType(requestedType)) {
    return fail(
      "bad_request",
      'route_type must be one of "efficient", "relaxed" or "quick".',
      400
    );
  }
  if (
    requestedAlternative !== undefined &&
    !isRouteAlternative(requestedAlternative)
  ) {
    return fail("bad_request", "alternative must be 0, 1, 2 or 3.", 400);
  }
  const routeType: RouteType = requestedType ?? "efficient";
  const alternative: RouteAlternative = requestedAlternative ?? 0;

  const from: [number, number] = [snap(origin[0]), snap(origin[1])];
  const to: [number, number] = [snap(destination[0]), snap(destination[1])];

  const [index, junctions, facilities] = await Promise.all([
    loadIndex(region),
    loadJunctions(region),
    loadFacilities(region),
  ]);

  if (!insideStudyArea(from, index.bbox) || !insideStudyArea(to, index.bbox)) {
    return fail(
      "out_of_area",
      "Both ends of the trip have to be inside the study area — there is no segment data to score against outside it.",
      400
    );
  }

  const provider = activeProvider();
  /**
   * A provider that has no alternatives returns the same route whatever is
   * asked for, so folding the request down to 0 keeps four identical copies of
   * one route out of a 200-entry cache — and keeps the echoed
   * `provider.alternative` honest about what was actually served.
   */
  const effectiveAlternative: RouteAlternative = provider.supportsAlternatives
    ? alternative
    : 0;

  const key = cacheKey(
    region,
    provider.id,
    routeType,
    effectiveAlternative,
    from,
    to
  );
  const hit = cacheGet(key);
  if (hit) return Response.json({ ...hit, cached: true });

  const result = await provider.route({
    region,
    origin: from,
    destination: to,
    routeType,
    alternative: effectiveAlternative,
  });

  if (!result.ok) {
    if (result.detail) {
      // Server-side only: the user gets the plain message, we get the reason.
      console.warn(
        `[route-score] ${provider.id}/${routeType}/alt${effectiveAlternative} failed (${result.kind}): ${result.detail}`
      );
    }
    const [message, status] = MESSAGES[result.kind];
    return fail(result.kind, message, status);
  }

  /**
   * Where the router actually began and ended, as against where it was asked
   * to. Every provider snaps the request onto its own network, and that snap
   * can be tens of metres — a click in the middle of a block, a park, or the
   * far side of a river barrier. The client draws the difference as an access
   * leg rather than leaving the pin floating next to an unexplained gap.
   */
  const line = result.route.line.geometry.coordinates;
  const first = line[0];
  const last = line[line.length - 1];
  const snapped =
    first && last
      ? {
          origin: [first[0], first[1]] as [number, number],
          destination: [last[0], last[1]] as [number, number],
        }
      : { origin: from, destination: to };

  const matched = matchRoute(result.route.line, index, junctions);
  const ours = estimateCyclingTime(matched.aggregate);
  const km = matched.aggregate.total_length_m / 1000;

  // The counterfactual, in the same units score_roi.R uses for the whole ward.
  const carMinutes = (km / URBAN_CAR_SPEED_KMH) * 60;

  const payload: RouteScoreResponse = {
    geometry: matched.geometry,
    snapped,
    stats: matched.aggregate,
    ours,
    provider: {
      id: provider.id,
      label: provider.label,
      supports_route_types: provider.supportsRouteTypes,
      supports_alternatives: provider.supportsAlternatives,
      route_type: routeType,
      alternative: effectiveAlternative,
    },
    reported: result.route.reported,
    car: {
      minutes: carMinutes,
      time_value_yen: carMinutes * TIME_VALUE_YEN_PER_CAR_MIN,
      operating_cost_yen: km * RUNNING_COST_YEN_PER_CAR_KM,
      co2_kg: km * CO2_KG_PER_CAR_KM,
      health_benefit_yen: km * HEALTH_YEN_PER_KM_CYCLED,
    },
    facilities: facilitiesNear(to, facilities),
    cached: false,
  };

  cacheSet(key, payload);
  return Response.json(payload);
}
