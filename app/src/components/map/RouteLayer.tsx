"use client";

import { useEffect, useRef } from "react";
import {
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map,
} from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { RoutePieceProperties } from "@/lib/route-matching";
import type { NearbyFacility } from "@/lib/route-types";
import { BIKE_COLOR, NO_DATA, STRESS_LINE } from "@/lib/scales";

/**
 * Everything the Route Analysis map draws, attached imperatively to the map
 * MapView owns.
 *
 * Its own component rather than another mode inside MapView because the two
 * have opposite lifetimes: MapView's layers are the deployment's static
 * exports, added once and repainted, while these are one answer to one
 * question and are replaced wholesale every time the reader moves a pin.
 *
 * Renders nothing — React is being used here for the effect lifecycle, not for
 * the DOM. The A/B pins are real DOM, but they are MapLibre Markers, which the
 * map positions itself.
 */

interface Props {
  map: Map | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  route: FeatureCollection<LineString, RoutePieceProperties> | null;
  /** way_id of the highest-stress segment, drawn with a halo. */
  worstWayId: number | null;
  facilities: NearbyFacility[];
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Deliberately heavier than the base network's SEGMENT_WIDTH (0.8→7 over the
 * same zoom range), matching the treatment a selected segment gets: this is the
 * one thing on the screen the reader asked for, and it should not be competing
 * with the basemap's own road casings for attention.
 */
const ROUTE_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  3,
  13,
  5,
  15,
  7.5,
  18,
  11,
];

const CASING_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  5,
  13,
  8,
  15,
  11.5,
  18,
  16,
];

/**
 * The same four colours as the "Traffic stress" view, keyed off the same
 * variable — see STRESS_LINE in lib/scales.ts for why this ramp and not the
 * green/amber/red of the investment view. Unmatched stretches fall through to
 * the no-data grey rather than being coloured by guess.
 */
const ROUTE_COLOR: ExpressionSpecification = [
  "match",
  ["to-string", ["coalesce", ["get", "lts"], ""]],
  "1",
  STRESS_LINE[0],
  "2",
  STRESS_LINE[1],
  "3",
  STRESS_LINE[2],
  "4",
  STRESS_LINE[3],
  NO_DATA,
];

/** Pin markers, built as DOM rather than symbol layers: the basemap style
 *  carries no glyphs, so a text layer would render nothing at all. */
function pinElement(label: string): HTMLElement {
  const el = document.createElement("div");
  el.className =
    "w-6 h-6 rounded-full bg-neutral-900 text-white text-[11px] font-bold " +
    "flex items-center justify-center shadow-md ring-2 ring-white select-none";
  el.textContent = label;
  return el;
}

export default function RouteLayer({
  map,
  origin,
  destination,
  route,
  worstWayId,
  facilities,
}: Props) {
  const originMarker = useRef<Marker | null>(null);
  const destinationMarker = useRef<Marker | null>(null);

  // --- Sources and layers, added once per map ---------------------------
  useEffect(() => {
    if (!map || map.getSource("route")) return;

    map.addSource("route", { type: "geojson", data: EMPTY });
    map.addSource("route-facilities", { type: "geojson", data: EMPTY });

    // A white casing under the coloured line. The basemap is near-monochrome
    // but not empty, and a 7px line laid straight onto it reads as part of the
    // road network rather than as something drawn on top of it.
    map.addLayer({
      id: "route-casing",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": CASING_WIDTH,
        "line-opacity": 0.95,
      },
    });

    // The worst stretch, called out the way the main map calls out a bridge:
    // a wide, blurred halo under the line rather than a fifth colour on it,
    // which would collide with the LTS ramp it sits inside.
    map.addLayer({
      id: "route-worst",
      type: "line",
      source: "route",
      filter: ["==", ["get", "way_id"], -1],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": STRESS_LINE[3],
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 11, 15, 20, 18, 28],
        "line-opacity": 0.28,
        "line-blur": 6,
      },
    });

    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROUTE_COLOR,
        "line-width": ROUTE_WIDTH,
        "line-opacity": 0.95,
      },
    });

    // Same fill-vs-ring convention as the main map's bike facilities toggle,
    // so parking and sharing are told apart the same way in both places.
    map.addLayer({
      id: "route-facilities-layer",
      type: "circle",
      source: "route-facilities",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 18, 8],
        "circle-color": [
          "case",
          ["==", ["get", "facility_type"], "sharing"],
          BIKE_COLOR,
          "#ffffff",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": BIKE_COLOR,
        "circle-opacity": 0.95,
      },
    });
  }, [map]);

  // --- The route itself --------------------------------------------------
  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>("route");
    if (!source) return;
    source.setData(route ?? EMPTY);
    if (map.getLayer("route-worst")) {
      map.setFilter("route-worst", ["==", ["get", "way_id"], worstWayId ?? -1]);
    }
  }, [map, route, worstWayId]);

  // --- Bike facilities at the destination --------------------------------
  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>("route-facilities");
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: facilities.map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: f.at },
        properties: { ...f },
      })),
    });
  }, [map, facilities]);

  // --- The two pins ------------------------------------------------------
  useEffect(() => {
    if (!map) return;

    const place = (
      ref: React.RefObject<Marker | null>,
      at: [number, number] | null,
      label: string
    ) => {
      if (!at) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (ref.current) ref.current.setLngLat(at);
      else ref.current = new Marker({ element: pinElement(label) })
        .setLngLat(at)
        .addTo(map);
    };

    place(originMarker, origin, "A");
    place(destinationMarker, destination, "B");
  }, [map, origin, destination]);

  useEffect(
    () => () => {
      originMarker.current?.remove();
      destinationMarker.current?.remove();
    },
    []
  );

  return null;
}
