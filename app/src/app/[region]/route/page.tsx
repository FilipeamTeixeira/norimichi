"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import MapView, { type MapControls } from "@/components/map/MapView";
import RouteLayer from "@/components/map/RouteLayer";
import type { Endpoint } from "@/components/route/AddressSearch";
import RouteInputPanel, {
  type PinTarget,
} from "@/components/route/RouteInputPanel";
import RouteResultPanel from "@/components/route/RouteResultPanel";
import Legend, { type LegendSection } from "@/components/panels/Legend";
import {
  ACCESS_LEG_COLOR,
  ACCESS_LEG_DASH,
  accessLegs,
} from "@/lib/access-leg";
import { ltsBandLabel } from "@/lib/metrics";
import { NO_DATA, STRESS_LINE, type LegendEntry } from "@/lib/scales";
import {
  isRouteError,
  type RouteErrorKind,
  type ProviderInfo,
  type RouteScoreError,
  type RouteScoreResponse,
} from "@/lib/route-types";
import type { RouteAlternative, RouteType } from "@/lib/routing/types";
import { useT } from "@/i18n/context";
import type { Dict } from "@/i18n/en";

/**
 * Route Analysis — the personal A→B half of the project, as against the
 * planner-facing network view.
 *
 * The map here carries no analysis layer of its own. The network page's whole
 * design rule is that exactly one layer competes for the colour channel, and on
 * this page that layer is the route: painting the 3,188-segment network
 * underneath it in the same four colours would put the answer and its
 * background in one visual language, which is the one thing guaranteed to make
 * neither readable.
 */

type Point = [number, number];

/**
 * Bounds of a route, for the fit after a result comes back. The two pins are
 * folded in as well: the router snaps each end onto its own network, and a fit
 * to the line alone would push a pin that snapped inward off the edge of the
 * view — the one part of the picture the reader placed themselves.
 */
function routeBounds(
  result: RouteScoreResponse,
  pins: Point[]
): [[number, number], [number, number]] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const see = ([lon, lat]: number[]) => {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  };
  for (const f of result.geometry.features) {
    for (const c of f.geometry.coordinates) see(c);
  }
  for (const p of pins) see(p);
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

/**
 * How a map click reads back in the search field. An address picked from
 * search names itself; a click has no name, and inventing one by reverse
 * geocoding would spend a request to relabel a point the reader placed
 * themselves and can see on the screen.
 */
const pinLabel = ([lon, lat]: Point, t: Dict) =>
  t.route.pinLabel(lat.toFixed(4), lon.toFixed(4));

export default function RouteAnalysisPage() {
  const t = useT();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [pins, setPins] = useState<{
    origin: Endpoint | null;
    destination: Endpoint | null;
  }>({ origin: null, destination: null });
  const [next, setNext] = useState<PinTarget>("origin");
  /**
   * What the rider is optimising for. Honoured by `graph` and `brouter`,
   * accepted and ignored by `ors` — the panel says which, once a result has
   * come back and there is a provider to ask.
   */
  const [routeType, setRouteType] = useState<RouteType>("efficient");
  /**
   * Which of the router's ranked answers to show. Only BRouter has more than
   * one; the control hides itself elsewhere and the handler folds the value
   * back to 0 for providers that cannot honour it.
   */
  const [alternative, setAlternative] = useState<RouteAlternative>(0);
  const [result, setResult] = useState<RouteScoreResponse | null>(null);
  /**
   * The last provider that answered, held separately from `result`.
   *
   * The two selectors describe *the backend*, not the current route, and a
   * failed request clears `result` — so reading the provider off `result`
   * would make the alternatives control vanish and the route-preference note
   * fall back to generic wording at precisely the moment the reader wants to
   * change something and try again. What the provider is has not changed just
   * because one request to it failed.
   */
  const [lastProvider, setLastProvider] = useState<ProviderInfo | null>(null);
  const [error, setError] = useState<{
    kind: RouteErrorKind;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const mapControls = useRef<MapControls | null>(null);

  /**
   * The map click handler is registered once and outlives any given render, so
   * it reads both the pins and which end is next from refs rather than from
   * values captured at registration time.
   */
  const pinsRef = useRef(pins);
  const nextRef = useRef(next);
  const routeTypeRef = useRef(routeType);
  const alternativeRef = useRef(alternative);
  useEffect(() => {
    pinsRef.current = pins;
    nextRef.current = next;
    routeTypeRef.current = routeType;
    alternativeRef.current = alternative;
  }, [pins, next, routeType, alternative]);

  /**
   * Monotonic request id. Moving a pin while a score is in flight leaves an
   * older response still on its way back, and applying it would show a panel
   * that describes a route the reader has already changed. Aborting the fetch
   * would not help: the quota was spent the moment the request left, so the
   * only thing worth doing is ignoring the answer.
   */
  const requestId = useRef(0);

  /**
   * The dictionary as a ref, for the same reason the pins are: `score` and the
   * map click handler are registered once and outlive the render that made
   * them, so a captured `t` would keep producing the language that was active
   * when the map mounted.
   */
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const score = useCallback(async (from: Point, to: Point) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/route-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: from,
          destination: to,
          // Read from the ref, not from state, for the same reason the pins
          // are: `score` is captured by the map click handler registered once.
          route_type: routeTypeRef.current,
          alternative: alternativeRef.current,
        }),
      });
      const body = (await res.json()) as RouteScoreResponse | RouteScoreError;
      if (id !== requestId.current) return;

      if (isRouteError(body)) {
        setResult(null);
        setError({ kind: body.error, message: body.message });
        return;
      }
      setResult(body);
      setLastProvider(body.provider);
      const bounds = routeBounds(body, [from, to]);
      if (bounds) mapControls.current?.fitBounds(bounds);
    } catch (err) {
      if (id !== requestId.current) return;
      setResult(null);
      setError({
        kind: "unavailable",
        message: tRef.current.errors.unreachable(
          err instanceof Error ? err.message : tRef.current.errors.unknown
        ),
      });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /** Move one end, and score as soon as both exist. */
  const setPin = useCallback(
    (target: PinTarget, at: Point, label: string) => {
      const updated = { ...pinsRef.current, [target]: { at, label } };
      pinsRef.current = updated;
      setPins(updated);
      // Alternate ends automatically: the common case is placing both in one
      // go, and reaching for the sidebar between them is friction for no
      // decision.
      setNext(target === "origin" ? "destination" : "origin");
      if (updated.origin && updated.destination) {
        void score(updated.origin.at, updated.destination.at);
      }
    },
    [score]
  );

  /**
   * A search result, as against a map click. Same pin, one extra job: the
   * reader picked this end by name and may never have had it on screen, so a
   * pin dropped outside the current view has to be brought into it or the
   * search silently appears to have done nothing.
   *
   * Not when this completes the pair — the route fit below is a moment away
   * and already frames both ends, so panning first would be a move the reader
   * has to sit through twice.
   */
  const pick = useCallback(
    (target: PinTarget, at: Point, label: string) => {
      const other =
        target === "origin"
          ? pinsRef.current.destination
          : pinsRef.current.origin;
      setPin(target, at, label);
      if (!other && map && !map.getBounds().contains(at)) {
        map.easeTo({ center: at });
      }
    },
    [map, setPin]
  );

  /**
   * Emptying one end without touching the other. The result panel goes with
   * it: it describes a route that no longer has two ends, and leaving it up
   * would let the reader read numbers for a trip they have just dismantled.
   */
  const clearOne = useCallback((target: PinTarget) => {
    requestId.current += 1;
    const updated = { ...pinsRef.current, [target]: null };
    pinsRef.current = updated;
    setPins(updated);
    setNext(target);
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  const handleMapReady = useCallback((m: MapLibreMap) => setMap(m), []);

  // --- Dropping pins -----------------------------------------------------
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapMouseEvent) => {
      const at: Point = [e.lngLat.lng, e.lngLat.lat];
      setPin(nextRef.current, at, pinLabel(at, tRef.current));
    };

    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [map, setPin]);

  const clear = useCallback(() => {
    // Invalidates anything in flight, so a late response cannot repopulate the
    // panel the reader just dismissed.
    requestId.current += 1;
    pinsRef.current = { origin: null, destination: null };
    setPins(pinsRef.current);
    setNext("origin");
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  /**
   * Changing what the route is optimising for re-runs it immediately, rather
   * than waiting for the reader to nudge a pin. The whole point of the control
   * is to compare the three against each other, and a selector that changes a
   * label but not the line would invite exactly the wrong conclusion.
   *
   * Cheap to do: provider + route type are both in the cache key, so flipping
   * back and forth between two already-seen options costs nothing upstream.
   */
  const changeRouteType = useCallback(
    (value: RouteType) => {
      if (value === routeTypeRef.current) return;
      routeTypeRef.current = value;
      setRouteType(value);

      const { origin, destination } = pinsRef.current;
      if (origin && destination) void score(origin.at, destination.at);
    },
    [score]
  );

  /** Same immediate re-score as the route type, for the same reason. */
  const changeAlternative = useCallback(
    (value: RouteAlternative) => {
      if (value === alternativeRef.current) return;
      alternativeRef.current = value;
      setAlternative(value);

      const { origin, destination } = pinsRef.current;
      if (origin && destination) void score(origin.at, destination.at);
    },
    [score]
  );

  const swap = useCallback(() => {
    const { origin, destination } = pinsRef.current;
    if (!origin || !destination) return;
    pinsRef.current = { origin: destination, destination: origin };
    setPins(pinsRef.current);
    void score(destination.at, origin.at);
  }, [score]);

  /**
   * Only the classes this route actually contains. A fixed four-row key would
   * claim the trip touches an LTS 4 street when it doesn't — the stacked bar in
   * the panel is where the full domain belongs, because that is a comparison;
   * this is a description of one line on the screen.
   */
  const legendSections = useMemo<LegendSection[]>(() => {
    if (!result) return [];
    const entries: LegendEntry[] = result.stats.lts_bands
      .filter((b) => b.length_m > 0)
      .map((b) => ({
        color: STRESS_LINE[b.lts - 1],
        label: ltsBandLabel(t, b.lts),
      }));
    if (result.stats.unmatched_length_m > 0) {
      entries.push({ color: NO_DATA, label: t.route.legend.notMatched });
    }
    // Only when there is actually one on the screen. A row for a mark the map
    // isn't making is the same lie as a missing row for one it is.
    const legs = accessLegs(
      {
        origin: pins.origin?.at ?? null,
        destination: pins.destination?.at ?? null,
      },
      result.snapped
    );
    if (legs.length > 0) {
      entries.push({
        color: ACCESS_LEG_COLOR,
        dash: ACCESS_LEG_DASH,
        label: t.route.legend.accessLeg,
      });
    }
    return [
      {
        title: t.route.legend.title,
        shape: "line",
        entries,
        hasNoData: false,
        /**
         * Which of these two sentences is true depends entirely on the active
         * provider, and the distinction is the whole point of having more than
         * one: `graph` minimises a cost function built from these colours,
         * while `ors` and `brouter` have never seen them. Saying the wrong one
         * would misrepresent what the map is showing.
         */
        note:
          result.provider.id === "graph"
            ? t.route.legend.noteGraph
            : t.route.legend.noteExternal(result.provider.label),
      },
    ];
  }, [result, pins, t]);

  return (
    <>
      <RouteInputPanel
        origin={pins.origin}
        destination={pins.destination}
        next={next}
        onNextChange={setNext}
        onPick={pick}
        onClearOne={clearOne}
        onClear={clear}
        onSwap={swap}
        loading={loading}
        error={error}
        cached={result?.cached ?? false}
        provider={result?.provider ?? lastProvider}
        routeType={routeType}
        onRouteTypeChange={changeRouteType}
        alternative={alternative}
        onAlternativeChange={changeAlternative}
      />
      <main className="flex-1 relative bg-[#F7F8FA]">
        <MapView
          onSelect={() => {}}
          onZoomChange={() => {}}
          segments={null}
          hexagons={null}
          coloredGeometry={null}
          color="#9ca3af"
          showBridges={false}
          controlRef={mapControls}
          onMapReady={handleMapReady}
        />

        <RouteLayer
          map={map}
          origin={pins.origin?.at ?? null}
          destination={pins.destination?.at ?? null}
          route={result?.geometry ?? null}
          snapped={result?.snapped ?? null}
          worstWayId={result?.stats.worst?.way_id ?? null}
          facilities={result?.facilities ?? []}
        />

        {!pins.origin && !pins.destination && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 rounded-lg border border-neutral-200 shadow-sm px-4 py-2 text-[13px] text-neutral-600">
            {t.route.hint}
          </div>
        )}

        {result && (
          <RouteResultPanel result={result} onClose={clear} />
        )}

        <Legend sections={legendSections} />
      </main>
    </>
  );
}
