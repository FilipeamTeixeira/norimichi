// No `server-only` import: it is not a dependency of this project. The
// `node:fs` import below is what keeps this module off the client — importing
// it from a Client Component fails the build on its own.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Region, RegionManifest } from "./regions";

/**
 * The manifest, read off disk once per process.
 *
 * Read rather than imported so that republishing a region does not need a
 * rebuild — the pipeline rewrites public/data/regions.json and a restarted
 * server picks it up. Same one-parse-per-process rule as lib/routing/data.ts,
 * and the same consequence: run_region.R tells you to restart the dev server.
 */
let manifestPromise: Promise<RegionManifest> | null = null;

export function loadManifest(): Promise<RegionManifest> {
  manifestPromise ??= readFile(
    path.join(process.cwd(), "public", "data", "regions.json"),
    "utf8"
  ).then((raw) => JSON.parse(raw) as RegionManifest);
  return manifestPromise;
}

/** The region for a URL slug, or null if nothing is published under it. */
export async function findRegion(slug: string): Promise<Region | null> {
  const manifest = await loadManifest();
  return manifest.regions.find((r) => r.slug === slug) ?? null;
}

/**
 * Resolve a slug that has already been validated by the route.
 *
 * Separate from findRegion() so server code downstream of the layout does not
 * have to re-handle "what if it does not exist" — by then the layout has
 * already called notFound().
 */
export async function requireRegion(slug: string): Promise<Region> {
  const region = await findRegion(slug);
  if (!region) throw new Error(`unknown region: ${slug}`);
  return region;
}
