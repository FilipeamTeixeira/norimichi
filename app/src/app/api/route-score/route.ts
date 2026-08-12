/**
 * Score one A→B cycling trip against this project's own segment data.
 *
 * The division of labour is the whole design: OpenRouteService supplies *only*
 * the path geometry, from its own generic cycling profile, and everything that
 * makes the answer worth reading — the stress breakdown, the sidewalk and
 * informal-parking exposure, the signal-aware travel time, the cost and CO₂
 * comparison — comes from segments.geojson via lib/route-matching.ts. See
 * PROJECT_STATUS.md C.3: this is the "V1" overlay path, not routing on our own
 * data. ORS has never seen `lts` and does not avoid a hostile road; this
 * endpoint reports what its route runs along, it does not look for a better
 * one.
 *
 * The key stays here. It is read from ORS_API_KEY, deliberately not prefixed
 * NEXT_PUBLIC_, and the client only ever talks to this handler.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";
import {
  buildSegmentIndex,
  buildSignalJunctions,
  estimateCyclingTime,
  matchRoute,
  type SegmentIndex,
  type SignalJunctions,
} from "@/lib/route-matching";
import type {
  NearbyFacility,
  RouteErrorKind,
  RouteScoreError,
  RouteScoreResponse,
} from "@/lib/route-types";
import type {
  BikeFacilityProperties,
  SegmentProperties,
} from "@/lib/types";
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

const ORS_URL =
  "https://api.openrouteservice.org/v2/directions/cycling-regular/geojson";

// --- Data, loaded once per process -------------------------------------

/**
 * segments.geojson is 3.2MB and 3,188 features, and the index over it costs
 * real time to build. Both are static for the life of a deployment, so this is
 * a module-level promise: the first request into a cold instance pays for it,
 * every later request on that instance gets it for free. Never per-request.
 */
let indexPromise: Promise<SegmentIndex> | null = null;
let junctionsPromise: Promise<SignalJunctions> | null = null;
let facilitiesPromise: Promise<
  FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
> | null = null;

const dataPath = (name: string) =>
  path.join(process.cwd(), "public", "data", name);

function loadIndex(): Promise<SegmentIndex> {
  indexPromise ??= readFile(dataPath("segments.geojson"), "utf8").then((raw) =>
    buildSegmentIndex(
      JSON.parse(raw) as FeatureCollection<MultiLineString, SegmentProperties>
    )
  );
  return indexPromise;
}

function loadJunctions(): Promise<SignalJunctions> {
  junctionsPromise ??= readFile(dataPath("traffic_signals.geojson"), "utf8").then(
    (raw) =>
      buildSignalJunctions(JSON.parse(raw) as FeatureCollection<GeoJSON.Point>)
  );
  return junctionsPromise;
}

function loadFacilities() {
  facilitiesPromise ??= readFile(dataPath("bike_facilities.geojson"), "utf8").then(
    (raw) =>
      JSON.parse(raw) as FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
  );
  return facilitiesPromise;
}

// --- Cache --------------------------------------------------------------

/**
 * ~100m coordinate grid. Three decimal places is 111m of latitude and 91m of
 * longitude at Yokohama's latitude, and ORS snaps a request to the nearest road
 * within its own default radius anyway — so two clicks in the same block are
 * one route, and one request against a 2,000/day quota rather than two.
 *
 * The rounded coordinates are what is sent to ORS, not just what is used as the
 * key. Keying on a rounded value while requesting an unrounded one would file
 * a whole block's worth of genuinely different routes under one entry.
 */
const GRID_DECIMALS = 3;
const snap = (v: number) => Number(v.toFixed(GRID_DECIMALS));

/**
 * In-process only, so it empties whenever the instance is recycled and is not
 * shared between concurrent serverless instances. That is a real limit on how
 * much quota it saves in production, and the honest fix is a shared store (KV)
 * rather than pretending this is one — but it costs nothing and it covers the
 * case that actually burns quota, which is one person trying the same trip
 * repeatedly while reading the panel.
 */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; payload: RouteScoreResponse }>();

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

function fail(
  error: RouteErrorKind,
  message: string,
  status: number
): Response {
  return Response.json({ error, message } satisfies RouteScoreError, {
    status,
  });
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

/**
 * Read ORS's failure back as one of our own states.
 *
 * The distinction that matters to a user is "come back tomorrow" versus
 * "something is broken", and ORS signals the first with both 429 (per-minute
 * throttle) and 403 (daily quota) — 403 is also what an invalid key returns,
 * so the body has to be looked at rather than the status alone.
 */
function classifyOrsFailure(status: number, body: string): RouteErrorKind {
  const text = body.toLowerCase();
  if (status === 429) return "quota";
  if (status === 403) {
    if (text.includes("quota") || text.includes("rate limit")) return "quota";
    return "not_configured";
  }
  if (status === 401) return "not_configured";
  // 2009 = no route found between the points, 2010 = no road near a point.
  if (text.includes('"code":2009') || text.includes('"code":2010')) {
    return "no_route";
  }
  if (status === 404) return "no_route";
  return "unavailable";
}

async function fetchOrsRoute(
  origin: [number, number],
  destination: [number, number],
  apiKey: string
): Promise<
  | { ok: true; feature: Feature<LineString, { summary?: { distance: number; duration: number } }> }
  | { ok: false; kind: RouteErrorKind }
> {
  let res: Response;
  try {
    res = await fetch(ORS_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify({ coordinates: [origin, destination] }),
      // Nothing here is cached by fetch; the coordinate-grid cache above is.
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, kind: "unavailable" };
  }

  if (!res.ok) {
    return { ok: false, kind: classifyOrsFailure(res.status, await res.text()) };
  }

  const body = (await res.json()) as FeatureCollection<
    LineString,
    { summary?: { distance: number; duration: number } }
  >;
  const feature = body.features?.[0];
  if (!feature || feature.geometry.coordinates.length < 2) {
    return { ok: false, kind: "no_route" };
  }
  return { ok: true, feature };
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

// --- Handler ------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return fail(
      "not_configured",
      "ORS_API_KEY is not set on the server. Add it to .env.local (never prefixed NEXT_PUBLIC_) and restart.",
      503
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_request", "Expected a JSON body.", 400);
  }

  const { origin, destination } = (body ?? {}) as Record<string, unknown>;
  if (!isCoordinate(origin) || !isCoordinate(destination)) {
    return fail(
      "bad_request",
      "origin and destination must each be a [lon, lat] pair.",
      400
    );
  }

  const from: [number, number] = [snap(origin[0]), snap(origin[1])];
  const to: [number, number] = [snap(destination[0]), snap(destination[1])];

  const [index, junctions, facilities] = await Promise.all([
    loadIndex(),
    loadJunctions(),
    loadFacilities(),
  ]);

  if (!insideStudyArea(from, index.bbox) || !insideStudyArea(to, index.bbox)) {
    return fail(
      "out_of_area",
      "Both ends of the trip have to be inside the study area — there is no segment data to score against outside it.",
      400
    );
  }

  const key = `${from[0]},${from[1]}|${to[0]},${to[1]}`;
  const cached = cacheGet(key);
  if (cached) return Response.json({ ...cached, cached: true });

  const route = await fetchOrsRoute(from, to, apiKey);
  if (!route.ok) {
    const messages: Record<RouteErrorKind, [string, number]> = {
      quota: [
        "The routing service has hit its daily request limit. Route scoring will work again tomorrow; everything else on the site is unaffected.",
        503,
      ],
      not_configured: [
        "The routing service rejected our API key. Check ORS_API_KEY on the server.",
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
    const [message, status] = messages[route.kind];
    return fail(route.kind, message, status);
  }

  const matched = matchRoute(route.feature, index, junctions);
  const ours = estimateCyclingTime(matched.aggregate);

  const summary = route.feature.properties?.summary;
  const orsDistance = summary?.distance ?? matched.aggregate.total_length_m;
  const km = matched.aggregate.total_length_m / 1000;

  // The counterfactual, in the same units score_roi.R uses for the whole ward.
  const carMinutes = (km / URBAN_CAR_SPEED_KMH) * 60;

  const payload: RouteScoreResponse = {
    geometry: matched.geometry,
    stats: matched.aggregate,
    ours,
    ors: { distance_m: orsDistance, minutes: (summary?.duration ?? 0) / 60 },
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
