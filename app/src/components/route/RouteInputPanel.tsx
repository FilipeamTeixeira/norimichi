"use client";

import type { RouteErrorKind } from "@/lib/route-types";

/**
 * The left rail on the Route Analysis page, in the slot FilterSidebar occupies
 * on the network view — same width, same section rhythm, so switching tabs
 * doesn't feel like switching applications.
 *
 * Setting the two ends is done by clicking the map. There is no address search:
 * the tool answers "what is my commute actually like", the study area is one
 * ward, and the map is already the thing the reader is looking at. A geocoder
 * would be a second external quota to manage for a step a click already does.
 */

export type PinTarget = "origin" | "destination";

interface Props {
  origin: [number, number] | null;
  destination: [number, number] | null;
  /** Which end the next map click sets. */
  next: PinTarget;
  onNextChange: (target: PinTarget) => void;
  onClear: () => void;
  onSwap: () => void;
  loading: boolean;
  error: { kind: RouteErrorKind; message: string } | null;
  /** True when the last result came from the coordinate cache, not from ORS. */
  cached: boolean;
}

const formatPoint = ([lon, lat]: [number, number]) =>
  `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

function PointRow({
  label,
  letter,
  value,
  active,
  onSelect,
}: {
  label: string;
  letter: string;
  value: [number, number] | null;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
        active
          ? "border-neutral-900 bg-neutral-50"
          : "border-neutral-200 hover:border-neutral-300"
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
        {letter}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-neutral-900 leading-tight">
          {label}
        </span>
        <span className="block text-[11px] text-neutral-500 tabular-nums truncate">
          {value ? formatPoint(value) : "Click the map to set"}
        </span>
      </span>
    </button>
  );
}

/**
 * Failure states the reader can act on, separated from the ones they can't.
 * The free ORS tier is 2,000 directions requests a day, so running out is a
 * normal Tuesday for this app rather than an incident — and it has to say so
 * in those words instead of failing silently or blaming the reader's input.
 */
function ErrorNote({
  kind,
  message,
}: {
  kind: RouteErrorKind;
  message: string;
}) {
  const amber = kind === "quota" || kind === "unavailable";
  return (
    <div
      className={`rounded-lg border p-3 ${
        amber
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-red-50 border-red-200 text-red-900"
      }`}
    >
      <p className="text-[12px] font-semibold leading-snug">
        {kind === "quota"
          ? "Route service out of quota"
          : kind === "unavailable"
            ? "Route service unavailable"
            : kind === "not_configured"
              ? "Route service not configured"
              : kind === "out_of_area"
                ? "Outside the study area"
                : "No route found"}
      </p>
      <p className="text-[11px] leading-relaxed mt-1 opacity-80">{message}</p>
    </div>
  );
}

export default function RouteInputPanel({
  origin,
  destination,
  next,
  onNextChange,
  onClear,
  onSwap,
  loading,
  error,
  cached,
}: Props) {
  return (
    <aside className="w-[268px] border-r border-neutral-200 bg-white shrink-0 overflow-y-auto flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-base font-bold text-neutral-900 leading-tight">
          Score a trip
        </h2>
        <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
          Click the map to drop A, then B. The route comes back coloured by this
          project&rsquo;s own traffic-stress data, not by a generic bike layer.
        </p>
      </div>

      <div className="px-5 pb-4 flex flex-col gap-1.5">
        <PointRow
          label="Start"
          letter="A"
          value={origin}
          active={next === "origin"}
          onSelect={() => onNextChange("origin")}
        />
        <PointRow
          label="Destination"
          letter="B"
          value={destination}
          active={next === "destination"}
          onSelect={() => onNextChange("destination")}
        />
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onSwap}
            disabled={!origin || !destination}
            className="text-[11px] font-medium text-neutral-600 hover:text-neutral-900 disabled:text-neutral-300 disabled:hover:text-neutral-300"
          >
            Reverse
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!origin && !destination}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 disabled:text-neutral-300 disabled:hover:text-neutral-300"
          >
            Clear
          </button>
          {loading && (
            <span className="text-[11px] text-neutral-500 ml-auto">
              Scoring…
            </span>
          )}
          {!loading && cached && (
            <span
              className="text-[11px] text-neutral-400 ml-auto"
              title="Nearby start and end points share one cached route, so repeating a trip costs no quota."
            >
              cached
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 pb-4">
          <ErrorNote kind={error.kind} message={error.message} />
        </div>
      )}

      {/* The limitation this V1 has to state out loud rather than leave for
          whoever reads the docs. See PROJECT_STATUS.md C.3. */}
      <div className="px-5 py-4 border-t border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">
          What this does and does not do
        </h3>
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          The path is chosen by OpenRouteService&rsquo;s generic cycling
          profile, which has never seen this project&rsquo;s stress, sidewalk or
          parking data and does not route around a hostile road. This page
          scores the route it returns — it does not search for a more
          comfortable one. Read the breakdown, not just the total.
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-400 px-5 py-4 border-t border-neutral-200 italic mt-auto">
        Geometry: OpenRouteService (cycling-regular). Everything scored on it:
        segments.geojson and bike_facilities.geojson from
        pipeline/scripts/11_export.R. Cost and CO&#8322; units: see
        lib/scoring-constants.ts.
      </p>
    </aside>
  );
}
