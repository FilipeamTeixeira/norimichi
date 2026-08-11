"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  Map,
  NavigationControl,
  type MapMouseEvent,
  type ExpressionSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SegmentFeature } from "@/lib/types";
import { CATEGORY_COLORS } from "@/lib/types";

interface MapViewProps {
  onSegmentClick: (feature: SegmentFeature | null) => void;
  /** A `recommendation` value to isolate, or null to show everything. */
  interventionFilter?: string | null;
}

/**
 * Build a MapLibre `match` expression that gives bottlenecks, low-priority
 * roads, and everything else three different values of the same property.
 */
function byCategory(
  bottleneck: number,
  lowPriority: number,
  rest: number
): ExpressionSpecification {
  return [
    "match",
    ["get", "display_category"],
    "bottleneck",
    bottleneck,
    "low_priority",
    lowPriority,
    rest,
  ];
}

/** True where the segment carries the recommendation being isolated. */
function matchesFilter(filter: string): ExpressionSpecification {
  return ["==", ["get", "recommendation"], filter];
}

/**
 * Line width. With no filter, width tracks category (bottlenecks heavier).
 * With a filter, matching segments go heavy and everything else thins out to
 * a faint trace - kept visible rather than removed, so the surrounding
 * network still reads as context for where the matches sit.
 */
function widthFor(filter: string | null | undefined): ExpressionSpecification {
  const at = (
    bottleneck: number,
    lowPriority: number,
    rest: number,
    matched: number
  ): ExpressionSpecification =>
    filter
      ? ["case", matchesFilter(filter), matched, 0.7]
      : byCategory(bottleneck, lowPriority, rest);

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    10,
    at(1.4, 0.8, 1, 2),
    14,
    at(3.5, 1.8, 2.5, 4.5),
    18,
    at(5.5, 3, 4, 7),
  ];
}

function opacityFor(filter: string | null | undefined): ExpressionSpecification {
  return filter
    ? ["case", matchesFilter(filter), 0.95, 0.12]
    : byCategory(0.95, 0.5, 0.85);
}

export default function MapView({
  onSegmentClick,
  interventionFilter = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: ["segments-layer"],
      });

      if (features.length > 0) {
        const f = features[0];
        onSegmentClick({
          type: "Feature",
          geometry: f.geometry,
          properties: f.properties,
        } as SegmentFeature);

        map.setFilter("segments-highlight", [
          "==",
          ["get", "way_id"],
          f.properties.way_id,
        ]);
      } else {
        onSegmentClick(null);
        map.setFilter("segments-highlight", ["==", ["get", "way_id"], -1]);
      }
    },
    [onSegmentClick]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
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
      minZoom: 10,
    });

    map.addControl(new NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("segments", {
        type: "geojson",
        data: "/data/segments.geojson",
      });

      map.addSource("bike-facilities", {
        type: "geojson",
        data: "/data/bike_facilities.geojson",
      });

      map.addSource("hexagons", {
        type: "geojson",
        data: "/data/hexagons.geojson",
      });

      map.addLayer({
        id: "hex-fill",
        type: "fill",
        source: "hexagons",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "gap_score"], 0],
            -1,
            "#dbeafe",
            0,
            "#fef3c7",
            1,
            "#fecaca",
          ],
          "fill-opacity": 0.15,
        },
        layout: {
          visibility: "none",
        },
      });

      map.addLayer({
        id: "hex-outline",
        type: "line",
        source: "hexagons",
        paint: {
          "line-color": "#94a3b8",
          "line-width": 0.5,
          "line-opacity": 0.3,
        },
        layout: {
          visibility: "none",
        },
      });

      map.addLayer({
        id: "segments-layer",
        type: "line",
        source: "segments",
        paint: {
          "line-color": [
            "match",
            ["get", "display_category"],
            "high",
            CATEGORY_COLORS.high,
            "moderate",
            CATEGORY_COLORS.moderate,
            "bottleneck",
            CATEGORY_COLORS.bottleneck,
            "low_priority",
            CATEGORY_COLORS.low_priority,
            "#9ca3af",
          ],
          // Bottlenecks are the headline finding, so they read heavier;
          // low-priority stressful roads recede rather than competing for
          // attention with them.
          "line-width": widthFor(interventionFilter),
          "line-opacity": opacityFor(interventionFilter),
        },
      });

      map.addLayer({
        id: "segments-highlight",
        type: "line",
        source: "segments",
        paint: {
          "line-color": "#1e3a5f",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3,
            14,
            5,
            18,
            7,
          ],
          "line-opacity": 0.9,
        },
        filter: ["==", ["get", "way_id"], -1],
      });

      map.addLayer({
        id: "bike-facilities-layer",
        type: "circle",
        source: "bike-facilities",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            2,
            14,
            4,
            18,
            7,
          ],
          "circle-color": [
            "match",
            ["get", "facility_type"],
            "parking",
            "#6366f1",
            "sharing",
            "#06b6d4",
            "#9ca3af",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.8,
        },
        minzoom: 12,
      });

      map.on("mouseenter", "segments-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "segments-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      setLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [handleClick, loaded]);

  // Re-paint when the intervention filter changes. Repainting beats
  // setFilter here: dropping non-matching segments from the layer entirely
  // would leave the matches floating with no network around them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getLayer("segments-layer")) return;
    map.setPaintProperty("segments-layer", "line-width", widthFor(interventionFilter));
    map.setPaintProperty("segments-layer", "line-opacity", opacityFor(interventionFilter));
  }, [interventionFilter, loaded]);

  return <div ref={containerRef} className="w-full h-full" />;
}
