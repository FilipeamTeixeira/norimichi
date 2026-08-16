/**
 * The contract for `access_index.json`, `access/<origin_id>.json` and
 * `population_mesh.geojson` — written by pipeline/scripts/13_compute_access.R
 * via the three `export_access_*` functions in R/export_geojson.R.
 *
 * Mirrors those exports exactly, like lib/types.ts does for the rest. Nothing
 * here is computed: every population figure in the app comes from the pipeline
 * at the bands it declares, and the frontend's only arithmetic is picking which
 * band to show and which colour a cell gets.
 */

export type AccessOriginKind = "school" | "station";

/**
 * KSJ 学校分類コード, narrowed to the classes where "could a pupil get here by
 * bicycle every day" is a real question. `international` is 各種学校, which in
 * this study area is the international and ethnic schools on the Yamate bluff.
 * 幼稚園, 認定こども園, 大学, 専修学校 and 特別支援学校 are excluded upstream —
 * see ACCESS_SCHOOL_CLASSES in R/score_access.R for why each one is.
 */
export type SchoolClass =
  | "elementary"
  | "junior_high"
  | "high"
  | "international";

/** One distance band's figures, for one origin. */
export interface AccessBand {
  band_m: number;
  /** Residents who can reach the origin within the band on any street. */
  population_any: number;
  /** …and who can do it without leaving low-stress streets. */
  population_calm: number;
  /** The difference. The number this whole analysis exists to produce. */
  severed: number;
  /**
   * `severed / population_any`, or null where nobody can reach the origin at
   * all. Null rather than 0 deliberately: a school no one can get to has not
   * cut anybody off, and "0% cut off" beside it would read as a clean bill of
   * health. Quote this in preference to the counts — both sides of the
   * subtraction share every arbitrary constant, so the ratio survives them.
   */
  severed_share: number | null;
  population_child_any: number;
  population_child_calm: number;
  population_elderly_any: number;
  population_elderly_calm: number;
  cells_any: number;
  cells_calm: number;
}

/** What upgrading one corridor would add to the calm surface, per band. */
export interface AccessUnlock {
  band_m: number;
  population: number;
  population_child: number;
  population_elderly: number;
}

/**
 * A corridor on the edge of an origin's calm reach — the next street along
 * from where a cautious rider has to stop.
 *
 * `unlock` is null only if the pipeline could not simulate it; corridors whose
 * own `benefit_kind` is `not_modelled` never reach this list at all, so a
 * frontier corridor with no unlock figure is a bug rather than a caveat.
 */
export interface FrontierCorridor {
  /** Integer, like `CorridorProperties.corridor_id` in lib/types.ts. */
  corridor_id: number;
  name: string | null;
  recommendation: string | null;
  cost_tier: "Low" | "Medium" | "High" | null;
  unlock: AccessUnlock[] | null;
}

export interface AccessOrigin {
  origin_id: string;
  kind: AccessOriginKind;
  school_class: SchoolClass | null;
  name: string;
  detail: string | null;
  lon: number;
  lat: number;
  /** False where no street came within `ORIGIN_SNAP_M`; all figures are 0. */
  snapped: boolean;
  /** False where the street at the gate is itself above `calm_max_lts`. */
  calm_at_gate: boolean;
  bands: AccessBand[];
  /** Before the per-origin cap — `frontier` may be shorter than this. */
  frontier_corridor_count: number;
  frontier: FrontierCorridor[];
}

/**
 * The whole-study-area figure, per origin kind and band.
 *
 * Measured from the *nearest* origin of that kind, so a mesh cell counts once.
 * This exists because the frontend must not derive it: reach surfaces overlap
 * almost entirely — a resident in the middle of the ward is within 3 km of
 * dozens of schools — so adding up every origin's `population_any` counts them
 * once per school and returns several times the region's population. The page
 * did exactly that until the number came out at 13.8 million against a region
 * of 612,000.
 */
export interface AccessStudyTotal {
  kind: AccessOriginKind;
  band_m: number;
  population_any: number;
  population_calm: number;
  severed: number;
  severed_share: number | null;
  population_child_any: number;
  population_child_calm: number;
}

export interface AccessIndex {
  study_area: string;
  origin_count: number;
  /** Everyone in the mesh, for scale against the figures above. */
  region_population: number;
  study: AccessStudyTotal[];
  bands_m: number[];
  primary_band_m: number;
  buffer_m: number;
  calm_max_lts: number;
  mesh: {
    cell_count: number;
    cell_size_m: number;
    /** False where e-Stat's table for this run carried no 0–14 band. */
    has_child_band: boolean;
    has_elderly_band: boolean;
  };
  notes: Record<string, string>;
  origins: AccessOrigin[];
}

/**
 * One origin's surface: network distance in metres to each 250m cell, on each
 * of the two networks. `null` in the second slot means the cell is not
 * reachable on low-stress streets within the largest band.
 *
 * Distances rather than band numbers, so moving the band control is a repaint
 * rather than a refetch. The bands themselves still come from the pipeline —
 * see `AccessIndex.bands_m`.
 */
export interface AccessSurface {
  origin_id: string;
  bands_m: number[];
  cells: Record<string, [number, number | null]>;
}

export interface MeshCellProperties {
  mesh_code: string;
  population: number;
  population_child: number | null;
  population_elderly: number | null;
}

/** How a cell renders for the selected origin at the selected band. */
export type CellStatus = "calm" | "severed" | "unreached";

/** The school classes the picker offers, in the order it offers them. */
export const SCHOOL_CLASSES: SchoolClass[] = [
  "elementary",
  "junior_high",
  "high",
  "international",
];

/**
 * The origins the picker is currently listing.
 *
 * Shared between the list and the map dots deliberately: the dots are the same
 * set of places as the rows, so filtering out a school class has to remove it
 * from both. Two independent filters would eventually disagree, and a dot with
 * no row is a place the reader cannot open.
 */
export function visibleOrigins(
  origins: AccessOrigin[],
  kind: AccessOriginKind,
  classes: SchoolClass[]
): AccessOrigin[] {
  return origins.filter(
    (o) =>
      o.kind === kind &&
      (kind !== "school" ||
        (o.school_class !== null && classes.includes(o.school_class)))
  );
}

/**
 * jsonlite writes an empty named list as `[]`, not `{}` — so an origin whose
 * surface reaches nothing arrives as an array and would break every lookup
 * below. Normalised on load rather than guarded at each use.
 */
export function normalizeSurface(raw: AccessSurface): AccessSurface {
  const cells = raw.cells;
  return Array.isArray(cells) ? { ...raw, cells: {} } : raw;
}

export function cellStatus(
  surface: AccessSurface,
  meshCode: string,
  bandM: number
): CellStatus {
  const entry = surface.cells[meshCode];
  if (!entry) return "unreached";
  const [any, calm] = entry;
  if (any > bandM) return "unreached";
  return calm !== null && calm <= bandM ? "calm" : "severed";
}

/** The band's figures, falling back to the widest one the export carries. */
export function bandAt(origin: AccessOrigin, bandM: number): AccessBand {
  return (
    origin.bands.find((b) => b.band_m === bandM) ??
    origin.bands[origin.bands.length - 1]
  );
}

export function unlockAt(
  corridor: FrontierCorridor,
  bandM: number
): AccessUnlock | null {
  return corridor.unlock?.find((u) => u.band_m === bandM) ?? null;
}
