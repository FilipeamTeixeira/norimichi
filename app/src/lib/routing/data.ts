/**
 * The static datasets, parsed once per region and shared.
 *
 * These used to live in the route-score handler. They moved here because the
 * graph provider needs the same segment index the scorer does, and loading it
 * twice would mean parsing a 3.2MB GeoJSON and rebuilding the index twice per
 * cold instance for no reason.
 *
 * They were module-level promises — one dataset per process, which was correct
 * only while the app served one study area. Keyed by region now, and *bounded*:
 * an unbounded map would be a slow leak that grows with the number of published
 * cities, since nothing would ever evict Osaka's network after one reader
 * looked at it. See RESIDENT_REGIONS.
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

/**
 * How many regions' datasets stay resident per process.
 *
 * Small on purpose. A parsed segment network is tens of megabytes, and the
 * access pattern is not uniform — a reader works within one city and at most
 * flips back to the one they came from. Two covers that; a larger number would
 * trade real memory for a cache hit that almost never happens.
 */
const RESIDENT_REGIONS = 2;

/**
 * A least-recently-used map of in-flight-or-resolved loads, keyed by region.
 *
 * Holds the promise rather than the value, so concurrent requests for a cold
 * region share one parse instead of racing into several. A rejected load is
 * evicted rather than remembered — the previous single-promise version cached
 * its own failure, which turned one unreadable file into a permanently broken
 * endpoint until the process restarted.
 */
export function perRegion<T>(
  load: (slug: string) => Promise<T>
): (slug: string) => Promise<T> {
  const resident = new Map<string, Promise<T>>();

  return (slug: string) => {
    const hit = resident.get(slug);
    if (hit) {
      resident.delete(slug);
      resident.set(slug, hit); // re-insert: Map iterates in insertion order
      return hit;
    }

    const pending = load(slug).catch((err: unknown) => {
      resident.delete(slug);
      throw err;
    });
    resident.set(slug, pending);

    while (resident.size > RESIDENT_REGIONS) {
      const oldest = resident.keys().next();
      if (oldest.done) break;
      resident.delete(oldest.value);
    }
    return pending;
  };
}

/**
 * Region slugs are written into a filesystem path, so they are checked here
 * even though every caller is supposed to have validated against the manifest
 * first. The manifest check is the real gate; this is the one that holds if
 * somebody adds a caller and forgets it.
 */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const dataPath = (slug: string, name: string) => {
  if (!SLUG.test(slug)) throw new Error(`invalid region slug: ${slug}`);
  return path.join(process.cwd(), "public", "data", slug, name);
};

export const loadIndex = perRegion<SegmentIndex>((slug) =>
  readFile(dataPath(slug, "segments.geojson"), "utf8").then((raw) =>
    buildSegmentIndex(
      JSON.parse(raw) as FeatureCollection<MultiLineString, SegmentProperties>
    )
  )
);

export const loadJunctions = perRegion<SignalJunctions>((slug) =>
  readFile(dataPath(slug, "traffic_signals.geojson"), "utf8").then((raw) =>
    buildSignalJunctions(JSON.parse(raw) as FeatureCollection<GeoJSON.Point>)
  )
);

export const loadFacilities = perRegion<
  FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
>((slug) =>
  readFile(dataPath(slug, "bike_facilities.geojson"), "utf8").then(
    (raw) =>
      JSON.parse(raw) as FeatureCollection<GeoJSON.Point, BikeFacilityProperties>
  )
);

/**
 * The raw segment collection, for the graph provider's own routable network.
 *
 * `SegmentIndex` throws away what routing needs — it is built for "what is
 * near this point", and flattens every way into tolerance-padded grid cells
 * with no notion of which vertex touches which. Rather than widen that
 * structure for a second, unrelated purpose, the graph builds its own topology
 * from the same file. Same one-parse-per-region rule applies.
 */
export const loadSegments = perRegion<
  FeatureCollection<MultiLineString, SegmentProperties>
>((slug) =>
  readFile(dataPath(slug, "segments.geojson"), "utf8").then(
    (raw) =>
      JSON.parse(raw) as FeatureCollection<MultiLineString, SegmentProperties>
  )
);
