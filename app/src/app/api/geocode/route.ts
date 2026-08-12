/**
 * Address search for the two ends of a trip.
 *
 * Provider: Photon (photon.komoot.io), Komoot's open-source geocoder over the
 * same OpenStreetMap data the rest of this project is built from. Three reasons
 * it wins here over the obvious alternatives:
 *
 *  - Nominatim's usage policy singles out autocomplete as the thing not to do
 *    on the public instance, and this project has already been rate-limited off
 *    it once (PROJECT_STATUS A.2, where the boundary fetch was replaced with a
 *    local relation read). Type-ahead would earn that block a second time.
 *  - OpenRouteService's /geocode endpoints would work and the key is already
 *    here, but they draw on a separate free-tier allowance from directions.
 *    Spending it on keystrokes puts the page's one irreplaceable call — the
 *    route itself — behind a quota that a search box can exhaust.
 *  - Photon is built for search-as-you-type, indexes local names (so Japanese
 *    input works) alongside name:en, and takes a bbox, which is what keeps the
 *    results scoreable.
 *
 * It is a free service with no availability guarantee, so this is a
 * convenience layer over map clicking, never a prerequisite for it: when the
 * lookup fails, the panel says so and the map still sets both pins.
 *
 * Proxied server-side rather than called from the browser so that the bbox,
 * the cache and a polite User-Agent are enforced in one place, and so swapping
 * provider later touches this file only.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, Point, Polygon } from "geojson";
import type {
  GeocodeError,
  GeocodeErrorKind,
  GeocodeResponse,
  GeocodeResult,
} from "@/lib/geocode-types";

export const runtime = "nodejs";

const PHOTON_URL = "https://photon.komoot.io/api";
const RESULT_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

/**
 * Tighter than route-score's own OUT_OF_AREA_PAD_DEG (0.02°) on purpose. A
 * result the reader can pick but the scorer then rejects as out of area is a
 * worse failure than one that never appears, so the search box is allowed to
 * reach strictly less far than the scorer accepts.
 */
const SEARCH_PAD_DEG = 0.01;

// --- Study area ---------------------------------------------------------

/**
 * The hex grid, not segments.geojson: it covers the same ward, is a tenth of
 * the size, and this endpoint runs on keystrokes. Module-level promise, so the
 * parse happens once per instance rather than once per search.
 */
let bboxPromise: Promise<[number, number, number, number]> | null = null;

function studyAreaBbox(): Promise<[number, number, number, number]> {
  bboxPromise ??= readFile(
    path.join(process.cwd(), "public", "data", "hexagons.geojson"),
    "utf8"
  ).then((raw) => {
    const fc = JSON.parse(raw) as FeatureCollection<Polygon>;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const f of fc.features) {
      for (const ring of f.geometry.coordinates) {
        for (const [lon, lat] of ring) {
          if (lon < w) w = lon;
          if (lon > e) e = lon;
          if (lat < s) s = lat;
          if (lat > n) n = lat;
        }
      }
    }
    if (!Number.isFinite(w)) {
      throw new Error("hexagons.geojson has no coordinates to bound");
    }
    return [
      w - SEARCH_PAD_DEG,
      s - SEARCH_PAD_DEG,
      e + SEARCH_PAD_DEG,
      n + SEARCH_PAD_DEG,
    ] as [number, number, number, number];
  });
  return bboxPromise;
}

// --- Cache --------------------------------------------------------------

/**
 * Typing is prefix-heavy and correction-heavy — "honmoku", backspace,
 * "honmokusan" — so the same query comes back within seconds constantly. The
 * client debounces; this catches what survives the debounce. In-process only,
 * same caveat as the route cache: it is politeness towards a free service, not
 * infrastructure.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const cache = new Map<string, { at: number; results: GeocodeResult[] }>();

function cacheGet(key: string): GeocodeResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.results;
}

function cacheSet(key: string, results: GeocodeResult[]): void {
  cache.set(key, { at: Date.now(), results });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

// --- Photon -------------------------------------------------------------

/** The subset of Photon's feature properties this page reads. */
interface PhotonProperties {
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

/**
 * Japanese addresses arrive from OSM with most of the administrative hierarchy
 * populated and `street` usually absent, so the label is the name where there
 * is one and the numbered address where there isn't.
 */
function toResult(
  props: PhotonProperties,
  at: [number, number],
  index: number
): GeocodeResult | null {
  const street = [props.street, props.housenumber].filter(Boolean).join(" ");
  const label = props.name || street || props.postcode || props.city;
  if (!label) return null;

  // Widening rings, minus whatever is already the label — repeating "Naka-ku"
  // as its own subtitle tells the reader nothing.
  const seen = new Set([label]);
  const detail: string[] = [];
  for (const part of [props.district, props.city, props.county, props.state]) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    detail.push(part);
  }

  return {
    id: props.osm_type && props.osm_id ? `${props.osm_type}${props.osm_id}` : `r${index}`,
    label,
    detail: detail.join(" · "),
    at,
  };
}

async function search(
  query: string,
  bbox: [number, number, number, number]
): Promise<
  { ok: true; results: GeocodeResult[] } | { ok: false; kind: GeocodeErrorKind }
> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(RESULT_LIMIT * 2));
  // Falls back to the local name where there is no name:en, which in this
  // study area is most of the time — so this costs nothing and helps where
  // a place does carry an English name.
  url.searchParams.set("lang", "en");
  url.searchParams.set("bbox", bbox.join(","));
  // Rank towards the middle of the ward within that box.
  url.searchParams.set("lon", String((bbox[0] + bbox[2]) / 2));
  url.searchParams.set("lat", String((bbox[1] + bbox[3]) / 2));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Photon asks to be used fairly rather than anonymously; identifying
        // the app is the least this can do for a service it pays nothing for.
        "User-Agent": "Norimichi/0.1 (cycling network analysis, Naka-ku)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    return { ok: false, kind: "unavailable" };
  }

  if (!res.ok) return { ok: false, kind: "unavailable" };

  let body: FeatureCollection<Point, PhotonProperties>;
  try {
    body = (await res.json()) as FeatureCollection<Point, PhotonProperties>;
  } catch {
    return { ok: false, kind: "unavailable" };
  }

  const results: GeocodeResult[] = [];
  /**
   * Photon returns the same place once per OSM object — the node inside a park
   * and the way around it are two features with one name — and a list with the
   * same two lines twice reads as broken rather than as thorough. Deduped on
   * what the reader can actually see, not on identity or position: two rows
   * that render identically cannot be chosen between, whatever their ids say.
   * The higher-ranked one survives.
   */
  const seen = new Set<string>();
  for (const [i, f] of (body.features ?? []).entries()) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const result = toResult(f.properties ?? {}, [coords[0], coords[1]], i);
    if (!result) continue;
    const dedupe = `${result.label}|${result.detail}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    results.push(result);
    if (results.length >= RESULT_LIMIT) break;
  }

  return { ok: true, results };
}

// --- Handler ------------------------------------------------------------

function fail(
  error: GeocodeErrorKind,
  message: string,
  status: number
): Response {
  return Response.json({ error, message } satisfies GeocodeError, { status });
}

export async function GET(request: Request): Promise<Response> {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (query.length < MIN_QUERY_LENGTH) {
    return fail(
      "bad_request",
      `Type at least ${MIN_QUERY_LENGTH} characters to search.`,
      400
    );
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return fail("bad_request", "That search is too long.", 400);
  }

  const key = query.toLowerCase();
  const hit = cacheGet(key);
  if (hit) {
    return Response.json({ results: hit, cached: true } satisfies GeocodeResponse);
  }

  let bbox: [number, number, number, number];
  try {
    bbox = await studyAreaBbox();
  } catch {
    return fail(
      "unavailable",
      "The study area extent could not be read, so search cannot be restricted to it. Click the map to set the trip instead.",
      503
    );
  }

  const found = await search(query, bbox);
  if (!found.ok) {
    return fail(
      "unavailable",
      "Address search is unavailable right now. Click the map to set the trip instead.",
      503
    );
  }

  cacheSet(key, found.results);
  return Response.json({
    results: found.results,
    cached: false,
  } satisfies GeocodeResponse);
}
