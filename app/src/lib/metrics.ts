/**
 * What the exported variables are *for*, which is not the same question as
 * what they are.
 *
 * Only a handful of fields earn a place on the map: one score at a time, plus
 * a few point and overlay toggles. Everything else — raw inputs, sub-scores,
 * the whole ROI block — is panel content, shown when a feature is clicked.
 * Grouping them here keeps that decision in one place rather than spread
 * across the sidebar, the map and three panels.
 *
 * The field names mirror pipeline/R/export_geojson.R.
 *
 * Every group is a function of the dictionary rather than a module constant,
 * because the labels are the half of a MetricDef that has a language. The
 * structure — which key, which scale, which domain, how to format — does not,
 * and stays here where it can be read next to the comment explaining it. Client
 * components take these through the memoised hooks in `@/i18n/metrics`.
 */

import type { Dict } from "@/i18n/en";

export type MetricScale =
  | "sequential"
  | "diverging"
  | "ordinal"
  | "boolean"
  | "nominal";

export interface MetricDef {
  key: string;
  label: string;
  scale: MetricScale;
  /** Printed after the value, e.g. "¥/day". */
  unit?: string;
  /** One line explaining what the number means. */
  hint?: string;
  /** Fixed order for `ordinal` / `nominal`; also fixes the legend order. */
  domain?: (string | number)[];
  /** Legend text per `domain` entry. Falls back to the raw value. */
  domainLabels?: string[];
  /** Labels for `boolean` — [false, true]. */
  boolLabels?: [string, string];
  format?: (v: number) => string;
}

// --- Formatters ---------------------------------------------------------

const int = (v: number) => Math.round(v).toLocaleString();
const dec1 = (v: number) => v.toFixed(1);
const dec2 = (v: number) => v.toFixed(2);
/** A 0-1 share as a percentage. One decimal: the source's own second digit is
 *  noise (multi-mode counting, see the observed_* note in lib/types.ts). */
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const yen = (v: number) =>
  v >= 10000
    ? `¥${(v / 1000).toFixed(0)}k`
    : `¥${Math.round(v).toLocaleString()}`;

// --- The view layer: one question, on one geometry, at a time ------------

/**
 * A view is a question, not a geometry. Each one names the single layer that
 * carries colour while it is active; the other geometry is not drawn at all.
 *
 * That is the whole design rule. Colour is the scarce channel — hex fills and
 * street lines cannot both carry a measurement without turning into mud — so
 * exactly one layer competes for it, and only an explicit click changes which.
 * Zoom is navigation: it changes how legible a layer is, never which layer is
 * shown or what its colours mean.
 */
export type ViewGeometry = "areas" | "streets";

export type ViewGroupId = "areas" | "streets" | "network";

export interface ViewDef {
  id: string;
  label: string;
  /** The layer that carries colour. The other geometry stays off the map. */
  geometry: ViewGeometry;
  group: ViewGroupId;
  /** What the view answers, shown under the label once it is on. */
  hint: string;
  /** Appended to the legend while this view is active. */
  note?: string;
  metric: MetricDef;
}

export interface ViewGroup {
  id: ViewGroupId;
  title: string;
  caption: string;
}

export function viewGroups(t: Dict): ViewGroup[] {
  const g = t.metrics.viewGroups;
  return [
    { id: "areas", title: g.areas.title, caption: g.areas.caption },
    { id: "streets", title: g.streets.title, caption: g.streets.caption },
    { id: "network", title: g.network.title, caption: g.network.caption },
  ];
}

/**
 * The LTS classes in words, indexed 0-3 for LTS 1-4. The map legend, the route
 * legend and the Route Analysis panel's stacked bar all read these rather than
 * writing their own, so they cannot end up describing LTS 3 differently.
 */
export function ltsLabels(t: Dict): readonly string[] {
  return t.metrics.ltsLabels;
}

/**
 * The `<n> — <class>` form the LTS classes are listed in, in three places.
 *
 * `toLowerCase()` is a no-op on Japanese and does the sentence-casing English
 * wants, which is why it is applied here rather than baked into the dictionary:
 * the four class names are also shown capitalised, in the route panel's
 * tooltip, and one dictionary entry has to serve both.
 */
export function ltsBandLabel(t: Dict, lts: number): string {
  return `${lts} — ${t.metrics.ltsLabels[lts - 1].toLowerCase()}`;
}

/**
 * No variable appears twice. `stress_score` and `infra_quality_score` used to
 * sit here as area layers, but they are aggregates of the segment data, so
 * offering them alongside `lts` presented one measurement as two rival views.
 * They are panel rows now — see hexRoadSummary().
 */
export function views(t: Dict): ViewDef[] {
  const v = t.metrics.views;
  return [
    {
      id: "gap_score",
      label: v.gap_score.label,
      geometry: "areas",
      group: "areas",
      hint: v.gap_score.hint,
      note: v.gap_score.note,
      metric: {
        key: "gap_score",
        label: v.gap_score.label,
        scale: "diverging",
        format: dec2,
      },
    },
    {
      id: "potential_score",
      label: v.potential_score.label,
      geometry: "areas",
      group: "areas",
      hint: v.potential_score.hint,
      metric: {
        key: "potential_score",
        label: v.potential_score.label,
        scale: "sequential",
        format: dec2,
      },
    },
    /**
     * The only measured layer on the map. Everything else here is derived
     * from population, OSM tags and stated assumptions; this one is a count
     * of people, from the census, on the same 250m grid the population comes
     * on.
     *
     * It sits next to `potential_score` deliberately — the two answer "where
     * should cycling happen" and "where does it happen", and the interesting
     * places are where they disagree. Absent from the list entirely if the
     * field is missing, which is what a study area with no census mesh
     * downloaded looks like; an empty layer would read as "nobody cycles".
     */
    {
      id: "observed_bicycle_share",
      label: v.observed_bicycle_share.label,
      geometry: "areas",
      group: "areas",
      hint: v.observed_bicycle_share.hint,
      note: v.observed_bicycle_share.note,
      metric: {
        key: "observed_bicycle_share",
        label: v.observed_bicycle_share.label,
        scale: "sequential",
        format: pct,
      },
    },
    {
      id: "display_category",
      label: v.display_category.label,
      geometry: "streets",
      group: "streets",
      hint: v.display_category.hint,
      note: v.display_category.note,
      metric: {
        key: "display_category",
        label: v.display_category.label,
        scale: "nominal",
        domain: ["high", "moderate", "bottleneck", "low_priority"],
      },
    },
    {
      id: "lts",
      label: v.lts.label,
      geometry: "streets",
      group: "streets",
      hint: v.lts.hint,
      note: v.lts.note,
      metric: {
        key: "lts",
        label: v.lts.metricLabel,
        scale: "ordinal",
        domain: [1, 2, 3, 4],
        domainLabels: [1, 2, 3, 4].map((n) => ltsBandLabel(t, n)),
      },
    },
    {
      id: "infra_gap",
      label: v.infra_gap.label,
      geometry: "streets",
      group: "streets",
      hint: v.infra_gap.hint,
      metric: {
        key: "infra_gap",
        label: v.infra_gap.label,
        scale: "nominal",
        domain: ["low", "high"],
        domainLabels: [v.infra_gap.adequate, v.infra_gap.gap],
      },
    },
    {
      id: "island_id",
      label: v.island_id.label,
      geometry: "streets",
      group: "network",
      hint: v.island_id.hint,
      note: v.island_id.note,
      metric: {
        key: "island_id",
        label: v.island_id.metricLabel,
        scale: "nominal",
      },
    },
  ];
}

export function viewById(t: Dict): Map<string, ViewDef> {
  return new Map(views(t).map((v) => [v.id, v]));
}

/** The only view the bridge overlay says anything about. */
export const NETWORK_VIEW_ID = "island_id";

// --- Panel-only fields --------------------------------------------------

/**
 * The hex's own summary of the streets inside it. These are rollups of the
 * segment data, so as map layers they duplicated `lts` on a second geometry;
 * as panel rows they read as what they actually are.
 */
export function hexRoadSummary(t: Dict): MetricDef[] {
  const m = t.metrics.hexRoadSummary;
  return [
    {
      key: "stress_score",
      label: m.stress_score.label,
      scale: "sequential",
      hint: m.stress_score.hint,
      format: dec2,
    },
    {
      key: "infra_quality_score",
      label: m.infra_quality_score.label,
      scale: "sequential",
      hint: m.infra_quality_score.hint,
      format: dec2,
    },
  ];
}

/** The two halves of potential, shown as a breakdown rather than as layers. */
export function hexSubscores(t: Dict): MetricDef[] {
  const m = t.metrics.hexSubscores;
  return [
    {
      key: "production_score",
      label: m.production_score.label,
      scale: "sequential",
      hint: m.production_score.hint,
      format: dec2,
    },
    {
      key: "attraction_score",
      label: m.attraction_score.label,
      scale: "sequential",
      hint: m.attraction_score.hint,
      format: dec2,
    },
  ];
}

/**
 * The measured rows — the only ones on this panel that are.
 *
 * Rail share is here as **context, not as a model term**. It is by far the
 * strongest thing in the observed data (r = -0.65 against cycling) and the
 * potential index contains nothing corresponding to it, deliberately: putting
 * rail into the index would assert that proximity to a station reduces cycling
 * potential in general, when the evidence is about commuting only. Showing it
 * beside the scores lets a reader see "this is a rail-dominated area" and
 * discount accordingly, without the model claiming it. Same move Part F makes
 * with the context_hex_* fields.
 *
 * Empty when the census mesh has not been joined, which the panel treats as a
 * section to skip rather than a section of blanks.
 */
export function hexObserved(t: Dict): MetricDef[] {
  const m = t.metrics.hexObserved;
  return [
    {
      key: "observed_bicycle_share",
      label: m.observed_bicycle_share.label,
      scale: "sequential",
      hint: m.observed_bicycle_share.hint,
      format: pct,
    },
    {
      key: "observed_rail_share",
      label: m.observed_rail_share.label,
      scale: "sequential",
      hint: m.observed_rail_share.hint,
      format: pct,
    },
    {
      key: "observed_car_share",
      label: m.observed_car_share.label,
      scale: "sequential",
      hint: m.observed_car_share.hint,
      format: pct,
    },
    {
      key: "observed_commuters",
      label: m.observed_commuters.label,
      scale: "sequential",
      hint: m.observed_commuters.hint,
      format: int,
    },
  ];
}

export function hexInputs(t: Dict): MetricDef[] {
  const m = t.metrics.hexInputs;
  return [
    {
      key: "population",
      label: m.population,
      scale: "sequential",
      unit: t.units.people,
      format: int,
    },
    {
      key: "flat_terrain",
      label: m.flat_terrain.label,
      scale: "boolean",
      boolLabels: [m.flat_terrain.hilly, m.flat_terrain.flat],
    },
  ];
}

/** Destination counts behind the amenities toggle. */
export function hexAmenityCounts(t: Dict): MetricDef[] {
  const m = t.metrics.hexAmenityCounts;
  return [
    { key: "schools_nearby", label: m.schools_nearby, scale: "sequential", format: int },
    { key: "stations_nearby", label: m.stations_nearby, scale: "sequential", format: int },
    { key: "shops_nearby", label: m.shops_nearby, scale: "sequential", format: int },
  ];
}

/** Counts behind the bike facilities toggle. */
export function hexBikeCounts(t: Dict): MetricDef[] {
  const m = t.metrics.hexBikeCounts;
  return [
    { key: "bike_parking_nearby", label: m.bike_parking_nearby, scale: "sequential", format: int },
    { key: "bike_parking_capacity_nearby", label: m.bike_parking_capacity_nearby, scale: "sequential", format: int },
    { key: "bike_sharing_nearby", label: m.bike_sharing_nearby, scale: "sequential", format: int },
    { key: "bike_sharing_capacity_nearby", label: m.bike_sharing_capacity_nearby, scale: "sequential", format: int },
  ];
}

/**
 * The ROI card. Twelve overlapping money and emissions choropleths would be
 * unreadable, so these never reach the map — they are the two columns of a
 * selection-triggered report: what driving costs here now, and what shifting
 * a share of it to bikes would return.
 */
export function roiToday(t: Dict): MetricDef[] {
  const m = t.metrics.roiToday;
  const { perDay, kgPerDay } = t.units;
  return [
    { key: "roi_car_trips_per_day", label: m.roi_car_trips_per_day, scale: "sequential", unit: perDay, format: int },
    { key: "roi_congestion_cost_yen_day", label: m.roi_congestion_cost_yen_day, scale: "sequential", unit: perDay, format: yen },
    { key: "roi_operating_cost_yen_day", label: m.roi_operating_cost_yen_day, scale: "sequential", unit: perDay, format: yen },
    { key: "roi_emissions_kg_day", label: m.roi_emissions_kg_day, scale: "sequential", unit: kgPerDay, format: dec1 },
  ];
}

export function roiShifted(t: Dict): MetricDef[] {
  const m = t.metrics.roiShifted;
  const { perDay, kgPerDay, spaces } = t.units;
  return [
    { key: "roi_shifted_trips_per_day", label: m.roi_shifted_trips_per_day, scale: "sequential", unit: perDay, format: int },
    { key: "roi_congestion_savings_yen_day", label: m.roi_congestion_savings_yen_day, scale: "sequential", unit: perDay, format: yen },
    { key: "roi_operating_savings_yen_day", label: m.roi_operating_savings_yen_day, scale: "sequential", unit: perDay, format: yen },
    { key: "roi_emissions_avoided_kg_day", label: m.roi_emissions_avoided_kg_day, scale: "sequential", unit: kgPerDay, format: dec1 },
    { key: "roi_health_benefit_yen_day", label: m.roi_health_benefit_yen_day, scale: "sequential", unit: perDay, format: yen },
    { key: "roi_parking_spaces_freed", label: m.roi_parking_spaces_freed, scale: "sequential", unit: spaces, format: dec1 },
  ];
}

/** "Why is this specific 400 m red" — the raw inputs to the segment score. */
export function segmentInputs(t: Dict): MetricDef[] {
  const m = t.metrics.segmentInputs;
  const c = t.cyclewayTypes;
  return [
    { key: "speed_kmh", label: m.speed_kmh, scale: "sequential", unit: t.units.kmh, format: int },
    { key: "lanes_n", label: m.lanes_n, scale: "ordinal", domain: [1, 2, 3, 4, 5] },
    { key: "traffic_signals_count", label: m.traffic_signals_count, scale: "sequential", format: int },
    {
      key: "has_cycle_infra",
      label: m.has_cycle_infra.label,
      scale: "boolean",
      boolLabels: [m.has_cycle_infra.none, m.has_cycle_infra.present],
    },
    {
      key: "cycleway_type",
      label: m.cycleway_type.label,
      scale: "nominal",
      domain: ["dedicated", "shared_path", "on_road"],
      domainLabels: [c.dedicated, c.shared_path, c.on_road],
      hint: m.cycleway_type.hint,
    },
    {
      key: "sidewalk_available",
      label: m.sidewalk_available.label,
      scale: "boolean",
      boolLabels: [m.sidewalk_available.none, m.sidewalk_available.available],
    },
    {
      key: "likely_informal_parking",
      label: m.likely_informal_parking.label,
      scale: "boolean",
      boolLabels: [
        m.likely_informal_parking.unlikely,
        m.likely_informal_parking.likely,
      ],
      hint: m.likely_informal_parking.hint,
    },
    { key: "mean_slope_deg", label: m.mean_slope_deg, scale: "sequential", unit: t.units.degrees, format: dec1 },
    {
      key: "flat_terrain",
      label: m.flat_terrain.label,
      scale: "boolean",
      boolLabels: [m.flat_terrain.hilly, m.flat_terrain.flat],
    },
  ];
}

/** The proposal: what to build, what it costs, who benefits. */
export function segmentAction(t: Dict): MetricDef[] {
  const m = t.metrics.segmentAction;
  const i = t.interventions;
  const c = t.costTiers;
  return [
    {
      key: "recommendation",
      label: m.recommendation,
      scale: "nominal",
      domain: [
        "Missing link",
        "Protected cycle lane",
        "Traffic calming",
        "Crossing improvement",
      ],
      domainLabels: [
        i["Missing link"],
        i["Protected cycle lane"],
        i["Traffic calming"],
        i["Crossing improvement"],
      ],
    },
    {
      key: "cost_tier",
      label: m.cost_tier,
      scale: "ordinal",
      domain: ["Low", "Medium", "High"],
      domainLabels: [c.Low, c.Medium, c.High],
    },
    {
      key: "estimated_beneficiaries",
      label: m.estimated_beneficiaries,
      scale: "sequential",
      unit: t.units.people,
      format: int,
    },
  ];
}

/** Connectivity analysis — its own view, not another colour on the gap map. */
export function segmentNetwork(t: Dict): MetricDef[] {
  const m = t.metrics.segmentNetwork;
  return [
    {
      key: "network_criticality_score",
      label: m.network_criticality_score.label,
      scale: "sequential",
      unit: t.units.perHundred,
      hint: m.network_criticality_score.hint,
      format: int,
    },
    {
      key: "bridges_islands",
      label: m.bridges_islands,
      scale: "boolean",
      boolLabels: [t.common.no, t.common.yes],
    },
    {
      key: "islands_adjacent",
      label: m.islands_adjacent,
      scale: "ordinal",
      domain: [0, 1, 2, 3, 4, 5],
    },
    { key: "island_id", label: m.island_id, scale: "nominal" },
  ];
}

// --- Zoom -------------------------------------------------------------

/**
 * Zoom never decides what is on the map. These two thresholds only decide
 * when the legend *offers* the other geometry, one click away.
 *
 * They come from the geometry, not from taste. At Yokohama's latitude ground
 * resolution is 127,568 / 2^z m/px; an H3 res-9 hex is ~302 m across, so it
 * covers 78 px at z15 and 155 px at z16 — well past the point where a
 * choropleth is still reading as one. A 100 m segment is 6 px at z13 and 13 px
 * at z14, so below ~z12.5 the street network collapses into a mesh.
 */
export const STREET_DETAIL_ZOOM = 14.5;
export const AREA_DETAIL_ZOOM = 12.5;

/**
 * Format a raw property value for display, using the metric's own rules.
 *
 * `domainLabels` applies here as well as in the legend. It used to be read
 * only by buildScale, so a panel row on an ordinal or nominal field printed
 * the pipeline's raw enum — a segment's provision read "shared_path" rather
 * than "Shared with pedestrians". Labels a reader is shown should not depend
 * on whether the field is currently also a map layer. It is also what
 * translates the pipeline's closed vocabularies, so a `domain` without a
 * matching `domainLabels` now leaves an English enum inside a Japanese panel.
 */
export function formatValue(
  metric: MetricDef | undefined,
  value: unknown,
  /** For the `—` placeholder and the boolean fallback. */
  fallbacks: { noValue: string; no: string; yes: string } = {
    noValue: "—",
    no: "No",
    yes: "Yes",
  }
): string {
  if (value == null || value === "") return fallbacks.noValue;
  if (typeof value === "boolean") {
    const [no, yes] = metric?.boolLabels ?? [fallbacks.no, fallbacks.yes];
    return value ? yes : no;
  }

  const i = metric?.domain?.indexOf(value as string | number) ?? -1;
  const labelled = i >= 0 ? metric?.domainLabels?.[i] : undefined;
  if (labelled) return labelled;

  if (typeof value === "number") {
    const body = metric?.format ? metric.format(value) : String(value);
    return metric?.unit ? `${body}${metric.unit.startsWith("/") ? "" : " "}${metric.unit}` : body;
  }
  return String(value);
}
