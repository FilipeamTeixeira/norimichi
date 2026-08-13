"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import FilterSidebar from "@/components/layout/FilterSidebar";
import MapView, {
  type MapControls,
  type Selection,
} from "@/components/map/MapView";
import SegmentInfoPanel from "@/components/panels/SegmentInfoPanel";
import HexInfoPanel from "@/components/panels/HexInfoPanel";
import BikeFacilityPanel from "@/components/panels/BikeFacilityPanel";
import AmenityPanel from "@/components/panels/AmenityPanel";
import Legend, {
  type LegendNudge,
  type LegendSection,
} from "@/components/panels/Legend";
import {
  DEFAULT_TOGGLES,
  corridorLabel,
  type CorridorProperties,
  type InvestmentRanking,
  type SegmentFeature,
  type SegmentProperties,
  type ToggleState,
} from "@/lib/types";
import {
  AREA_DETAIL_ZOOM,
  NETWORK_VIEW_ID,
  STREET_DETAIL_ZOOM,
  VIEW_BY_ID,
  type ViewGeometry,
} from "@/lib/metrics";
import {
  AMENITY_COLORS,
  BIKE_COLOR,
  CYCLEWAY_COLOR,
  RECOMMENDATION_COLOR,
  SELECTION_COLOR,
  buildScale,
  collectValues,
} from "@/lib/scales";

const GEOMETRY_LABEL: Record<ViewGeometry, string> = {
  areas: "Areas",
  streets: "Streets",
};

/** Where the nudge and the hex panel's jump send you. */
const DEFAULT_STREET_VIEW = "display_category";
const DEFAULT_AREA_VIEW = "gap_score";

/** Bounding box of any geometry, for the "see the streets here" jump. */
function featureBounds(
  geometry: Geometry
): [[number, number], [number, number]] | null {
  if (!("coordinates" in geometry)) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;

  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      w = Math.min(w, c[0]);
      e = Math.max(e, c[0]);
      s = Math.min(s, c[1]);
      n = Math.max(n, c[1]);
      return;
    }
    for (const part of c) visit(part);
  };

  visit(geometry.coordinates);
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

/** Merged extent of several features, for framing a whole corridor. */
function combinedBounds(
  features: Feature[]
): [[number, number], [number, number]] | null {
  let out: [[number, number], [number, number]] | null = null;
  for (const f of features) {
    const b = featureBounds(f.geometry);
    if (!b) continue;
    out = out
      ? [
          [Math.min(out[0][0], b[0][0]), Math.min(out[0][1], b[0][1])],
          [Math.max(out[1][0], b[1][0]), Math.max(out[1][1], b[1][1])],
        ]
      : b;
  }
  return out;
}

/**
 * The corridor id in `?corridor=<id>`, or null.
 *
 * Read straight off `window.location` rather than with `useSearchParams`,
 * which cannot be used here without wrapping this whole page in a Suspense
 * boundary — it opts the route out of static prerendering, and `next build`
 * fails on it ("useSearchParams() should be wrapped in a suspense boundary").
 * This is a one-shot deep-link handoff from the ranking table, not a value the
 * page needs to stay subscribed to, so the hook buys nothing here anyway.
 */
function corridorFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("corridor");
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export default function NetworkPage() {
  const [selected, setSelected] = useState<Selection>(null);
  const [toggles, setToggles] = useState<ToggleState>(DEFAULT_TOGGLES);
  /**
   * One selection, not one per geometry. The view owns which layer is drawn,
   * so switching it off keeps it off — zooming can no longer bring back a
   * layer the reader thought they had dismissed.
   */
  const [activeView, setActiveView] = useState<string | null>(null);
  const [zoom, setZoom] = useState(14);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const mapControls = useRef<MapControls | null>(null);

  // Loaded here rather than inside the map because the legend needs the same
  // values: class breaks come from the data, so both have to read one copy.
  const [segments, setSegments] = useState<FeatureCollection | null>(null);
  const [hexagons, setHexagons] = useState<FeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * F.6: the corridor handed over from the Investment Ranking table, as
   * declarative props rather than an imperative call.
   *
   * It has to be declarative. The highlight filter and the camera can only be
   * applied once the map has built its layers from the segment source, which
   * happens strictly after this data arrives — an imperative call at handoff
   * time would silently no-op against a layer that does not exist yet. Handing
   * MapView the ids and the extent lets it apply both when it is ready.
   */
  const [focus, setFocus] = useState<{
    wayIds: number[];
    bounds: [[number, number], [number, number]] | null;
  } | null>(null);

  /**
   * The corridor's own row, purely so the map can say *which project* it is
   * showing. Without it the reader arrives from a row labelled "Unnamed
   * tertiary near 元町・中華街 · Crossing improvement · 19 segments" and lands on
   * a panel headed "Road segment · tertiary · 583 m · #2596", with no way to
   * tell whether they are even looking at the right thing.
   *
   * Read from investment_ranking.json rather than reconstructed from the member
   * segments, because the label has to be *the same string they clicked*:
   * `nearest_station` only exists at corridor level, so deriving a label here
   * would quietly disagree with the table for the 52% of corridors OSM does not
   * name.
   */
  const [focusCorridor, setFocusCorridor] =
    useState<CorridorProperties | null>(null);

  const view = activeView ? VIEW_BY_ID.get(activeView) : undefined;
  const coloredGeometry = view?.geometry ?? null;

  useEffect(() => {
    let cancelled = false;

    const load = async (path: string) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return (await res.json()) as FeatureCollection;
    };

    Promise.all([
      load("/data/segments.geojson"),
      load("/data/hexagons.geojson"),
    ])
      .then(([seg, hex]) => {
        if (cancelled) return;
        setSegments(seg);
        setHexagons(hex);

        // The corridor handoff is applied here, in the callback that receives
        // the data it depends on, rather than in an effect watching `segments`.
        // Both work, but a synchronous setState in an effect body is the
        // cascading-render pattern React now lints against, and "when the
        // network data arrives, act on the URL we were opened with" is the
        // honest description of this anyway.
        const corridorId = corridorFromUrl();
        if (corridorId === null) return;

        const members = seg.features.filter(
          (f) => (f.properties as SegmentProperties | null)?.corridor_id === corridorId
        );
        if (members.length === 0) return;

        // A street view has to be on: the segment layer and its highlight are
        // hidden under an area view, and handleViewChange drops a segment
        // selection whenever the active geometry is not "streets".
        setActiveView(DEFAULT_STREET_VIEW);
        setFocus({
          wayIds: members.map((f) => (f.properties as SegmentProperties).way_id),
          bounds: combinedBounds(members),
        });

        // The panel describes the corridor's longest member: with nothing
        // better to go on the biggest piece is the most representative, where
        // taking the first by id would surface an arbitrary 2m stub.
        const longest = members.reduce((a, b) =>
          ((b.properties as SegmentProperties).length_m ?? 0) >
          ((a.properties as SegmentProperties).length_m ?? 0)
            ? b
            : a
        );
        setSelected({ kind: "segment", feature: longest as SegmentFeature });

        // Fetched only on a corridor handoff — the network view itself has no
        // use for the ranking, so it does not pay for it.
        fetch("/data/investment_ranking.json")
          .then((r) => (r.ok ? r.json() : null))
          .then((ranking: InvestmentRanking | null) => {
            if (cancelled || !ranking) return;
            setFocusCorridor(
              ranking.corridors.find((c) => c.corridor_id === corridorId) ??
                null
            );
          })
          .catch(() => {
            /* The banner is an affordance, not the data — losing it is survivable. */
          });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Clicking the active view switches it off, which is the only way to see the
   * basemap on its own. A view change takes any panel describing the geometry
   * that just left with it.
   */
  const handleViewChange = useCallback(
    (id: string) => {
      const next = activeView === id ? null : id;
      const geometry = next ? VIEW_BY_ID.get(next)?.geometry : undefined;
      setNudgeDismissed(false);
      setActiveView(next);
      setSelected((s) => {
        if (s?.kind === "hex" && geometry !== "areas") return null;
        if (s?.kind === "segment" && geometry !== "streets") return null;
        return s;
      });
    },
    [activeView]
  );

  /**
   * Continuous now — the old binary latch existed to drive the zoom hand-over,
   * and the only thing left that reads the zoom is the legend's suggestion.
   *
   * Quantised rather than delta-thresholded: a "has it moved 0.25 since the
   * last value I kept" test never settles on the zoom the map actually stopped
   * at, which matters when the value is being compared against a threshold.
   */
  const handleZoomChange = useCallback((z: number) => {
    const quantised = Math.round(z * 4) / 4;
    setZoom((prev) => (prev === quantised ? prev : quantised));
  }, []);

  /**
   * Drop the project focus: the casing, the banner, the panel, and the query
   * string, which would otherwise re-apply the whole thing on a reload.
   * `replaceState` rather than a router navigation so dismissing a banner does
   * not add a history entry the back button has to walk through.
   */
  const clearFocus = useCallback(() => {
    setFocus(null);
    setFocusCorridor(null);
    setSelected(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const showStreetsHere = useCallback((geometry: Geometry) => {
    const bounds = featureBounds(geometry);
    if (bounds) mapControls.current?.fitBounds(bounds);
    setActiveView(DEFAULT_STREET_VIEW);
    setSelected(null);
    setNudgeDismissed(false);
  }, []);

  const scale = useMemo(() => {
    if (!view) return null;
    const source = view.geometry === "areas" ? hexagons : segments;
    if (!source) return null;
    return buildScale(
      view.metric,
      collectValues(source.features, view.metric.key),
      view.geometry === "areas" ? "fill" : "line"
    );
  }, [view, hexagons, segments]);

  /**
   * Zoom gets to make a suggestion; it does not get to make the decision. The
   * thresholds are in metrics.ts and come from how big a hex and a segment
   * actually are on screen.
   */
  const nudge = useMemo<LegendNudge | null>(() => {
    if (!view || nudgeDismissed) return null;
    if (view.geometry === "areas" && zoom >= STREET_DETAIL_ZOOM) {
      return {
        text: "Hexagons cover most of the screen at this zoom.",
        action: "Show street detail",
        onAct: () => setActiveView(DEFAULT_STREET_VIEW),
        onDismiss: () => setNudgeDismissed(true),
      };
    }
    if (view.geometry === "streets" && zoom <= AREA_DETAIL_ZOOM) {
      return {
        text: "Individual streets are barely a few pixels at this zoom.",
        action: "Show the area view",
        onAct: () => setActiveView(DEFAULT_AREA_VIEW),
        onDismiss: () => setNudgeDismissed(true),
      };
    }
    return null;
  }, [view, zoom, nudgeDismissed]);

  const legendSections = useMemo<LegendSection[]>(() => {
    const sections: LegendSection[] = [];

    if (view && scale) {
      const entries = [...scale.entries];
      // The bridges are drawn only in this view, so they are only explained
      // in it.
      if (view.id === NETWORK_VIEW_ID) {
        entries.push({
          color: "#0b0b0b",
          label: "Missing link between two networks",
        });
      }
      sections.push({
        title: `${GEOMETRY_LABEL[view.geometry]} · ${view.label}`,
        shape: view.geometry === "areas" ? "fill" : "line",
        entries,
        hasNoData: scale.hasNoData,
        note: view.note,
      });
    }

    if (toggles.recommendations) {
      sections.push({
        title: "Recommendations",
        shape: "line",
        entries: [
          { color: RECOMMENDATION_COLOR, label: "Intervention proposed" },
        ],
        hasNoData: false,
        note: "Click the street for what to build, its cost tier and who benefits.",
      });
    }

    if (toggles.cycleways) {
      sections.push({
        title: "Existing cycleways",
        shape: "line",
        // Same order and dashes as CYCLEWAY_KINDS in MapView, most complete
        // provision first — the map draws them in the reverse of this.
        entries: [
          { color: CYCLEWAY_COLOR, label: "Dedicated cycleway" },
          {
            color: CYCLEWAY_COLOR,
            label: "Shared with pedestrians",
            dash: [2.5, 1.4],
          },
          { color: CYCLEWAY_COLOR, label: "On-road lane", dash: [0.6, 1.2] },
        ],
        hasNoData: false,
        note: "Most of what exists is shared with people on foot (自転車歩行者道), which is why it is not summed with dedicated provision.",
      });
    }

    if (toggles.amenities) {
      sections.push({
        title: "Amenities",
        shape: "fill",
        entries: [
          { color: AMENITY_COLORS.school, label: "School" },
          { color: AMENITY_COLORS.station, label: "Station" },
          { color: AMENITY_COLORS.shop, label: "Shop or restaurant" },
        ],
        hasNoData: false,
      });
    }

    if (toggles.bike_facilities) {
      sections.push({
        title: "Bike facilities",
        shape: "fill",
        entries: [
          { color: BIKE_COLOR, label: "Sharing dock (filled)" },
          { color: "#ffffff", label: "Parking (outlined)" },
        ],
        hasNoData: false,
      });
    }

    return sections;
  }, [toggles, view, scale]);

  return (
    <>
      <FilterSidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        toggles={toggles}
        onTogglesChange={setToggles}
      />
      <main className="flex-1 relative bg-[#F7F8FA]">
        <MapView
          onSelect={setSelected}
          onZoomChange={handleZoomChange}
          toggles={toggles}
          segments={segments}
          hexagons={hexagons}
          coloredGeometry={coloredGeometry}
          color={scale?.expression ?? "#9ca3af"}
          showBridges={activeView === NETWORK_VIEW_ID}
          focus={focus}
          controlRef={mapControls}
        />

        {/* Which project the map is showing. Sits top-centre over the map,
            where the "Loading network data…" notice goes, because it answers
            the same kind of question: what am I looking at right now. */}
        {focusCorridor && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-white rounded-lg border border-neutral-200 shadow-sm pl-3.5 pr-2 py-2 max-w-[min(560px,calc(100%-2rem))]">
            {/* Matches the map's selection glow, so the banner and the
                highlighted street are visibly the same thing. */}
            <span
              className="w-3.5 h-[5px] rounded-full shrink-0"
              style={{ backgroundColor: SELECTION_COLOR }}
            />
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-900 leading-snug truncate">
                {corridorLabel(focusCorridor)}
              </p>
              <p className="text-[11px] text-neutral-500 leading-snug">
                {focusCorridor.recommendation} ·{" "}
                {focusCorridor.segment_count === 1
                  ? "1 segment"
                  : `${focusCorridor.segment_count} segments outlined`}
                {focusCorridor.segment_count > 1 && " · panel shows the longest"}
              </p>
            </div>
            <button
              onClick={clearFocus}
              aria-label="Clear project selection"
              className="ml-auto shrink-0 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded p-1 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3.5 3.5l7 7M10.5 3.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}

        {!segments && !loadError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 rounded-lg border border-neutral-200 shadow-sm px-4 py-2 text-[13px] text-neutral-600">
            Loading network data…
          </div>
        )}
        {loadError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-red-50 rounded-lg border border-red-200 shadow-sm px-4 py-2 text-[13px] text-red-800">
            Could not load map data ({loadError}). Re-run
            pipeline/scripts/11_export.R.
          </div>
        )}

        {selected?.kind === "segment" && (
          <SegmentInfoPanel
            segment={selected.feature}
            onClose={() => setSelected(null)}
          />
        )}
        {selected?.kind === "hex" && (
          <HexInfoPanel
            hex={selected.feature}
            metric={view?.geometry === "areas" ? view.metric : undefined}
            viewLabel={view?.geometry === "areas" ? view.label : undefined}
            viewHint={view?.geometry === "areas" ? view.hint : undefined}
            onShowStreets={() => showStreetsHere(selected.feature.geometry)}
            onClose={() => setSelected(null)}
          />
        )}
        {selected?.kind === "facility" && (
          <BikeFacilityPanel
            facility={selected.feature}
            onClose={() => setSelected(null)}
          />
        )}
        {selected?.kind === "amenity" && (
          <AmenityPanel
            amenity={selected.feature}
            onClose={() => setSelected(null)}
          />
        )}

        <Legend sections={legendSections} nudge={nudge} />
      </main>
    </>
  );
}
