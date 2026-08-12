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
 */

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

export const VIEW_GROUPS: {
  id: ViewGroupId;
  title: string;
  caption: string;
}[] = [
  {
    id: "areas",
    title: "Areas",
    caption: "Per neighbourhood hexagon — quantities that only exist over an area.",
  },
  {
    id: "streets",
    title: "Streets",
    caption: "Per road segment. Zoom changes how legible these are, never which is shown.",
  },
  {
    id: "network",
    title: "Connectivity",
    caption: "Identities rather than measurements — which calm routes are cut off from which.",
  },
];

/**
 * The LTS classes in words, indexed 0-3 for LTS 1-4. The map legend below and
 * the Route Analysis panel's stacked bar both read these rather than writing
 * their own, so the two cannot end up describing LTS 3 differently.
 */
export const LTS_LABELS = [
  "Comfortable for anyone",
  "Most adults",
  "Confident riders only",
  "Hostile",
] as const;

/**
 * No variable appears twice. `stress_score` and `infra_quality_score` used to
 * sit here as area layers, but they are aggregates of the segment data, so
 * offering them alongside `lts` presented one measurement as two rival views.
 * They are panel rows now — see HEX_ROAD_SUMMARY.
 */
export const VIEWS: ViewDef[] = [
  {
    id: "gap_score",
    label: "Demand / supply gap",
    geometry: "areas",
    group: "areas",
    hint: "Demand minus infrastructure quality. Positive means people want to cycle here and can't.",
    metric: {
      key: "gap_score",
      label: "Demand / supply gap",
      scale: "diverging",
      format: dec2,
    },
  },
  {
    id: "demand_score",
    label: "Cycling demand",
    geometry: "areas",
    group: "areas",
    hint: "Trips this area should generate and attract, before asking whether the roads allow it.",
    metric: {
      key: "demand_score",
      label: "Cycling demand",
      scale: "sequential",
      format: dec2,
    },
  },
  {
    id: "display_category",
    label: "Where to invest",
    geometry: "streets",
    group: "streets",
    hint: "The pipeline's own classification: suitability band, upgraded to 'bottleneck' where the network analysis says the segment unlocks connectivity.",
    note: "Red marks a strategic bottleneck — upgrading it would connect otherwise-separated calm areas — not necessarily an unsafe road.",
    metric: {
      key: "display_category",
      label: "Where to invest",
      scale: "nominal",
      domain: ["high", "moderate", "bottleneck", "low_priority"],
    },
  },
  {
    id: "lts",
    label: "Traffic stress",
    geometry: "streets",
    group: "streets",
    hint: "1 = comfortable for anyone, 4 = hostile to all but the confident.",
    note: "Blue turns to red at the LTS 2/3 break — the point where a road stops being usable by most people.",
    metric: {
      key: "lts",
      label: "Level of traffic stress",
      scale: "ordinal",
      domain: [1, 2, 3, 4],
      domainLabels: LTS_LABELS.map((l, i) => `${i + 1} — ${l.toLowerCase()}`),
    },
  },
  {
    id: "infra_gap",
    label: "Infrastructure gap",
    geometry: "streets",
    group: "streets",
    hint: "High wherever traffic stress reaches LTS 3 or above — the coarse view of the stress score.",
    metric: {
      key: "infra_gap",
      label: "Infrastructure gap",
      scale: "nominal",
      domain: ["low", "high"],
      domainLabels: ["Adequate", "Gap"],
    },
  },
  {
    id: "island_id",
    label: "Disconnected networks",
    geometry: "streets",
    group: "network",
    hint: "Each colour is one cluster of low-stress streets that connect to each other but not to the next cluster.",
    note: "Dashed black marks the specific links that would join two clusters into one network.",
    metric: {
      key: "island_id",
      label: "Safe network",
      scale: "nominal",
    },
  },
];

export const VIEW_BY_ID = new Map(VIEWS.map((v) => [v.id, v]));

/** The only view the bridge overlay says anything about. */
export const NETWORK_VIEW_ID = "island_id";

// --- Panel-only fields --------------------------------------------------

/**
 * The hex's own summary of the streets inside it. These are rollups of the
 * segment data, so as map layers they duplicated `lts` on a second geometry;
 * as panel rows they read as what they actually are.
 */
export const HEX_ROAD_SUMMARY: MetricDef[] = [
  {
    key: "stress_score",
    label: "Mean traffic stress",
    scale: "sequential",
    hint: "Mean level of traffic stress across the roads in the hex (1 calm – 4 hostile).",
    format: dec2,
  },
  {
    key: "infra_quality_score",
    label: "Infrastructure quality",
    scale: "sequential",
    hint: "Share of the hex's road length that is actually comfortable to cycle.",
    format: dec2,
  },
];

/** The two halves of demand, shown as a breakdown rather than as layers. */
export const HEX_SUBSCORES: MetricDef[] = [
  {
    key: "production_score",
    label: "Production",
    scale: "sequential",
    hint: "Trip-generating potential — people starting journeys here.",
    format: dec2,
  },
  {
    key: "attraction_score",
    label: "Attraction",
    scale: "sequential",
    hint: "Trip-drawing potential — shops, schools and stations pulling journeys in.",
    format: dec2,
  },
];

export const HEX_INPUTS: MetricDef[] = [
  { key: "population", label: "Population", scale: "sequential", unit: "people", format: int },
  {
    key: "flat_terrain",
    label: "Flat terrain",
    scale: "boolean",
    boolLabels: ["Hilly", "Flat"],
  },
];

/** Destination counts behind the amenities toggle. */
export const HEX_AMENITY_COUNTS: MetricDef[] = [
  { key: "schools_nearby", label: "Schools", scale: "sequential", format: int },
  { key: "stations_nearby", label: "Stations", scale: "sequential", format: int },
  { key: "shops_nearby", label: "Shops & restaurants", scale: "sequential", format: int },
];

/** Counts behind the bike facilities toggle. */
export const HEX_BIKE_COUNTS: MetricDef[] = [
  { key: "bike_parking_nearby", label: "Parking sites", scale: "sequential", format: int },
  { key: "bike_parking_capacity_nearby", label: "Parking spaces", scale: "sequential", format: int },
  { key: "bike_sharing_nearby", label: "Sharing docks", scale: "sequential", format: int },
  { key: "bike_sharing_capacity_nearby", label: "Sharing capacity", scale: "sequential", format: int },
];

/**
 * The ROI card. Twelve overlapping money and emissions choropleths would be
 * unreadable, so these never reach the map — they are the two columns of a
 * selection-triggered report: what driving costs here now, and what shifting
 * a share of it to bikes would return.
 */
export const ROI_TODAY: MetricDef[] = [
  { key: "roi_car_trips_per_day", label: "Car trips", scale: "sequential", unit: "/day", format: int },
  { key: "roi_congestion_cost_yen_day", label: "Congestion cost", scale: "sequential", unit: "/day", format: yen },
  { key: "roi_operating_cost_yen_day", label: "Operating cost", scale: "sequential", unit: "/day", format: yen },
  { key: "roi_emissions_kg_day", label: "CO₂ emitted", scale: "sequential", unit: "kg/day", format: dec1 },
];

export const ROI_SHIFTED: MetricDef[] = [
  { key: "roi_shifted_trips_per_day", label: "Trips shifted", scale: "sequential", unit: "/day", format: int },
  { key: "roi_congestion_savings_yen_day", label: "Congestion saved", scale: "sequential", unit: "/day", format: yen },
  { key: "roi_operating_savings_yen_day", label: "Operating saved", scale: "sequential", unit: "/day", format: yen },
  { key: "roi_emissions_avoided_kg_day", label: "CO₂ avoided", scale: "sequential", unit: "kg/day", format: dec1 },
  { key: "roi_health_benefit_yen_day", label: "Health benefit", scale: "sequential", unit: "/day", format: yen },
  { key: "roi_parking_spaces_freed", label: "Parking freed", scale: "sequential", unit: "spaces", format: dec1 },
];

/** "Why is this specific 400 m red" — the raw inputs to the segment score. */
export const SEGMENT_INPUTS: MetricDef[] = [
  { key: "speed_kmh", label: "Speed limit", scale: "sequential", unit: "km/h", format: int },
  { key: "lanes_n", label: "Lanes", scale: "ordinal", domain: [1, 2, 3, 4, 5] },
  { key: "traffic_signals_count", label: "Traffic signals", scale: "sequential", format: int },
  {
    key: "has_cycle_infra",
    label: "Cycle infrastructure",
    scale: "boolean",
    boolLabels: ["None", "Present"],
  },
  {
    key: "cycleway_type",
    label: "Existing provision",
    scale: "nominal",
    domain: ["dedicated", "shared_path", "on_road"],
    domainLabels: [
      "Dedicated cycleway",
      "Shared with pedestrians",
      "On-road lane",
    ],
    hint: "What is already built here. Shared paths are the common Japanese 自転車歩行者道 — legal provision, but shared with people on foot.",
  },
  {
    key: "sidewalk_available",
    label: "Sidewalk fallback",
    scale: "boolean",
    boolLabels: ["None", "Available"],
  },
  {
    key: "likely_informal_parking",
    label: "Informal parking",
    scale: "boolean",
    boolLabels: ["Unlikely", "Likely"],
    hint: "Kerbside parking that pushes riders into traffic — often the deciding factor in the stress score.",
  },
  { key: "mean_slope_deg", label: "Mean slope", scale: "sequential", unit: "°", format: dec1 },
  {
    key: "flat_terrain",
    label: "Flat terrain",
    scale: "boolean",
    boolLabels: ["Hilly", "Flat"],
  },
];

/** The proposal: what to build, what it costs, who benefits. */
export const SEGMENT_ACTION: MetricDef[] = [
  {
    key: "recommendation",
    label: "Intervention",
    scale: "nominal",
    domain: [
      "Missing link",
      "Protected cycle lane",
      "Traffic calming",
      "Crossing improvement",
    ],
  },
  { key: "cost_tier", label: "Cost tier", scale: "ordinal", domain: ["Low", "Medium", "High"] },
  {
    key: "estimated_beneficiaries",
    label: "Residents within 500 m",
    scale: "sequential",
    unit: "people",
    format: int,
  },
];

/** Connectivity analysis — its own view, not another colour on the gap map. */
export const SEGMENT_NETWORK: MetricDef[] = [
  {
    key: "network_criticality_score",
    label: "Network criticality",
    scale: "sequential",
    unit: "/ 100",
    hint: "How much connectivity the network gains if this segment is upgraded. Best used to rank, not to colour.",
    format: int,
  },
  {
    key: "bridges_islands",
    label: "Bridges two networks",
    scale: "boolean",
    boolLabels: ["No", "Yes"],
  },
  {
    key: "islands_adjacent",
    label: "Adjacent safe networks",
    scale: "ordinal",
    domain: [0, 1, 2, 3, 4, 5],
  },
  { key: "island_id", label: "Safe network", scale: "nominal" },
];

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
 * on whether the field is currently also a map layer.
 */
export function formatValue(
  metric: MetricDef | undefined,
  value: unknown
): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") {
    const [no, yes] = metric?.boolLabels ?? ["No", "Yes"];
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
