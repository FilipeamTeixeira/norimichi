"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
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
import { DEFAULT_TOGGLES, type ToggleState } from "@/lib/types";
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
          controlRef={mapControls}
        />

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
