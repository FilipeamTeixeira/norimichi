"use client";

import { useMemo } from "react";
import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { ACCESS_SURFACE } from "@/lib/scales";
import PlaceSearch from "@/components/access/PlaceSearch";
import {
  bandAt,
  visibleOrigins,
  SCHOOL_CLASSES,
  type AccessOrigin,
  type AccessOriginKind,
  type SchoolClass,
} from "@/lib/access-types";

/** A place the reader searched for, to measure from. */
export interface ReferencePoint {
  at: [number, number];
  label: string;
}

/**
 * Straight-line metres. Deliberately not network distance: every other figure
 * on this page is measured over the network, but sorting 135 origins that way
 * would mean 135 more Dijkstras, and this is only deciding list order. The row
 * labels it as direct distance so the two are never read as the same thing.
 */
function directMetres(a: [number, number], b: [number, number]): number {
  const cosLat = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot(
    (a[0] - b[0]) * 111_320 * cosLat,
    (a[1] - b[1]) * 111_320
  );
}

/**
 * The left rail: which school or station the surface is measured from.
 *
 * Ordered by severed share, worst first, and that ordering is the argument.
 * An alphabetical list would make this a lookup tool for a reader who already
 * knows which school they care about; sorted, it opens on the schools whose
 * neighbourhoods are most cut off from them, which is the finding. The search
 * box is there for the reader who does arrive with a name in mind.
 */

interface Props {
  origins: AccessOrigin[];
  selected: string | null;
  onSelect: (origin: AccessOrigin) => void;
  /**
   * Which side of the list is showing, and which school classes are in it.
   * Owned by the page rather than here because the map's dot layer draws the
   * same set — see `visibleOrigins`.
   */
  kind: AccessOriginKind;
  onKindChange: (kind: AccessOriginKind) => void;
  classes: SchoolClass[];
  onClassToggle: (schoolClass: SchoolClass) => void;
  /** Whether the listed origins are drawn as dots on the map. */
  showOnMap: boolean;
  onShowOnMapChange: (show: boolean) => void;
  bandM: number;
  bands: number[];
  onBandChange: (band: number) => void;
  reference: ReferencePoint | null;
  onReferenceChange: (reference: ReferencePoint | null) => void;
}

export default function OriginPicker({
  origins,
  selected,
  onSelect,
  kind,
  onKindChange,
  classes,
  onClassToggle,
  showOnMap,
  onShowOnMapChange,
  bandM,
  bands,
  onBandChange,
  reference,
  onReferenceChange,
}: Props) {
  const t = useT();
  const ta = t.access;

  const rows = useMemo(() => {
    const visible = visibleOrigins(origins, kind, classes);

    // With a place to measure from, the question changes from "which of these
    // is worst" to "which of these is mine", and the order has to follow it.
    if (reference) {
      return visible
        .map((o) => ({ o, m: directMetres(reference.at, [o.lon, o.lat]) }))
        .sort((a, b) => a.m - b.m)
        .map(({ o, m }) => ({ origin: o, metres: m }));
    }

    return visible
      .sort((a, b) => {
        const sa = bandAt(a, bandM);
        const sb = bandAt(b, bandM);
        // Origins nobody can reach at all carry a null share rather than a
        // zero. They sort last: there is no severance to report, and putting
        // them at the top of a list headed "most cut off" would be the exact
        // misreading `severed_share` is null to prevent.
        if (sa.severed_share === null) return sb.severed_share === null ? 0 : 1;
        if (sb.severed_share === null) return -1;
        if (sb.severed_share !== sa.severed_share) {
          return sb.severed_share - sa.severed_share;
        }
        return sb.severed - sa.severed;
      })
      .map((origin) => ({ origin, metres: null as number | null }));
  }, [origins, kind, classes, bandM, reference]);

  /**
   * Names that appear more than once in the visible list. One school can hold
   * two campuses — 横浜市立横浜商業高等学校 sits in both Isogo and Minami — and
   * two rows reading identically look like a rendering fault rather than like
   * two real places. Those rows show their address; the rest stay one line, so
   * the disambiguation appears exactly where it is needed.
   */
  const ambiguous = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { origin } of rows) {
      counts.set(origin.name, (counts.get(origin.name) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name)
    );
  }, [rows]);

  return (
    <aside className="w-[268px] border-r border-neutral-200 bg-white shrink-0 overflow-y-auto flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-neutral-100">
        <h2 className="text-[13px] font-semibold text-neutral-900">
          {ta.picker.title}
        </h2>
        <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
          {reference ? ta.picker.ledeNear : ta.picker.lede}
        </p>
      </div>

      {/* The distance control. Gap #4's "0-3 / 3-5 / 5-10 km" filter, as
          reachability rather than as a segment filter: the bands come from the
          pipeline and every figure on the page is recomputed against the one
          picked here. Cumulative, not exclusive — "within 3 km", not
          "between 3 and 5 km", because that is what a rider is deciding. */}
      <div className="px-4 py-3 border-b border-neutral-100">
        <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-2">
          {ta.picker.band}
        </div>
        <div
          role="radiogroup"
          aria-label={ta.picker.band}
          className="flex items-center rounded-lg border border-neutral-200 p-0.5 gap-0.5"
        >
          {bands.map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={b === bandM}
              onClick={() => onBandChange(b)}
              className={cn(
                "flex-1 rounded-md py-1 text-[11px] font-medium transition-colors",
                b === bandM
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100"
              )}
            >
              {t.access.km(b / 1000)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 border-b border-neutral-100 flex flex-col gap-2.5">
        <div className="flex items-center rounded-lg border border-neutral-200 p-0.5 gap-0.5">
          {(["school", "station"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKindChange(k)}
              className={cn(
                "flex-1 rounded-md py-1 text-[11px] font-medium transition-colors",
                k === kind
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100"
              )}
            >
              {ta.kinds[k]}
            </button>
          ))}
        </div>

        {kind === "school" && (
          <div className="flex flex-wrap gap-1.5">
            {SCHOOL_CLASSES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onClassToggle(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  classes.includes(c)
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                )}
              >
                {ta.schoolClasses[c]}
              </button>
            ))}
          </div>
        )}

        {/* Where the listed places actually are. The surface answers "who can
            reach this one", which says nothing about how the schools or
            stations are spread over the ward — and before anything is selected
            the map is empty. Off by default: the dots are context for the
            reader who asks for it, not a fourth thing competing with the two
            colours the legend explains. */}
        <button
          type="button"
          aria-pressed={showOnMap}
          onClick={() => onShowOnMapChange(!showOnMap)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5",
            "text-[11px] font-medium transition-colors",
            showOnMap
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
          )}
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {showOnMap ? ta.picker.hideOnMap : ta.picker.showOnMap}
        </button>

        <PlaceSearch
          origins={origins}
          onPickOrigin={onSelect}
          onPickPlace={(at, label) => onReferenceChange({ at, label })}
        />

        {reference && (
          <div className="flex items-center gap-1.5 rounded-lg bg-neutral-50 border border-neutral-200 px-2.5 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-wider text-neutral-400">
                {ta.picker.measuringFrom}
              </span>
              <span className="block text-[12px] text-neutral-800 truncate">
                {reference.label}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onReferenceChange(null)}
              aria-label={ta.picker.clearReference}
              className="p-1 text-neutral-300 hover:text-neutral-600 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-neutral-400">
            {ta.picker.empty}
          </p>
        ) : (
          rows.map(({ origin: o, metres }) => {
            const band = bandAt(o, bandM);
            const share = band.severed_share;
            return (
              <button
                key={o.origin_id}
                onClick={() => onSelect(o)}
                className={cn(
                  "w-full text-left px-4 py-2.5 border-b border-neutral-50 transition-colors",
                  o.origin_id === selected
                    ? "bg-neutral-50"
                    : "hover:bg-neutral-50/60"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] text-neutral-900 truncate">
                    {o.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-neutral-500 shrink-0">
                    {share === null ? "—" : `${Math.round(share * 100)}%`}
                  </span>
                </div>

                {ambiguous.has(o.name) && o.detail && (
                  <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
                    {o.detail}
                  </div>
                )}

                {metres !== null && (
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    {ta.picker.directDistance(
                      metres < 1000
                        ? `${Math.round(metres / 10) * 10} m`
                        : `${(metres / 1000).toFixed(1)} km`
                    )}
                  </div>
                )}

                {/* The two-part bar is the row's whole content beyond its
                    name: it is the same measurement as the map, at a glance,
                    in the same two colours. */}
                <div className="mt-1.5 h-1 rounded-full bg-neutral-100 overflow-hidden flex">
                  {band.population_any > 0 && (
                    <>
                      <span
                        className="h-full"
                        style={{
                          width: `${(band.population_calm / band.population_any) * 100}%`,
                          backgroundColor: ACCESS_SURFACE.calm,
                        }}
                      />
                      <span
                        className="h-full"
                        style={{
                          width: `${(band.severed / band.population_any) * 100}%`,
                          backgroundColor: ACCESS_SURFACE.severed,
                        }}
                      />
                    </>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
