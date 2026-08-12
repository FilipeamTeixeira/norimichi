"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import MapView, { type MapControls } from "@/components/map/MapView";
import RouteLayer from "@/components/map/RouteLayer";
import RouteInputPanel, {
  type PinTarget,
} from "@/components/route/RouteInputPanel";
import RouteResultPanel from "@/components/route/RouteResultPanel";
import Legend, { type LegendSection } from "@/components/panels/Legend";
import { LTS_LABELS } from "@/lib/metrics";
import { NO_DATA, STRESS_LINE } from "@/lib/scales";
import {
  isRouteError,
  type RouteErrorKind,
  type RouteScoreError,
  type RouteScoreResponse,
} from "@/lib/route-types";

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

/** Bounds of a route, for the fit after a result comes back. */
function routeBounds(
  result: RouteScoreResponse
): [[number, number], [number, number]] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const f of result.geometry.features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

export default function RouteAnalysisPage() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [pins, setPins] = useState<{
    origin: Point | null;
    destination: Point | null;
  }>({ origin: null, destination: null });
  const [next, setNext] = useState<PinTarget>("origin");
  const [result, setResult] = useState<RouteScoreResponse | null>(null);
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
  useEffect(() => {
    pinsRef.current = pins;
    nextRef.current = next;
  }, [pins, next]);

  /**
   * Monotonic request id. Moving a pin while a score is in flight leaves an
   * older response still on its way back, and applying it would show a panel
   * that describes a route the reader has already changed. Aborting the fetch
   * would not help: the quota was spent the moment the request left, so the
   * only thing worth doing is ignoring the answer.
   */
  const requestId = useRef(0);

  const score = useCallback(async (from: Point, to: Point) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/route-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: from, destination: to }),
      });
      const body = (await res.json()) as RouteScoreResponse | RouteScoreError;
      if (id !== requestId.current) return;

      if (isRouteError(body)) {
        setResult(null);
        setError({ kind: body.error, message: body.message });
        return;
      }
      setResult(body);
      const bounds = routeBounds(body);
      if (bounds) mapControls.current?.fitBounds(bounds);
    } catch (err) {
      if (id !== requestId.current) return;
      setResult(null);
      setError({
        kind: "unavailable",
        message: `Could not reach the scoring endpoint (${
          err instanceof Error ? err.message : "unknown error"
        }).`,
      });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /** Move one end, and score as soon as both exist. */
  const setPin = useCallback(
    (target: PinTarget, at: Point) => {
      const updated = { ...pinsRef.current, [target]: at };
      pinsRef.current = updated;
      setPins(updated);
      // Alternate ends automatically: the common case is placing both in one
      // go, and reaching for the sidebar between them is friction for no
      // decision.
      setNext(target === "origin" ? "destination" : "origin");
      if (updated.origin && updated.destination) {
        void score(updated.origin, updated.destination);
      }
    },
    [score]
  );

  const handleMapReady = useCallback((m: MapLibreMap) => setMap(m), []);

  // --- Dropping pins -----------------------------------------------------
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapMouseEvent) =>
      setPin(nextRef.current, [e.lngLat.lng, e.lngLat.lat]);

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

  const swap = useCallback(() => {
    const { origin, destination } = pinsRef.current;
    if (!origin || !destination) return;
    pinsRef.current = { origin: destination, destination: origin };
    setPins(pinsRef.current);
    void score(destination, origin);
  }, [score]);

  /**
   * Only the classes this route actually contains. A fixed four-row key would
   * claim the trip touches an LTS 4 street when it doesn't — the stacked bar in
   * the panel is where the full domain belongs, because that is a comparison;
   * this is a description of one line on the screen.
   */
  const legendSections = useMemo<LegendSection[]>(() => {
    if (!result) return [];
    const entries = result.stats.lts_bands
      .filter((b) => b.length_m > 0)
      .map((b) => ({
        color: STRESS_LINE[b.lts - 1],
        label: `${b.lts} — ${LTS_LABELS[b.lts - 1].toLowerCase()}`,
      }));
    if (result.stats.unmatched_length_m > 0) {
      entries.push({ color: NO_DATA, label: "Not matched to our data" });
    }
    return [
      {
        title: "This route · traffic stress",
        shape: "line",
        entries,
        hasNoData: false,
        note: "The same scale as the network map's stress view. The path itself was chosen by a generic cycling profile, not by these colours.",
      },
    ];
  }, [result]);

  return (
    <>
      <RouteInputPanel
        origin={pins.origin}
        destination={pins.destination}
        next={next}
        onNextChange={setNext}
        onClear={clear}
        onSwap={swap}
        loading={loading}
        error={error}
        cached={result?.cached ?? false}
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
          origin={pins.origin}
          destination={pins.destination}
          route={result?.geometry ?? null}
          worstWayId={result?.stats.worst?.way_id ?? null}
          facilities={result?.facilities ?? []}
        />

        {!pins.origin && !pins.destination && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 rounded-lg border border-neutral-200 shadow-sm px-4 py-2 text-[13px] text-neutral-600">
            Click anywhere on the map to set the start of the trip.
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
