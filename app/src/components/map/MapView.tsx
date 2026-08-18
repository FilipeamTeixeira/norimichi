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
  MISSING_LINK_COLOR,
  RECOMMENDATION_COLOR,
  SELECTION_COLOR,
} from "@/lib/scales";
import type { FeatureCollection } from "geojson";
import { useRegion } from "@/components/region/context";
import { boundsOf, minZoomFor } from "@/lib/regions";

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
  /**
   * The property the street layer is currently coloured by. Four of them are
   * styled by width and alpha as well as by colour — see ANALYTICAL_LINE and
   * islandLine above — and the rest fall back to the plain zoom ramps.
   */
  segmentMetric?: string | null;
  /**
   * The category values that metric's scale named, where it picked them from
   * the data. Only "Disconnected networks" uses this: its ramp has to weight
   * the three largest clusters differently from the rest, and which ids those
   * are is a property of the region's data, not of the code.
   */
  segmentDomain?: string[] | null;
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
 * Zoom ramps. No layer appears, disappears or changes meaning here — these only
 * keep a mark legible at the scale it is drawn at. (The stress ramps further
 * down are the one exception, and say so.)
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
 * The score line is the answer, so it stays dominant — but it is drawn over the
 * street the reader is trying to identify, and at z16+ it is 5-7px of solid
 * colour on a road casing about that wide. A little of the basemap showing
 * through is what tells them *which* street scored: the kink, the junction, the
 * railway it crosses. Slight at the scales where the line is thin enough to lose
 * (0.9 at z11-13), more generous where it is wide enough to bury its own street.
 *
 * Same reasoning as HEX_FILL_OPACITY below, at a smaller amplitude: a line is a
 * few px of the screen where a hex is a fifth of it, so it can afford far less.
 */
const SEGMENT_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.7,
  13,
  0.66,
  14,
  0.62,
  16,
  0.55,
  18,
  0.5,
];

// --- Analytical line ramps ---------------------------------------------
//
// Three street views — traffic stress, where to invest, infrastructure gap —
// share the structure below. They are the views whose *distribution* breaks the
// default styling: in each of them the class a reader came to find is a small
// minority of the network, and drawn at a uniform 3.5px it is outnumbered on
// screen by its own context. So each carries its variable on three channels
// instead of one — colour, width, alpha — and lets zoom decide how much of the
// network is competing for attention at all.
//
// The regime edges are shared, and are set from the zooms this map can actually
// be at rather than from round numbers. `minZoomFor` floors both published
// regions at z11 and their whole extent fits at about z12.7, so a "zoomed right
// out" regime written for z<11 never fires and the opening frame lands
// mid-regime — which is how the first cut of the stress ramp shipped with LTS 2
// still painting a solid mass at maximum zoom-out. So:
//
//   z<13      region to city — the opening frame lands here
//   13-15     neighbourhood
//   15-16.5   street
//   z>=16.5   address; the map reaches z18, where a 3px line on a road casing
//             about that wide stops reading as an annotation of the street
//
// Widths `step` at those edges: these are regimes with edges, not a continuum,
// and a road either belongs to the scale you are looking at or it does not.
// Alpha `interpolate`s across 12.4-13.6 instead, because it is the channel
// carrying the change — most of the lines on screen going from ghost to solid
// in one frame reads as the data reloading rather than as a map gaining detail.
// Interpolating between two `match` expressions is the same shape AMENITY_RADIUS
// uses: zoom stays at the top level of the property, the class lives inside it.
//
// Nothing here filters. Every feature is in the source, in the legend and
// clickable at every zoom; the context classes fall to a tenth of their alpha,
// not to nothing, so the reader can still see that the findings run through a
// dense network rather than across an empty page.

/**
 * Traffic stress. In Yokohama the classes run 3 / 72 / 15 / 10 percent of
 * network length, so LTS 2 alone is nearly three quarters of every line on the
 * map, and the LTS 3-4 corridors the view exists to show are buried in it.
 *
 * This is the one ordered variable of the three, so weight simply rises along
 * it, which also means it survives colour-vision deficiency: the arterials are
 * the widest and most solid lines regardless of hue.
 *
 * LTS 1 recedes with LTS 2 rather than separately. The ramp is ordered, so what
 * fades has to be a *tail* — dimming the calm streets and the hostile ones while
 * the 72% in between stayed solid would read as a network with holes in it
 * rather than as a map at a coarser scale.
 */
const byLts = (
  lts1: number,
  lts2: number,
  lts3: number,
  lts4: number
): ExpressionSpecification => [
  "match",
  // Same idiom as RouteLayer's ROUTE_COLOR: a missing lts becomes "" and falls
  // through to the fallback rather than erroring on a type mismatch. Segments
  // without a class are drawn as the quietest one — they are grey under
  // STRESS_LINE, so nothing is claimed about them by giving them least weight.
  ["to-string", ["coalesce", ["get", "lts"], ""]],
  "1",
  lts1,
  "2",
  lts2,
  "3",
  lts3,
  "4",
  lts4,
  lts1,
];

const STRESS_WIDTH: ExpressionSpecification = [
  "step",
  ["zoom"],
  byLts(1.0, 1.2, 1.6, 2.0),
  13,
  byLts(1.0, 1.4, 2.0, 2.5),
  15,
  byLts(1.4, 1.8, 2.4, 3.0),
  16.5,
  byLts(1.8, 2.2, 3.0, 3.8),
];

/**
 * A ghost rather than a removal, because the two say different things. Dropped
 * entirely, Yokohama at z12 reads as a city with a dozen arterials and nothing
 * else — the reader cannot tell whether the quiet grid is missing from the
 * analysis or merely quiet. At a tenth, the mesh is present as texture: enough
 * to see that the arterials cut through a dense network, not enough to compete
 * with them for attention.
 */
const STRESS_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12.4,
  byLts(0.1, 0.1, 0.92, 0.98),
  13.6,
  byLts(0.6, 0.8, 0.92, 0.98),
];

/**
 * "Where to invest" — `display_category` — on the same structure.
 *
 * It has the same problem as stress and a different shape to it. The classes
 * run 29 / 46 / 14 / 11 percent of Yokohama's network length (high / moderate /
 * bottleneck / low priority), so the two middle classes are three quarters of
 * the map while the bottleneck — the thing a planner opens this view to find —
 * is one segment in seven. Painted at one width, the answer is outnumbered by
 * its own context.
 *
 * Unlike stress, this variable is not ordered, so weight cannot simply rise
 * along it. It follows the *intervention* hierarchy instead: bottleneck first,
 * then the suitability pair, then low priority, which is the one class that
 * says "there is nothing to do here" and is therefore closer to basemap than to
 * finding. That is why low priority stays thin at every zoom and is the faintest
 * thing on the map at the region scale — 0.06, below even the LTS ghost.
 */
const byCategory = (
  high: number,
  moderate: number,
  bottleneck: number,
  lowPriority: number
): ExpressionSpecification => [
  "match",
  ["to-string", ["coalesce", ["get", "display_category"], ""]],
  "high",
  high,
  "moderate",
  moderate,
  "bottleneck",
  bottleneck,
  "low_priority",
  lowPriority,
  // An unclassified segment is not a finding, so it is drawn as context.
  lowPriority,
];

const INVEST_WIDTH: ExpressionSpecification = [
  "step",
  ["zoom"],
  byCategory(1.0, 1.1, 1.6, 1.0),
  13,
  byCategory(1.0, 1.4, 2.0, 1.0),
  15,
  byCategory(1.4, 1.8, 2.4, 1.15),
  16.5,
  byCategory(1.8, 2.2, 3.0, 1.4),
];

const INVEST_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12.4,
  byCategory(0.1, 0.1, 0.9, 0.06),
  13.6,
  byCategory(0.6, 0.8, 0.92, 0.4),
];

/**
 * "Infrastructure gap" — two values, one of which is the finding.
 *
 * The easiest of the three: 85% of Yokohama's network is `low` (adequate for
 * what the road is), and the 15% marked `high` is the whole output. So adequate
 * is context at the region scale and the gap is drawn at full weight throughout
 * — there is no zoom at which the gaps should be hard to find.
 */
const byGap = (adequate: number, gap: number): ExpressionSpecification => [
  "match",
  ["to-string", ["coalesce", ["get", "infra_gap"], ""]],
  "low",
  adequate,
  "high",
  gap,
  adequate,
];

const GAP_WIDTH: ExpressionSpecification = [
  "step",
  ["zoom"],
  byGap(1.0, 1.6),
  13,
  byGap(1.3, 2.0),
  15,
  byGap(1.7, 2.4),
  16.5,
  byGap(2.1, 3.0),
];

const GAP_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12.4,
  byGap(0.09, 0.9),
  13.6,
  byGap(0.75, 0.95),
];

/**
 * "Disconnected networks" — `island_id`. The odd one out of the four, in two
 * ways.
 *
 * Its classes are identities rather than values, so weight cannot follow the
 * variable: the three named clusters are drawn identically and differ only in
 * hue, because saying island #17 is more important than island #5 would be
 * saying something the analysis does not. What weight there is separates
 * *kinds* of thing — a named cluster from the couple of hundred small ones
 * behind it, and both from the streets that are in no low-stress cluster at
 * all.
 *
 * And its finding is not in this expression at all. The missing links live in
 * their own layer (islands-bridges, below) because they are drawn dashed, and
 * `line-dasharray` is one of the few paint properties MapLibre will not
 * evaluate as a data-driven expression. That layer sits above this one and
 * carries the top of the hierarchy: the whole view exists to say "these are
 * separate networks, and *these* are the links that would join them".
 *
 * Which ids count as named is decided by the scale builder from the data (the
 * three largest clusters), so the ramp is built per region rather than being a
 * constant like the other three.
 */
const islandLine = (
  named: string[]
): { width: ExpressionSpecification; opacity: ExpressionSpecification } => {
  const byIsland = (
    namedValue: number,
    other: number,
    noData: number
  ): ExpressionSpecification => {
    const expr: unknown[] = [
      "match",
      // Null becomes "", which is its own case: a street in no low-stress
      // cluster is not a small cluster, and drawing it as one would invent a
      // network that is not there.
      ["to-string", ["coalesce", ["get", "island_id"], ""]],
    ];
    for (const id of named) expr.push(id, namedValue);
    expr.push("", noData);
    expr.push(other);
    return expr as unknown as ExpressionSpecification;
  };

  return {
    width: [
      "step",
      ["zoom"],
      byIsland(1.0, 1.0, 1.0),
      13,
      byIsland(1.65, 1.3, 1.1),
      15,
      byIsland(2.0, 1.5, 1.15),
      16.5,
      byIsland(2.3, 1.65, 1.35),
    ],
    opacity: [
      "interpolate",
      ["linear"],
      ["zoom"],
      12.4,
      byIsland(0.5, 0.3, 0.12),
      13.6,
      byIsland(0.85, 0.55, 0.22),
    ],
  };
};

/**
 * The missing links themselves. Widths run wider than any island line at every
 * regime and the alpha never drops below 0.95, including at the opening frame:
 * this is the one class in the view that should be findable before the reader
 * has zoomed anywhere.
 *
 * The dash is in line-width units, so it scales with the ramp and keeps its
 * proportions at every zoom.
 */
const MISSING_LINK_WIDTH: ExpressionSpecification = [
  "step",
  ["zoom"],
  1.65,
  13,
  2.5,
  15,
  3.0,
  16.5,
  3.5,
];

const MISSING_LINK_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12.4,
  0.95,
  13.6,
  1.0,
];

/**
 * Which street views get an analytical ramp, keyed by the metric they colour
 * by. Anything not listed keeps the plain zoom ramps, which is the right
 * default: a variable whose distribution has not been looked at should not be
 * given a hierarchy it may not have.
 */
const ANALYTICAL_LINE: Record<
  string,
  { width: ExpressionSpecification; opacity: ExpressionSpecification }
> = {
  lts: { width: STRESS_WIDTH, opacity: STRESS_OPACITY },
  display_category: { width: INVEST_WIDTH, opacity: INVEST_OPACITY },
  infra_gap: { width: GAP_WIDTH, opacity: GAP_OPACITY },
};

const segmentPaint = (
  metric: string | null | undefined,
  domain: string[] | null | undefined
) => {
  if (metric === "island_id") return islandLine(domain ?? []);
  return (
    (metric ? ANALYTICAL_LINE[metric] : undefined) ?? {
      width: SEGMENT_WIDTH,
      opacity: SEGMENT_OPACITY,
    }
  );
};

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

/**
 * A station is the one amenity that anchors a whole catchment rather than
 * marking a single address, so it is drawn bigger than the schools and shops
 * around it — about halfway to a dock, which stays the largest point on the
 * map because it is infrastructure rather than context.
 *
 * The size split lives inside each zoom stop rather than in a `match` wrapped
 * around the whole thing: a style property may hold only one zoom-driven
 * `interpolate`, and nesting one inside a `match` is rejected outright, which
 * drops the layer.
 */
const amenityRadius = (station: number, other: number): ExpressionSpecification => [
  "match",
  ["get", "kind"],
  "station",
  station,
  other,
];

const AMENITY_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  amenityRadius(2.75, 2),
  15,
  amenityRadius(4.1, 3.2),
  18,
  amenityRadius(6.25, 5),
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
  segmentMetric,
  segmentDomain,
  showBridges,
  focus,
  controlRef,
  onMapReady,
}: MapViewProps) {
  const { region, data } = useRegion();
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
        // The proposal halo is its own hit target, because it is drawn
        // independently of the active view: under an area view the street
        // layer above is hidden, and without this a click on a recommendation
        // fell through to the hex underneath — while the legend was telling
        // the user to click the street.
        { id: "recommendations-glow", kind: "segment" as const, key: "way_id" },
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
      // The opening frame comes from the region's own published extent, not a
      // constant. The hand-picked centre and zoom that used to live here were
      // Yokohama's, worked out from its span by hand — and were quietly wrong
      // for any other city, and wrong again for Yokohama itself each time a
      // ward was added. fitBounds does that arithmetic per region.
      bounds: boundsOf(region),
      fitBoundsOptions: { padding: 24 },
      maxZoom: 18,
      // Floors the zoom at roughly the whole study area in view. Derived
      // rather than fixed at 11: that number was chosen because Yokohama is
      // ~12km across and showed a blob below it, which says nothing about a
      // region of a different size.
      minZoom: minZoomFor(region),
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
      data: data("bike_facilities.geojson"),
    });
    map.addSource("amenities", {
      type: "geojson",
      data: data("amenities.geojson"),
    });
    map.addSource("cycleways", {
      type: "geojson",
      data: data("cycleways.geojson"),
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
        // Kept in step by the paint effect below, which is where a view change
        // lands — this only sets the state the layer is born in.
        "line-width": segmentPaint(segmentMetric, segmentDomain).width,
        "line-opacity": segmentPaint(segmentMetric, segmentDomain).opacity,
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
        "line-color": MISSING_LINK_COLOR,
        "line-width": MISSING_LINK_WIDTH,
        "line-dasharray": [1.5, 1],
        "line-opacity": MISSING_LINK_OPACITY,
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
    // A street can also be selected through the proposal halo, which outlives
    // the street layer, so the selection glow has to outlive it too —
    // otherwise the panel opens with nothing on the map to point at.
    const segmentSelectable = showSegments || toggles.recommendations;
    set("segments-highlight", segmentSelectable);
    // Hiding a layer deselects whatever was selected in it (page.tsx), so its
    // highlight shouldn't survive to reappear when the layer comes back.
    if (!showHex && map.getLayer("hex-highlight")) {
      map.setFilter("hex-highlight", ["==", ["get", "hex_id"], ""]);
    }
    if (!segmentSelectable && map.getLayer("segments-highlight")) {
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
    if (showSegments) {
      map.setPaintProperty("segments-layer", "line-color", color);
      // Width and alpha carry the variable too in the three analytical views;
      // every other one hands them back to the plain zoom ramps.
      const { width, opacity } = segmentPaint(segmentMetric, segmentDomain);
      map.setPaintProperty("segments-layer", "line-width", width);
      map.setPaintProperty("segments-layer", "line-opacity", opacity);
    }
  }, [color, showHex, showSegments, segmentMetric, segmentDomain, dataReady]);

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
