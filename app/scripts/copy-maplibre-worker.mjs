/**
 * Copies maplibre-gl's worker into `public/maplibre/` so it is served from a
 * stable URL.
 *
 * maplibre-gl v6 resolves its worker against `import.meta.url`, which after
 * bundling points into `/_next/static/chunks/` — a directory the worker file is
 * never emitted into. The 404 kills the worker pool, and with it every GeoJSON
 * source, while raster tiles keep rendering and hide the failure.
 *
 * Both files are needed: the worker imports `./maplibre-gl-shared.mjs` by
 * relative path, so it only resolves if the two stay siblings. Copying rather
 * than committing keeps them on the same version as the installed maplibre-gl;
 * a stale pair fails in ways that look like data bugs.
 * See `setWorkerUrl` in src/components/map/MapView.tsx.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Resolved through the package itself, so it follows wherever npm installed it.
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const root = join(dirname(new URL(import.meta.url).pathname), "..");
const outDir = join(root, "public", "maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(outDir, { recursive: true });
for (const file of files) {
  copyFileSync(join(dist, file), join(outDir, file));
}

console.log(`copied ${files.join(", ")} -> public/maplibre/`);
