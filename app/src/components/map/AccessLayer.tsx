"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Marker,
  type GeoJSONSource,
  type Map,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import {
  ACCESS_FILL_OPACITY,
  ACCESS_SURFACE,
  AMENITY_COLORS,
} from "@/lib/scales";
import {
  cellStatus,
  type AccessOrigin,
  type AccessSurface,
  type MeshCellProperties,
} from "@/lib/access-types";

/**
 * The access surface: every 250m mesh cell within the selected band, painted
 * by whether its residents can reach the selected origin on low-stress streets.
 *
 * Its own component for the same reason RouteLayer is one — MapView's layers
 * are the deployment's static exports, added once and repainted, while this is
 * one answer to one question and is replaced wholesale whenever the reader
 * picks a different school or a different distance.
 *
 * The mesh is drawn rather than the reachable streets, and that is the whole
 * design of this page. A network of green and red lines would show the same
 * computation and answer a different question: the figure in the panel is
 * *residents*, and a reader has to be able to see the thing being counted.
 * Cells are also what the pipeline counts in — one cell in, one cell out — so
 * there is no step between what is measured and what is shown.
 *
 * Renders nothing. React is here for the effect lifecycle; the origin pin is
 * DOM, but MapLibre positions it.
 */

interface Props {
  map: Map | null;
  /** The whole 250m grid, loaded once. */
  mesh: FeatureCollection<Polygon, MeshCellProperties> | null;
  /** The selected origin's surface, or null while none is selected. */
  surface: AccessSurface | null;
  origin: AccessOrigin | null;
  bandM: number;
  /** A searched place the list is measuring from, if any. */
  reference: [number, number] | null;
  /**
   * The origins the picker is listing, drawn as dots — empty unless the reader
   * has asked to see them. The selected origin keeps its own pin on top; a dot
   * underneath it is what makes the pin read as one of a set.
   */
  pins: AccessOrigin[];
  /** Clicking a dot selects it, same as clicking its row. */
  onPickPin: (origin: AccessOrigin) => void;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function pinElement(kind: AccessOrigin["kind"]): HTMLElement {
  const el = document.createElement("div");
  el.className =
    "w-7 h-7 rounded-full ring-[3px] ring-white shadow-md " +
    "flex items-center justify-center select-none";
  el.style.backgroundColor = AMENITY_COLORS[kind];
  el.innerHTML =
    kind === "school"
      ? `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2.5l6 3-6 3-6-3 6-3z" fill="white"/><path d="M4.5 7.2v3.3c0 .9 1.6 1.6 3.5 1.6s3.5-.7 3.5-1.6V7.2" stroke="white" stroke-width="1.3" fill="none"/></svg>`
      : `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="4" y="2.5" width="8" height="8" rx="1.6" fill="white"/><circle cx="6.2" cy="8.4" r=".9" fill="${AMENITY_COLORS.station}"/><circle cx="9.8" cy="8.4" r=".9" fill="${AMENITY_COLORS.station}"/><path d="M5.5 11l-1.3 2M10.5 11l1.3 2" stroke="white" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  return el;
}

/**
 * The searched place. Deliberately a hollow neutral ring rather than anything
 * on the surface's two-colour scale: it is where the reader is standing, not a
 * measurement, and giving it a data colour would put it in the legend's
 * vocabulary without being in the legend.
 */
function referenceElement(): HTMLElement {
  const el = document.createElement("div");
  el.className =
    "w-3.5 h-3.5 rounded-full bg-white ring-[3px] ring-neutral-800 shadow-md select-none";
  return el;
}

export default function AccessLayer({
  map,
  mesh,
  surface,
  origin,
  bandM,
  reference,
  pins,
  onPickPin,
}: Props) {
  const marker = useRef<Marker | null>(null);
  const referenceMarker = useRef<Marker | null>(null);

  // The dot layer's click handler is registered once against a long-lived map,
  // so what it needs has to be reachable through refs rather than closed over
  // — same reasoning as MapView's zoom handler.
  const pinsRef = useRef(pins);
  const onPickRef = useRef(onPickPin);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  useEffect(() => {
    onPickRef.current = onPickPin;
  }, [onPickPin]);

  const pinData = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: pins.map(
        (o): Feature<Point> => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [o.lon, o.lat] },
          properties: { origin_id: o.origin_id, kind: o.kind },
        })
      ),
    }),
    [pins]
  );

  /**
   * Only the cells inside the band, each stamped with its status.
   *
   * Rebuilt rather than driven through `setFeatureState`, which would avoid
   * re-serialising the geometry. At ~1000 cells that saving is a few
   * milliseconds against a control the reader clicks, and feature state would
   * need a `promoteId` on the source plus explicit clearing between origins —
   * two more places for a stale surface to survive a selection change.
   *
   * Unreached cells are dropped rather than painted a third colour. The band
   * is a hard edge in the underlying measurement, and a grey ring around every
   * surface would read as a category of its own rather than as the outside.
   */
  const painted = useMemo<FeatureCollection>(() => {
    if (!mesh || !surface) return EMPTY;

    const features: Feature<Polygon>[] = [];
    for (const feature of mesh.features) {
      const status = cellStatus(surface, feature.properties.mesh_code, bandM);
      if (status === "unreached") continue;
      features.push({
        ...feature,
        properties: { ...feature.properties, status },
      });
    }
    return { type: "FeatureCollection", features };
  }, [mesh, surface, bandM]);

  // --- Source and layers, added once per map -----------------------------
  useEffect(() => {
    if (!map || map.getSource("access-cells")) return;

    map.addSource("access-cells", { type: "geojson", data: EMPTY });

    map.addLayer({
      id: "access-cells-fill",
      type: "fill",
      source: "access-cells",
      paint: {
        "fill-color": [
          "match",
          ["get", "status"],
          "calm",
          ACCESS_SURFACE.calm,
          ACCESS_SURFACE.severed,
        ],
        "fill-opacity": ACCESS_FILL_OPACITY,
      },
    });

    // A hairline in the same hue as the fill, not a neutral grid. It exists to
    // keep the 250m cell legible as a *unit of measurement* when several
    // same-coloured cells abut — without it the surface reads as a smooth
    // isochrone, which would claim a precision the mesh does not have.
    map.addLayer({
      id: "access-cells-edge",
      type: "line",
      source: "access-cells",
      paint: {
        "line-color": [
          "match",
          ["get", "status"],
          "calm",
          ACCESS_SURFACE.calm,
          ACCESS_SURFACE.severed,
        ],
        "line-width": 0.6,
        "line-opacity": 0.55,
      },
    });

    // Above the surface, because a dot inside a coloured cell is the one thing
    // on this map small enough to be lost under a fill. Same two hues the
    // amenity points use elsewhere in the app, so a school is the same colour
    // on every page.
    map.addSource("access-origins", { type: "geojson", data: EMPTY });
    map.addLayer({
      id: "access-origin-dots",
      type: "circle",
      source: "access-origins",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 4.5, 18, 7],
        "circle-color": [
          "match",
          ["get", "kind"],
          "station",
          AMENITY_COLORS.station,
          AMENITY_COLORS.school,
        ],
        "circle-stroke-width": 1.25,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>("access-cells")?.setData(painted);
  }, [map, painted]);

  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>("access-origins")?.setData(pinData);
  }, [map, pinData]);

  // --- Clicking a dot ----------------------------------------------------
  useEffect(() => {
    if (!map) return;

    const click = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.origin_id;
      const picked = pinsRef.current.find((o) => o.origin_id === id);
      if (picked) onPickRef.current(picked);
    };
    const enter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", "access-origin-dots", click);
    map.on("mouseenter", "access-origin-dots", enter);
    map.on("mouseleave", "access-origin-dots", leave);
    return () => {
      map.off("click", "access-origin-dots", click);
      map.off("mouseenter", "access-origin-dots", enter);
      map.off("mouseleave", "access-origin-dots", leave);
    };
  }, [map]);

  // --- The origin pin ----------------------------------------------------
  useEffect(() => {
    if (!map) return;
    if (!origin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    // Recreated rather than moved when the kind changes, since the element's
    // icon is baked in at construction.
    marker.current?.remove();
    marker.current = new Marker({ element: pinElement(origin.kind) })
      .setLngLat([origin.lon, origin.lat])
      .addTo(map);
  }, [map, origin]);

  useEffect(() => {
    if (!map) return;
    if (!reference) {
      referenceMarker.current?.remove();
      referenceMarker.current = null;
      return;
    }
    if (referenceMarker.current) referenceMarker.current.setLngLat(reference);
    else
      referenceMarker.current = new Marker({ element: referenceElement() })
        .setLngLat(reference)
        .addTo(map);
  }, [map, reference]);

  useEffect(
    () => () => {
      marker.current?.remove();
      referenceMarker.current?.remove();
    },
    []
  );

  return null;
}
