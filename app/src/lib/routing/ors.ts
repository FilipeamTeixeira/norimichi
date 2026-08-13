/**
 * OpenRouteService, as a provider.
 *
 * Lifted almost verbatim out of the route-score handler, where it was the only
 * way to get a route. Its behaviour is unchanged; what changed is that it is now
 * one option among three rather than the definition of "routing".
 *
 * The key is read from ORS_API_KEY, deliberately not prefixed NEXT_PUBLIC_, and
 * only ever used server-side.
 */

import type { Feature, FeatureCollection, LineString } from "geojson";
import type { RouteErrorKind } from "../route-types";
import type { ProviderResult, RouteProvider, RouteRequest } from "./types";

const ORS_URL =
  "https://api.openrouteservice.org/v2/directions/cycling-regular/geojson";

const TIMEOUT_MS = 15_000;

/**
 * Read ORS's failure back as one of our own states.
 *
 * The distinction that matters to a user is "come back tomorrow" versus
 * "something is broken", and ORS signals the first with both 429 (per-minute
 * throttle) and 403 (daily quota) — 403 is also what an invalid key returns,
 * so the body has to be looked at rather than the status alone.
 */
function classifyFailure(status: number, body: string): RouteErrorKind {
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

export const orsProvider: RouteProvider = {
  id: "ors",
  label: "OpenRouteService",
  /**
   * False, and this is the honest answer rather than a missing feature. ORS
   * does expose `preference` (fastest/shortest) and avoid-features, but on the
   * single `cycling-regular` profile those do not correspond to the three route
   * types this app offers, and wiring them up would produce three labels over
   * what is substantially one route. The UI is expected to say the selector is
   * inert here. BRouter is the provider that does this properly.
   */
  supportsRouteTypes: false,
  /**
   * False. ORS does have an `alternative_routes` option, but it is an opt-in
   * request body field with its own share/weight tuning and it multiplies the
   * quota cost of a request on a 2,000/day free tier. Not wired up rather than
   * not available — say so if it is ever wanted.
   */
  supportsAlternatives: false,

  async route(req: RouteRequest): Promise<ProviderResult> {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        kind: "not_configured",
        detail: "ORS_API_KEY is not set",
      };
    }

    let res: Response;
    try {
      res = await fetch(ORS_URL, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json",
        },
        body: JSON.stringify({
          coordinates: [req.origin, req.destination],
        }),
        // Nothing here is cached by fetch; the coordinate-grid cache is.
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, kind: "unavailable", detail: "network or timeout" };
    }

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, kind: classifyFailure(res.status, body), detail: body.slice(0, 200) };
    }

    const body = (await res.json()) as FeatureCollection<
      LineString,
      { summary?: { distance: number; duration: number } }
    >;
    const feature = body.features?.[0];
    if (!feature || feature.geometry.coordinates.length < 2) {
      return { ok: false, kind: "no_route" };
    }

    const summary = feature.properties?.summary;

    return {
      ok: true,
      route: {
        line: feature as Feature<LineString>,
        reported:
          summary && Number.isFinite(summary.distance)
            ? {
                distance_m: summary.distance,
                minutes: (summary.duration ?? 0) / 60,
              }
            : null,
      },
    };
  },
};
