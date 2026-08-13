/**
 * BRouter, against the public server at brouter.de.
 *
 * The one thing this does better than the ORS fallback: its profiles genuinely
 * differ, so the three `RouteType`s come back as three different routes rather
 * than one route wearing three labels. On a 6.4km test pair across this study
 * area the three profiles returned 6402m/935s, 6391m/962s and 6561m/570s — the
 * distinction is real, which is why `supportsRouteTypes` is true here and false
 * on ORS.
 *
 * ## Known limitations — read before relying on this
 *
 * - **No published rate limit and no uptime guarantee.** brouter.de is
 *   volunteer-run community infrastructure, not a commercial API with an SLA.
 *   The caution here is the same as the ORS fallback's but for a different
 *   reason: ORS might refuse us because we exhausted a documented quota, this
 *   might simply not answer, and nobody owes us an explanation. Treat an
 *   outage as normal operation, never retry into it, and never make it the
 *   only way the app can draw a route.
 * - **The profile set is fixed and stock.** These are upstream's profiles,
 *   tuned for European cycling, and there is no way to inject this project's
 *   own `lts` or `gap_score` into them. So this provider cannot avoid a road
 *   because *our* data says it is hostile — it avoids what its own author
 *   thought was hostile. This is a Phase 1 stand-in for a real router, not
 *   where our safety scoring lives. That is the `graph` provider.
 * - **Therefore this is not the long-term path.** The two real options are a
 *   self-hosted BRouter carrying a custom profile built from our own
 *   classification, or continued improvement of the `graph` provider. Adding
 *   more route types here would be motion, not progress.
 *
 * ## Why `fastbike.brf` and not `fastbike-asia-pacific.brf`
 *
 * The regional variant exists precisely to set `allow_motorways=true`, which
 * drops the cost factor for `highway=motorway|motorway_link` from 10000
 * (effectively blocked) to 1.5 (actively attractive) — fastbike.brf line 247.
 * In Japan that would route riders onto 自動車専用道路 where bicycles are
 * prohibited outright. The stock profile, with motorways left blocked, is the
 * correct choice for this study area.
 */

import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import { lineString } from "@turf/helpers";
import type { ProviderResult, RouteProvider, RouteRequest, RouteType } from "./types";

const BROUTER_URL = "https://brouter.de/brouter";

/**
 * 9s. Long enough for a cold cross-ward request against a server that answered
 * in ~1.4s in testing, short enough that a user is not left watching a spinner
 * on infrastructure that owes us nothing. See the reliability note above.
 */
const TIMEOUT_MS = 9_000;

/**
 * Profile file per route type, with the variable overrides we pin explicitly.
 *
 * Everything in `params` is pinned *even where it merely restates the profile's
 * own default*. That is deliberate: these are upstream files that get edited,
 * and a safety-relevant default silently flipping in a `git pull` we do not
 * control is exactly the failure this guards against. Pinning costs one query
 * parameter and removes the dependency.
 *
 * Two things about the override mechanism, both established against the live
 * server rather than from documentation:
 *
 * 1. The syntax is `profile:<name>=<value>`. A **bare** `?allow_motorways=0` is
 *    accepted and silently ignored — it returns byte-identical results — so
 *    getting this wrong fails open, quietly, in the permissive direction.
 * 2. Booleans must be `0`/`1`. Passing `profile:allow_motorways=false` returns
 *    **HTTP 500 with an empty body**, not a parse error. The `.brf` files
 *    themselves use `true`/`false` keywords, so this is a genuine trap.
 *
 * An unrecognised variable name is also silently ignored, so a typo here is
 * invisible. Check any change against the profile file before shipping it.
 */
interface ProfileChoice {
  file: string;
  params: Record<string, string>;
  /** Why this profile, for the next person to read the diff. */
  note: string;
}

const PROFILES: Record<RouteType, ProfileChoice> = {
  efficient: {
    file: "fastbike",
    params: {
      // Blocked, not merely discouraged — see the header note on the
      // asia-pacific variant. This restates fastbike.brf's own default.
      allow_motorways: "0",
      // The file's own default. Traffic is a slight preference, not a strong
      // one, which is what "efficient" should mean.
      consider_traffic: "0.1",
    },
    note: "fastbike.brf, motorways blocked",
  },

  relaxed: {
    file: "trekking",
    /**
     * Nothing to pin. trekking.brf has **no** `allow_motorways` variable at
     * all — motorway and motorway_link are hardcoded to cost 10000 at line
     * 283, so there is no permissive switch to close. Its nearest equivalent,
     * `avoid_unsafe`, runs the opposite way: it defaults to false and setting
     * it *true* is the more conservative choice (it adds cost to highways
     * without a bike hint). Left at its default so this stays the stock
     * trekking route rather than a tuning of our own invention.
     */
    params: {},
    note: "trekking.brf, motorways hardcoded blocked",
  },

  quick: {
    file: "vm-forum-velomobil-schnell",
    params: {
      /**
       * This profile's own regional-permissive variable — the pattern that
       * `allow_motorways` follows on fastbike, found by checking rather than
       * assuming fastbike was the only one. Its comment reads "für Regionen
       * mit falschen bicycle=no tags können sie mit true ignoriert werden":
       * setting it true makes the router ignore `bicycle=no` and route through
       * ways where cycling is explicitly prohibited. Default is already 0;
       * pinned because in Japan `bicycle=no` is usually correct, not a tagging
       * error, and this is not a default we want to inherit silently.
       *
       * Motorways need no pin here — hardcoded to 10000 at lines 263 and 306.
       */
      ignore_bicycle_no: "0",
    },
    note: "vm-forum-velomobil-schnell.brf, bicycle=no respected",
  },
};

/**
 * A velomobile is an enclosed recumbent doing 40-50km/h, and this profile is
 * tuned for one: it actively avoids cycleways (`avoid_cycleways=8`) and small
 * roads (`avoid_small_roads=5`) because they are too twisty to be quick in.
 * For an ordinary rider on an ordinary bike that means "quick" will prefer
 * main roads over the cycle network — defensible as the fastest route, but it
 * is the route type most likely to send someone somewhere unpleasant, and its
 * `total-time` assumes a vehicle the rider is not on. The LTS colouring the
 * scorer puts underneath it is the honest counterweight.
 */
export const QUICK_PROFILE_CAVEAT =
  "The 'quick' profile is tuned for velomobiles: it prefers main roads over cycleways and its own time estimate assumes a much faster vehicle.";

/** BRouter reports metres and seconds as strings. */
function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * BRouter returns `[lon, lat, elevation]`. The elevation is real and useful,
 * but nothing downstream reads it and carrying it through means the matcher
 * and the map layer see a different coordinate arity from every other
 * provider. Dropped here so all three providers hand back the same shape.
 */
const to2d = (coords: Position[]): Position[] =>
  coords.map((c) => [c[0], c[1]]);

function buildUrl(req: RouteRequest): string {
  const choice = PROFILES[req.routeType] ?? PROFILES.efficient;
  const url = new URL(BROUTER_URL);

  url.searchParams.set(
    "lonlats",
    `${req.origin[0]},${req.origin[1]}|${req.destination[0]},${req.destination[1]}`
  );
  url.searchParams.set("profile", choice.file);
  url.searchParams.set("format", "geojson");
  /**
   * 0 is the optimum, 1-3 are progressively costlier ways of getting there.
   * Verified against the live server: all four return distinct geometry for
   * every profile here, with cost rising monotonically, so an alternative is a
   * real second opinion rather than the same line renumbered.
   */
  url.searchParams.set("alternativeidx", String(req.alternative));

  for (const [name, value] of Object.entries(choice.params)) {
    url.searchParams.set(`profile:${name}`, value);
  }

  return url.toString();
}

export const brouterProvider: RouteProvider = {
  id: "brouter",
  label: "BRouter",
  /**
   * True, and unlike ORS this is not a courtesy. The three profiles are
   * genuinely different cost models and return genuinely different routes.
   */
  supportsRouteTypes: true,
  /** `alternativeidx`, and the only provider here that offers it. */
  supportsAlternatives: true,

  async route(req: RouteRequest): Promise<ProviderResult> {
    let res: Response;
    try {
      res = await fetch(buildUrl(req), {
        headers: { Accept: "application/geo+json, application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      /**
       * Timeout and connection failure land here together, and both are the
       * same thing to a user: the upstream did not answer. No retry — a public
       * community server that is struggling is the last thing that should be
       * hit twice, and this provider answers exactly one route type per call,
       * so there is nothing to salvage by trying again.
       */
      return {
        ok: false,
        kind: "unavailable",
        detail: `brouter.de did not respond within ${TIMEOUT_MS}ms`,
      };
    }

    if (!res.ok) {
      // 500 with a zero-length body is a real, observed response — an invalid
      // profile override produces exactly that. Read defensively.
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        kind: "unavailable",
        detail: `brouter.de returned ${res.status}${
          body ? `: ${body.slice(0, 200)}` : " with an empty body"
        }`,
      };
    }

    let body: FeatureCollection<
      LineString,
      Record<string, unknown>
    >;
    try {
      body = (await res.json()) as FeatureCollection<
        LineString,
        Record<string, unknown>
      >;
    } catch {
      return { ok: false, kind: "unavailable", detail: "unparseable body" };
    }

    const feature = body.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      // BRouter answers 200 with an empty collection when it cannot connect
      // the points, so this is "no route", not an outage.
      return { ok: false, kind: "no_route" };
    }

    const props = feature.properties ?? {};
    const distance = numeric(props["track-length"]);
    const seconds = numeric(props["total-time"]);

    return {
      ok: true,
      route: {
        line: lineString(to2d(coords)) as Feature<LineString>,
        // BRouter's own figures, from its own routing — shown beside our
        // signal-aware estimate exactly as ORS's summary is, never instead.
        reported:
          distance === null
            ? null
            : { distance_m: distance, minutes: (seconds ?? 0) / 60 },
      },
    };
  },
};
