/**
 * One fixed origin/destination pair, put through every provider.
 *
 * The point is not to check that a particular route comes back — routes change
 * when OSM changes, and asserting on geometry would make this a test of
 * upstream's data rather than of our code. It checks the thing that actually
 * has to hold for the provider layer to be worth having: that all three
 * backends satisfy the same interface and hand back something the scorer can
 * consume, so a route from any of them is comparable with a route from any
 * other.
 *
 * ## What is and is not asserted for network providers
 *
 * `graph` runs offline against our own data, so it is asserted strictly: it
 * must succeed. `ors` and `brouter` reach third parties, and a test that fails
 * because a volunteer-run server was busy is a test that gets deleted. So they
 * are asserted on *shape*, always: whatever comes back must be a well-formed
 * `ProviderResult` — either a usable route or a declared failure with a known
 * `RouteErrorKind`. A provider that throws, returns a malformed route, or
 * invents an error kind fails the test; a provider whose upstream is down does
 * not. That distinction is the whole reliability contract from the BRouter
 * provider's header, expressed as an assertion.
 *
 * Set `ROUTING_STRICT_LIVE=1` to additionally require the network providers to
 * actually succeed — for use in a deliberate connectivity check, not CI.
 */

import { describe, expect, it } from "vitest";
import type { Feature, LineString } from "geojson";
import { estimateCyclingTime, matchRoute } from "../route-matching";
import { brouterProvider } from "./brouter";
import { loadIndex, loadJunctions } from "./data";
import { graphProvider } from "./graph";
import { orsProvider } from "./ors";
import {
  ROUTE_TYPES,
  type ProviderResult,
  type RouteProvider,
} from "./types";

/**
 * Both ends well inside the study area and a few km apart, so every provider
 * has a real route to find rather than a degenerate one. Same pair the BRouter
 * profile comparison in that provider's header was measured on.
 */
const ORIGIN: [number, number] = [139.635, 35.42];
const DESTINATION: [number, number] = [139.675, 35.445];

const KNOWN_ERROR_KINDS = new Set([
  "not_configured",
  "quota",
  "unavailable",
  "no_route",
  "out_of_area",
  "bad_request",
]);

const STRICT = process.env.ROUTING_STRICT_LIVE === "1";

/** Everything that has to be true of a route before the scorer may touch it. */
function expectUsableRoute(line: Feature<LineString>): void {
  expect(line.type).toBe("Feature");
  expect(line.geometry.type).toBe("LineString");

  const coords = line.geometry.coordinates;
  expect(coords.length).toBeGreaterThanOrEqual(2);

  for (const c of coords) {
    // 2D exactly: BRouter returns [lon, lat, ele] and the provider is
    // responsible for dropping the third ordinate so every provider's output
    // has the same arity.
    expect(c).toHaveLength(2);
    expect(Number.isFinite(c[0])).toBe(true);
    expect(Number.isFinite(c[1])).toBe(true);
    // Plausibly Japan, i.e. not silently lat/lon-swapped — the one geometry
    // error that produces a valid-looking LineString.
    expect(c[0]).toBeGreaterThan(139);
    expect(c[0]).toBeLessThan(140);
    expect(c[1]).toBeGreaterThan(35);
    expect(c[1]).toBeLessThan(36);
  }
}

function expectWellFormed(result: ProviderResult): void {
  if (result.ok) {
    expectUsableRoute(result.route.line);

    // Null is allowed — it means "this provider has no independent figures".
    // A present one has to be real numbers, not NaN dressed up as a claim.
    const reported = result.route.reported;
    if (reported !== null) {
      expect(Number.isFinite(reported.distance_m)).toBe(true);
      expect(reported.distance_m).toBeGreaterThan(0);
      expect(Number.isFinite(reported.minutes)).toBe(true);
      expect(reported.minutes).toBeGreaterThanOrEqual(0);
    }
    return;
  }

  expect(KNOWN_ERROR_KINDS.has(result.kind)).toBe(true);
}

const PROVIDERS: RouteProvider[] = [graphProvider, orsProvider, brouterProvider];

describe("route providers", () => {
  it("expose distinct ids and a label", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.supportsRouteTypes).toBe("boolean");
      expect(typeof p.supportsAlternatives).toBe("boolean");
    }
  });

  /**
   * `supportsAlternatives` checked rather than trusted, same as the route-type
   * claim below. The UI hides the control entirely where this is false, so a
   * provider claiming it and then returning one route four times would leave a
   * control that silently does nothing.
   *
   * Only asserted where the provider actually answered — an upstream outage
   * must not fail this, per the file header.
   */
  it.each(PROVIDERS.filter((p) => p.supportsAlternatives).map((p) => [p.id, p] as const))(
    "%s returns a different route for alternative 1 than for 0",
    async (id, provider) => {
      const [original, alternative] = await Promise.all([
        provider.route({
          origin: ORIGIN,
          destination: DESTINATION,
          routeType: "efficient",
          alternative: 0,
        }),
        provider.route({
          origin: ORIGIN,
          destination: DESTINATION,
          routeType: "efficient",
          alternative: 1,
        }),
      ]);

      expectWellFormed(original);
      expectWellFormed(alternative);

      if (!original.ok || !alternative.ok) {
        if (STRICT) throw new Error(`${id} did not answer for both alternatives`);
        console.warn(`[test] ${id} unavailable — alternatives not compared`);
        return;
      }

      expect(
        JSON.stringify(alternative.route.line.geometry.coordinates)
      ).not.toBe(JSON.stringify(original.route.line.geometry.coordinates));
    }
  );

  describe.each(PROVIDERS.map((p) => [p.id, p] as const))(
    "%s",
    (id, provider) => {
      const offline = id === "graph";

      it.each(ROUTE_TYPES)("returns a well-formed result for %s", async (routeType) => {
        const result = await provider.route({
          origin: ORIGIN,
          destination: DESTINATION,
          routeType,
          alternative: 0,
        });

        expectWellFormed(result);

        if (offline || STRICT) {
          // The graph provider has no excuse: its data is on disk.
          if (!result.ok) {
            throw new Error(`${id}/${routeType} failed: ${result.kind} ${result.detail ?? ""}`);
          }
        } else if (!result.ok) {
          console.warn(
            `[test] ${id}/${routeType} unavailable (${result.kind}) — shape asserted, route not. ${result.detail ?? ""}`
          );
        }
      });
    }
  );

  /**
   * The reason the provider interface returns a bare LineString: every
   * provider's geometry goes through the *same* scorer. This is the assertion
   * that the layer holds together — a route from any backend has to be
   * consumable by `matchRoute` and produce a usable aggregate, or the three
   * are not comparable and the abstraction is decorative.
   *
   * BRouter is the one that could plausibly break it, since it returns
   * `[lon, lat, ele]` and a 267-point line where ORS returns 2D.
   */
  it("produces geometry every provider's output can be scored from", async () => {
    const [index, junctions] = await Promise.all([loadIndex(), loadJunctions()]);

    for (const provider of PROVIDERS) {
      const result = await provider.route({
        origin: ORIGIN,
        destination: DESTINATION,
        routeType: "efficient",
        alternative: 0,
      });

      if (!result.ok) {
        if (provider.id === "graph" || STRICT) {
          throw new Error(`${provider.id} failed: ${result.kind}`);
        }
        console.warn(`[test] ${provider.id} unavailable — scoring not exercised`);
        continue;
      }

      const matched = matchRoute(result.route.line, index, junctions);
      const agg = matched.aggregate;

      expect(agg.total_length_m).toBeGreaterThan(0);
      expect(agg.matched_share).toBeGreaterThan(0);
      expect(agg.matched_share).toBeLessThanOrEqual(1);
      expect(agg.lts_bands).toHaveLength(4);
      expect(matched.geometry.features.length).toBeGreaterThan(0);

      const time = estimateCyclingTime(agg);
      expect(Number.isFinite(time.minutes)).toBe(true);
      expect(time.minutes).toBeGreaterThan(0);

      /**
       * The graph provider routes on the very segments it is then matched
       * against, so anything short of a near-total match means the matcher and
       * the router disagree about the network they share — which would be a
       * bug in one of them, not the expected imprecision of overlaying an
       * external route.
       */
      if (provider.id === "graph") {
        expect(agg.matched_share).toBeGreaterThan(0.99);
      }
    }
  });

  /**
   * The claim `supportsRouteTypes` makes, checked rather than trusted.
   *
   * It is the one piece of provider metadata the UI uses to decide whether to
   * tell the user their selector did anything, so a provider quietly returning
   * one route under three labels is a real bug. Only meaningful when the
   * provider actually answered, hence the skip rather than a failure.
   */
  it("gives the graph provider genuinely different routes per route type", async () => {
    const results = await Promise.all(
      ROUTE_TYPES.map((routeType) =>
        graphProvider.route({ origin: ORIGIN, destination: DESTINATION, routeType, alternative: 0 })
      )
    );

    const shapes = results.map((r) =>
      r.ok ? JSON.stringify(r.route.line.geometry.coordinates) : null
    );
    expect(shapes.every((s) => s !== null)).toBe(true);

    // `relaxed` weights LTS ~8x on hostile roads and `quick` barely at all, so
    // these two in particular should not agree across a multi-km trip.
    const relaxed = shapes[ROUTE_TYPES.indexOf("relaxed")];
    const quick = shapes[ROUTE_TYPES.indexOf("quick")];
    expect(relaxed).not.toBe(quick);
  });
});
