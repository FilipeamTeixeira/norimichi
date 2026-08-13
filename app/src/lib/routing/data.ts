/**
 * The static datasets, loaded once per process and shared.
 *
 * These used to live in the route-score handler. They moved here because the
 * graph provider needs the same segment index the scorer does, and loading it
 * twice would mean parsing a 3.2MB GeoJSON and rebuilding the index twice per
 * cold instance for no reason. Module-level promises, so the first request into
 * a cold instance pays and every later one on that instance gets it free.
 *
 * Node APIs live here and nowhere else in lib/routing — the providers stay
 * importable without dragging `fs` into a bundle.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, MultiLineString } from "geojson";
import {
  buildSegmentIndex,
  buildSignalJunctions,
  type SegmentIndex,
  type SignalJunctions,
} from "../route-matching";
import type { BikeFacilityProperties, SegmentProperties } from "../types";

let indexPromise: Promise<SegmentIndex> | null = null;
let junctionsPromise: Promise<SignalJunctions> | null = null;
let facilitiesPromise: Promise<
  FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
> | null = null;

const dataPath = (name: string) =>
  path.join(process.cwd(), "public", "data", name);

export function loadIndex(): Promise<SegmentIndex> {
  indexPromise ??= readFile(dataPath("segments.geojson"), "utf8").then((raw) =>
    buildSegmentIndex(
      JSON.parse(raw) as FeatureCollection<MultiLineString, SegmentProperties>
    )
  );
  return indexPromise;
}

export function loadJunctions(): Promise<SignalJunctions> {
  junctionsPromise ??= readFile(
    dataPath("traffic_signals.geojson"),
    "utf8"
  ).then((raw) =>
    buildSignalJunctions(JSON.parse(raw) as FeatureCollection<GeoJSON.Point>)
  );
  return junctionsPromise;
}

export function loadFacilities(): Promise<
  FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
> {
  facilitiesPromise ??= readFile(
    dataPath("bike_facilities.geojson"),
    "utf8"
  ).then(
    (raw) =>
      JSON.parse(raw) as FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
  );
  return facilitiesPromise;
}

/**
 * The raw segment collection, for the graph provider's own routable network.
 *
 * `SegmentIndex` throws away what routing needs — it is built for "what is
 * near this point", and flattens every way into tolerance-padded grid cells
 * with no notion of which vertex touches which. Rather than widen that
 * structure for a second, unrelated purpose, the graph builds its own topology
 * from the same file. Same one-parse-per-process rule applies.
 */
let segmentsPromise: Promise<
  FeatureCollection<MultiLineString, SegmentProperties>
> | null = null;

export function loadSegments(): Promise<
  FeatureCollection<MultiLineString, SegmentProperties>
> {
  segmentsPromise ??= readFile(dataPath("segments.geojson"), "utf8").then(
    (raw) =>
      JSON.parse(raw) as FeatureCollection<MultiLineString, SegmentProperties>
  );
  return segmentsPromise;
}
