"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
  type ExpressionSpecification,
  type LngLatBoundsLike,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  AmenityFeature,
  BikeFacilityFeature,
  HexFeature,
  SegmentFeature,
  ToggleState,
} from "@/lib/types";
import { DEFAULT_TOGGLES } from "@/lib/types";
import type { ViewGeometry } from "@/lib/metrics";
import {
  AMENITY_COLORS,
  BIKE_COLOR,
  CYCLEWAY_COLOR,
  RECOMMENDATION_COLOR,
  SELECTION_COLOR,
} from "@/lib/scales";
import type { FeatureCollection } from "geojson";

export type Selection =
  | { kind: "segment"; feature: SegmentFeature }
  | { kind: "hex"; feature: HexFeature }
  | { kind: "facility"; feature: BikeFacilityFeature }
  | { kind: "amenity"; feature: AmenityFeature }
  | null;

/** What the page can ask the map to do. Deliberately narrow. */
export interface MapControls {
  fitBounds: (bounds: LngLatBoundsLike) => void;
}

/**
 * A set of ways to frame and highlight together — the corridor handed over from
 * the Investment Ranking table.
 *
 * A prop rather than a method on MapControls because it has to survive arriving
 * early: the highlight filter can only be set once the layer exists, which is
 * after the segment source loads. As a prop it is applied when the map is
 * ready, whenever that turns out to be.
 */
export interface MapFocus {
  wayIds: number[];
  bounds: [[number, number], [number, number]] | null;
}

interface MapViewProps {
  onSelect: (selection: Selection) => void;
  onZoomChange: (zoom: number) => void;
  toggles?: ToggleState;
  segments: FeatureCollection | null;
  hexagons: FeatureCollection | null;
  /**
   * Which geometry carries colour. The other one is not drawn: only one layer
   * ever competes for the colour channel, and `null` means none does.
   */
  coloredGeometry: ViewGeometry | null;
  /** Paint expression for whichever geometry that is. */
  color: ExpressionSpecification | string;
  /** The bridge overlay says nothing outside the connectivity view. */
  showBridges: boolean;
  /**
   * A corridor to frame and highlight on arrival, from the Investment Ranking
   * table. Applied once per distinct value, so a later map click replaces the
   * highlight without this re-asserting it.
   */
  focus?: MapFocus | null;
  /** Populated once the map exists, so the panels can drive it. */
  controlRef?: React.RefObject<MapControls | null>;
  /**
   * The map itself, once its style has loaded. Only the Route Analysis page
   * uses this: its layers are per-request rather than per-deployment, so they
   * live in their own component (RouteLayer) instead of adding a fourth mode
   * to the source-and-layer block below. Fires on style load, not on data
   * load — that page passes no GeoJSON at all.
   */
  onMapReady?: (map: Map) => void;
}

/**
 * maplibre-gl v6 loads its worker as a separate module resolved against
 * `import.meta.url`. Bundled, that points at `/_next/static/chunks/`, where the
 * worker file does not exist — it 404s, the worker pool never starts, and every
 * GeoJSON source stays unparsed while raster tiles (decoded on the main thread)
 * carry on rendering. Serving it from `public/` and naming it explicitly is the
 * supported way out. `scripts/copy-maplibre-worker.mjs` keeps the copy in step
 * with the installed version.
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const vis = (on: boolean): "visible" | "none" => (on ? "visible" : "none");

/**
 * Zoom ramps, and nothing else. No layer appears, disappears or changes
 * meaning here — these only keep a mark legible at the scale it is drawn at.
 *
 * The widths are set from the arithmetic rather than by eye. A coloured line
 * needs roughly 3px before its hue reads reliably, and a 100 m segment is 13px
 * long at z14 — which is also the zoom where the whole study area fits on
 * screen. So the ramp has to clear 3px by z14, not by z15 as it used to.
 */
const SEGMENT_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.8,
  13,
  2.5,
  14,
  3.5,
  16,
  5,
  18,
  7,
];

/**
 * Hexes stay readable but step back as they grow: one is ~302 m across, so it
 * covers 78px at z15 and 155px at z16, by which point a solid fill is shouting
 * over a basemap the reader is trying to use for orientation.
 */
const HEX_FILL_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.65,
  13,
  0.6,
  14,
  0.5,
  16,
  0.3,
];

/** Cell edges stop being information once a cell is bigger than the question. */
const HEX_OUTLINE_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.5,
  13,
  0.4,
  14,
  0.2,
  15,
  0,
];

const AMENITY_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  2,
  15,
  3.2,
  18,
  5,
];

const BIKE_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  3.5,
  15,
  5,
  18,
  7.5,
];

/**
 * Roughly twice SEGMENT_WIDTH at every zoom, so what shows either side of the
 * score line is a casing around it rather than a rival line: this is context
 * for the measurement, not a second measurement. Matched to the score line
 * instead, the overlay switched on and stayed invisible — the two are the same
 * geometry, so equal widths means total occlusion.
 *
 * Sized like the recommendations halo, which it can never collide with: a
 * segment only gets a recommendation where it has no cycle infrastructure
 * (see the case_when in pipeline/scripts/11_export.R), so a way is in exactly
 * one of the two overlays, never both.
 */
/**
 * The selection casing — roughly 2.4x SEGMENT_WIDTH, for the same reason
 * CYCLEWAY_WIDTH is 2x it: this layer and the score line are the *same
 * geometry*, so a matched width is total occlusion.
 *
 * It used to run 3px at z13 to 7px at z18 against a score line of 2.5 to 7,
 * i.e. no wider than the thing it was highlighting — at the z16 the ranking
 * table's fly-to lands on, a 4.6px "highlight" sat on a 5px line. Under the
 * traffic-stress ramp that still read as a distinct dark line, which is why it
 * looked fine in isolation; under "Where to invest", where most of the network
 * is pale grey, a same-width dark line is just another street and the
 * selection was effectively invisible.
 *
 * Rendered as a soft translucent glow rather than a hard band, and drawn over
 * the street layers so nothing cuts into it. Being translucent, the selected
 * segment's own score colour still reads through the middle of the glow rather
 * than being replaced by it — which was the other half of the original problem,
 * a flat opaque stroke that hid the measurement the reader came for.
 */
const HIGHLIGHT_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  3.5,
  13,
  8,
  14,
  11,
  16,
  16,
  18,
  22,
];

const CYCLEWAY_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  2,
  13,
  4.5,
  15,
  7,
  18,
  12,
];

/**
 * One layer per kind, because `line-dasharray` is one of the few paint
 * properties MapLibre will not evaluate as a data-driven expression — a
 * single layer with a `match` on cycleway_type silently renders every line
 * solid. Ordered least to most complete so the solid dedicated line draws
 * last and stays legible where two kinds meet at a junction.
 *
 * Dashes are in line-width units, so they scale with the ramp above and keep
 * their proportions at every zoom.
 */
const CYCLEWAY_KINDS: {
  type: string;
  dash: [number, number] | null;
}[] = [
  { type: "on_road", dash: [0.6, 1.2] },
  { type: "shared_path", dash: [2.5, 1.4] },
  { type: "dedicated", dash: null },
];

export default function MapView({
  onSelect,
  onZoomChange,
  toggles = DEFAULT_TOGGLES,
  segments,
  hexagons,
  coloredGeometry,
  color,
  showBridges,
  focus,
  controlRef,
  onMapReady,
}: MapViewProps) {
  const showHex = coloredGeometry === "areas";
  const showSegments = coloredGeometry === "streets";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // The map outlives the component across a remount (see the dispose timer
  // below), so a handler registered once would keep calling the setter of an
  // instance React has already discarded — the zoom would silently freeze at
  // whatever it was when the remount happened. Going through a ref keeps the
  // long-lived listener pointed at the current render's callback.
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  // Same reasoning as onZoomChange: the map survives a remount, so this hands
  // out the live instance to whichever render is current.
  useEffect(() => {
    if (styleReady && mapRef.current) onMapReady?.(mapRef.current);
  }, [styleReady, onMapReady]);

  const clearHighlights = useCallback((map: Map) => {
    const reset: [string, string, string | number][] = [
      ["segments-highlight", "way_id", -1],
      ["hex-highlight", "hex_id", ""],
      ["facility-highlight", "osm_id", ""],
      ["amenity-highlight", "amenity_id", -1],
    ];
    for (const [layer, prop, empty] of reset) {
      if (map.getLayer(layer)) map.setFilter(layer, ["==", ["get", prop], empty]);
    }
  }, []);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      // Most specific target first. A dock is a few pixels across and always
      // sits on top of a hex, so hit-testing in draw order would make the
      // small things unclickable.
      const order = [
        { id: "bike-facilities-layer", kind: "facility" as const, key: "osm_id" },
        { id: "amenities-layer", kind: "amenity" as const, key: "amenity_id" },
        { id: "segments-layer", kind: "segment" as const, key: "way_id" },
        { id: "hex-fill", kind: "hex" as const, key: "hex_id" },
      ].filter(({ id }) => map.getLayer(id));

      clearHighlights(map);

      for (const { id, kind, key } of order) {
        if (map.getLayoutProperty(id, "visibility") === "none") continue;
        const hits = map.queryRenderedFeatures(e.point, { layers: [id] });
        if (hits.length === 0) continue;

        const f = hits[0];
        const highlightLayer = {
          segment: "segments-highlight",
          hex: "hex-highlight",
          facility: "facility-highlight",
          amenity: "amenity-highlight",
        }[kind];
        map.setFilter(highlightLayer, ["==", ["get", key], f.properties[key]]);

        onSelect({
          kind,
          feature: {
            type: "Feature",
            geometry: f.geometry,
            properties: f.properties,
          },
        } as Selection);
        return;
      }

      onSelect(null);
    },
    [onSelect, clearHighlights]
  );

  // --- Map + basemap ----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // React's development remount tears the map down and rebuilds it a tick
    // later. Deferring disposal and cancelling it when the remount arrives
    // keeps one instance alive across the cycle instead of paying for a second
    // WebGL context and a second style load on every page view.
    if (disposeTimer.current !== null) {
      clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }
    if (mapRef.current) return;

    const map = new Map({
      container,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["/api/tiles/{z}/{x}/{y}"],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: "osm-layer",
            type: "raster",
            source: "osm",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [139.6567, 35.4305],
      zoom: 14,
      maxZoom: 18,
      // The study area is ~4.6km across, which is 147px at z11 and 74px at z10
      // — the two levels below this showed a blob, not a map.
      minZoom: 11,
    });

    map.addControl(new NavigationControl(), "top-right");
    map.on("load", () => setStyleReady(true));
    map.on("zoom", () => onZoomChangeRef.current(map.getZoom()));
    mapRef.current = map;

    if (controlRef) {
      controlRef.current = {
        fitBounds: (bounds) =>
          map.fitBounds(bounds, { padding: 96, maxZoom: 16, duration: 700 }),
      };
    }

    // MapLibre sizes its canvas once at construction. The container is a flex
    // child of a page with a fixed sidebar, so it changes size without the
    // window ever firing `resize` — without this the canvas keeps whatever
    // size it happened to have on first paint.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    observerRef.current = observer;

    return () => {
      disposeTimer.current = setTimeout(() => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        mapRef.current?.remove();
        mapRef.current = null;
        if (controlRef) controlRef.current = null;
        disposeTimer.current = null;
        setStyleReady(false);
        setDataReady(false);
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Data layers, added once the GeoJSON has arrived -------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !segments || !hexagons) return;
    if (map.getSource("segments")) return;

    map.addSource("hexagons", { type: "geojson", data: hexagons });
    map.addSource("segments", { type: "geojson", data: segments });
    map.addSource("bike-facilities", {
      type: "geojson",
      data: "/data/bike_facilities.geojson",
    });
    map.addSource("amenities", {
      type: "geojson",
      data: "/data/amenities.geojson",
    });
    map.addSource("cycleways", {
      type: "geojson",
      data: "/data/cycleways.geojson",
    });

    map.addLayer({
      id: "hex-fill",
      type: "fill",
      source: "hexagons",
      layout: { visibility: vis(showHex) },
      paint: { "fill-color": color, "fill-opacity": HEX_FILL_OPACITY },
    });

    map.addLayer({
      id: "hex-outline",
      type: "line",
      source: "hexagons",
      layout: { visibility: vis(showHex) },
      paint: {
        "line-color": "#94a3b8",
        "line-width": 0.5,
        "line-opacity": HEX_OUTLINE_OPACITY,
      },
    });

    map.addLayer({
      id: "hex-highlight",
      type: "line",
      source: "hexagons",
      layout: { visibility: vis(showHex) },
      paint: { "line-color": "#0b0b0b", "line-width": 2 },
      filter: ["==", ["get", "hex_id"], ""],
    });

    // Drawn under the score line so a proposal reads as a halo around the
    // street rather than as a different measurement of it.
    map.addLayer({
      id: "recommendations-glow",
      type: "line",
      source: "segments",
      // The property is always present and null where there is no proposal,
      // so `has` would match every segment; to-string turns null into "".
      filter: ["!=", ["to-string", ["get", "recommendation"]], ""],
      layout: { visibility: vis(toggles.recommendations) },
      paint: {
        "line-color": RECOMMENDATION_COLOR,
        // Previously this faded to nothing below z14.5 — which, with the map
        // opening at z14, meant the product's headline output was switched on
        // and invisible on first load.
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          2.5,
          13,
          5,
          15,
          8,
          18,
          14,
        ],
        "line-opacity": 0.35,
        "line-blur": 2,
      },
    });

    // What already exists, drawn under the score line for the same reason the
    // recommendations halo is: it is context for the measurement, not a rival
    // measurement. Its own source, so it stays available in the area views
    // where the segment layer is not drawn at all — "where can I already
    // cycle" is a fair question to ask of a demand map.
    for (const { type, dash } of CYCLEWAY_KINDS) {
      map.addLayer({
        id: `cycleways-${type}`,
        type: "line",
        source: "cycleways",
        filter: ["==", ["get", "cycleway_type"], type],
        layout: {
          visibility: vis(toggles.cycleways),
          "line-cap": dash ? "butt" : "round",
          "line-join": "round",
        },
        paint: {
          "line-color": CYCLEWAY_COLOR,
          "line-width": CYCLEWAY_WIDTH,
          "line-opacity": 0.85,
          ...(dash ? { "line-dasharray": dash } : {}),
        },
      });
    }

    // One line layer, repainted per view. The islands view used to be a second
    // copy of this that suppressed the first, which is what made a switch in
    // the "overlays" group silently replace the active score.
    map.addLayer({
      id: "segments-layer",
      type: "line",
      source: "segments",
      layout: { visibility: vis(showSegments) },
      paint: {
        "line-color": color,
        "line-width": SEGMENT_WIDTH,
        "line-opacity": 0.9,
      },
    });

    // The planner's argument: these are the specific links that would join two
    // separate safe networks, so they get weight the clusters don't.
    map.addLayer({
      id: "islands-bridges",
      type: "line",
      source: "segments",
      filter: ["==", ["get", "bridges_islands"], true],
      layout: {
        visibility: vis(showBridges),
        "line-cap": "round",
      },
      paint: {
        "line-color": "#0b0b0b",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          1.5,
          13,
          2.5,
          15,
          4,
          18,
          6.5,
        ],
        "line-dasharray": [1.5, 1],
        "line-opacity": 0.9,
      },
    });

    // Drawn *above* the street layers rather than as a casing beneath them, so
    // nothing competes with it — at this width and blur the glow was still
    // being cut into by the score line and the bridge dashes on top of it.
    //
    // No beforeId, so it lands here in insertion order: over "segments-layer"
    // and "islands-bridges", but under the amenity and bike-facility points
    // added below. Those are small circles a reader clicks; burying them under
    // a 16px translucent stroke would cost more than the glow gains.
    map.addLayer({
      id: "segments-highlight",
      type: "line",
      source: "segments",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": SELECTION_COLOR,
        "line-width": HIGHLIGHT_WIDTH,
        // A glow, not a band: soft and semi-transparent, so it reads as
        // emphasis on the street rather than as another value on a ramp.
        // Opacity is higher than recommendations-glow's 0.35 because the colour
        // is paler — the same alpha on a lighter blue disappears against the
        // basemap.
        "line-opacity": 0.55,
        "line-blur": 4,
      },
      filter: ["==", ["get", "way_id"], -1],
    });

    map.addLayer({
      id: "amenities-layer",
      type: "circle",
      source: "amenities",
      layout: { visibility: vis(toggles.amenities) },
      paint: {
        "circle-radius": AMENITY_RADIUS,
        "circle-color": [
          "match",
          ["get", "kind"],
          "school",
          AMENITY_COLORS.school,
          "station",
          AMENITY_COLORS.station,
          "shop",
          AMENITY_COLORS.shop,
          "#898781",
        ],
        "circle-stroke-width": 0.75,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
      minzoom: 12,
    });

    map.addLayer({
      id: "amenity-highlight",
      type: "circle",
      source: "amenities",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 18, 9],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#0b0b0b",
      },
      filter: ["==", ["get", "amenity_id"], -1],
    });

    // One colour for the whole toggle: five simultaneous point identities
    // cannot stay distinguishable under colour-vision deficiency, so parking
    // and sharing are separated by fill vs ring instead of by hue.
    map.addLayer({
      id: "bike-facilities-layer",
      type: "circle",
      source: "bike-facilities",
      layout: { visibility: vis(toggles.bike_facilities) },
      paint: {
        "circle-radius": BIKE_RADIUS,
        "circle-color": [
          "case",
          ["==", ["get", "facility_type"], "sharing"],
          BIKE_COLOR,
          "#ffffff",
        ],
        "circle-stroke-width": 1.75,
        "circle-stroke-color": BIKE_COLOR,
        "circle-opacity": 0.9,
      },
      minzoom: 12,
    });

    map.addLayer({
      id: "facility-highlight",
      type: "circle",
      source: "bike-facilities",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 7, 18, 12],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#0b0b0b",
      },
      filter: ["==", ["get", "osm_id"], ""],
    });

    for (const id of [
      "segments-layer",
      "amenities-layer",
      "bike-facilities-layer",
    ]) {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    setDataReady(true);
    // Visibility and paint are re-applied by their own effects below;
    // re-running this one would try to add sources that already exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleReady, segments, hexagons]);

  // --- Click handling ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dataReady) return;
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [handleClick, dataReady]);

  // --- Overlay visibility -----------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dataReady) return;
    const set = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
    };
    // The active view owns the colour channel, so its geometry is the only one
    // drawn. Nothing here reads the zoom.
    set("hex-fill", showHex);
    set("hex-outline", showHex);
    set("hex-highlight", showHex);
    set("segments-layer", showSegments);
    set("segments-highlight", showSegments);
    // Hiding a layer deselects whatever was selected in it (page.tsx), so its
    // highlight shouldn't survive to reappear when the layer comes back.
    if (!showHex && map.getLayer("hex-highlight")) {
      map.setFilter("hex-highlight", ["==", ["get", "hex_id"], ""]);
    }
    if (!showSegments && map.getLayer("segments-highlight")) {
      map.setFilter("segments-highlight", ["==", ["get", "way_id"], -1]);
    }
    set("amenities-layer", toggles.amenities);
    set("amenity-highlight", toggles.amenities);
    set("bike-facilities-layer", toggles.bike_facilities);
    set("facility-highlight", toggles.bike_facilities);
    set("recommendations-glow", toggles.recommendations);
    for (const { type } of CYCLEWAY_KINDS) {
      set(`cycleways-${type}`, toggles.cycleways);
    }
    set("islands-bridges", showBridges);
  }, [toggles, showHex, showSegments, showBridges, dataReady]);

  // --- Paint, driven by the sidebar selection ---------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dataReady) return;
    // One expression, applied to whichever geometry is currently visible. The
    // other keeps its stale paint, which costs nothing because it isn't drawn.
    if (showHex) map.setPaintProperty("hex-fill", "fill-color", color);
    if (showSegments) map.setPaintProperty("segments-layer", "line-color", color);
  }, [color, showHex, showSegments, dataReady]);

  // --- A corridor arriving from the Investment Ranking table -------------
  //
  // Frames and highlights every member way, not just the one the info panel
  // describes: the reader was sent here to look at a whole project, and
  // lighting up one 119m fragment of it would understate what they asked for.
  //
  // Waits on `dataReady` because the highlight layer does not exist until the
  // segment source has loaded, and on `showSegments` because it is hidden under
  // an area view. Keyed on `focus` identity, so a subsequent map click replaces
  // the highlight without this reinstating it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dataReady || !showSegments) return;
    if (!map.getLayer("segments-highlight")) return;

    // Clearing the focus clears the casing. Without this, dismissing the
    // project banner left the whole corridor still outlined on the map.
    if (!focus) {
      map.setFilter("segments-highlight", ["==", ["get", "way_id"], -1]);
      return;
    }

    map.setFilter("segments-highlight", [
      "in",
      ["get", "way_id"],
      ["literal", focus.wayIds],
    ]);
    if (focus.bounds) {
      map.fitBounds(focus.bounds, { padding: 96, maxZoom: 16, duration: 700 });
    }
  }, [focus, dataReady, showSegments]);

  return <div ref={containerRef} className="w-full h-full" />;
}
