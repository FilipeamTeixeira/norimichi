/**
 * Turns a metric plus the values actually present in the data into (a) a
 * MapLibre paint expression and (b) the legend that explains it.
 *
 * Breaks are computed from the loaded GeoJSON rather than hard-coded, so a
 * re-run of the pipeline with different numbers re-classes the map instead of
 * silently drifting out of range.
 *
 * Palettes come from the validated reference palette: one blue hue light->dark
 * for magnitude, blue<->red with a grey midpoint for the one signed variable,
 * and the first categorical slots (blue / orange / aqua / violet) for identity.
 * They were checked with the palette validator against the basemap surface —
 * see the colour comments below before substituting anything.
 */

import type { ExpressionSpecification } from "maplibre-gl";
import type { MetricDef } from "./metrics";
import { CATEGORY_COLORS } from "./types";
import type { DisplayCategory } from "./types";
import type { Dict } from "@/i18n/en";

/**
 * Continuous magnitude on the hex fills. The lightest step is deliberately
 * close to the basemap — a hex near zero should recede rather than shout.
 */
const SEQ_FILL = ["#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#0d366b"];

/**
 * Same hue, stepped darker for segment lines: a 2px line has far less area
 * than a hex, so the light end has to clear the basemap on its own.
 */
const SEQ_LINE = ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

/**
 * Blue <-> red for signed values only, with a pale *green* midpoint.
 *
 * The midpoint used to be #f0efec, an off-white grey. Against the OSM raster's
 * land colour (#f2efe9) that is dE 1.7 before opacity and ~1.1 after the hex
 * fill's own — below the threshold where anyone can see it. "Balanced" is the
 * modal class on `gap_score` (109 of 695 hexes, and the widest band of the
 * ramp), so the single most common answer the map gives was rendering as a
 * hole: the reader clicked a hex, got numbers, and saw no fill.
 *
 * Grey cannot be recovered by darkening it, because grey already means
 * something else here — NO_DATA is #d8d8d6, and a visible grey midpoint would
 * read as "no value" rather than "value, and it is zero". Green is the hue the
 * midpoint can afford: unclaimed on this ramp, and "balanced" is the one place
 * the diverging scale and CATEGORY_COLORS' green agree about what they mean.
 *
 * The light red arm moved with it (#f1aea8 -> #e89287). A light green next to
 * the old light red collapsed under deuteranopia — dE 13.8, where the grey it
 * replaced managed 21.6 — and deepening the red arm buys that back rather than
 * shipping a regression for the sake of a visible midpoint. Re-validated
 * against the basemap surface, all pairs: worst adjacent pair is 24.6 (deutan)
 * / 24.2 (protan) / 21.3 (tritan) / 30.9 normal, every one of them at or above
 * what this ramp had before. The midpoint now clears the basemap at dE 8.2
 * after opacity, and sits 15.0 from NO_DATA.
 */
const DIVERGING = ["#256abf", "#9ec5f4", "#c3e3cf", "#e89287", "#b13f3c"];

/**
 * LTS 1-4. Ordered, so it gets steadily darker and more saturated, but the hue
 * turns at the 2/3 step because that is a real break in the variable and not a
 * decoration: LTS 1-2 is the band most people will ride, LTS 3-4 is not, and
 * `infra_gap` thresholds on exactly that line. A single blue ramp put "anyone
 * can ride this" and "confident adults only" a shade apart.
 *
 * Blue<->red is also the safest two-hue axis under colour-vision deficiency,
 * and LTS 3 is amber rather than a second red so the 3/4 step reads as a step
 * rather than as two shades of the same alarm.
 *
 * The lightest step is *deliberately* faint. LTS 1 is the modal class by a wide
 * margin — most of a Japanese city is quiet residential street — and painted at
 * the same weight as everything else it merges into one blue mass that hides the
 * variable the map exists to show. It is not carrying its class on colour alone:
 * STRESS_WIDTH and STRESS_OPACITY below encode the same four values as width and
 * as alpha, so stress reads as three channels at once and the pale end is
 * recessive rather than illegible. That also means this ramp must stay labelled
 * — the legend entries are what make the faint end nameable.
 *
 * These four hexes are set from the design brief rather than from the palette
 * validator; they have not been re-checked against the CVD floors that the
 * previous ramp (#5b9fe8 / #1f5aa8 / #d9776f / #992f2c) was measured on.
 *
 * Exported because the Route Analysis page colours a trip by the same variable
 * on the same ramp. It is deliberately *not* the green/amber/red of
 * CATEGORY_COLORS: that ramp encodes `display_category`, which is an investment
 * judgement ("this bottleneck is worth money, that cul-de-sac is not") and says
 * nothing a rider can use about their own trip. One variable, one language —
 * the route line and the panel's stacked bar are the same four colours, so a
 * red stretch on the map is the same red bar in the breakdown.
 */
export const STRESS_LINE = ["#BFD8EC", "#4C86C5", "#E09A45", "#B43F3F"];

/**
 * `infra_gap`, which is nominal in the data ("low" / "high") but is not really
 * an identity: one of its two values is the finding. So it gets a named pair
 * rather than the first two categorical slots, which would have handed the
 * problem case (#eb6834) and the fine case (#2a78d6) equal weight.
 *
 * Blue for adequate and a warm red for the gap, at the same modest chroma as
 * STRESS_LINE and CATEGORY_COLORS: three street views that all mean "this is
 * the bit that needs work" should not each shout in a different register.
 */
export const GAP_COLORS = {
  low: "#5A8FC7",
  high: "#D96C4F",
} as const;

/** Categorical slots 1-4, in the order the palette fixes them. */
const NOMINAL = ["#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7"];

/** Two-state variables. Labelled in the legend, never colour alone. */
const BOOL_FALSE = "#eb6834";
const BOOL_TRUE = "#2a78d6";

/** Present but not one of the named identities. */
const OTHER = "#898781";
/** Value missing from the data entirely. */
export const NO_DATA = "#d8d8d6";

/**
 * The point layers. Four identities can appear at once (three amenity kinds
 * plus bike facilities) and every pair can end up side by side on a map, so
 * this set was checked against the all-pairs colour-vision floor. Adding a
 * fifth breaks it — which is why bike parking and sharing share one hue and
 * separate by fill vs ring instead.
 */
export const AMENITY_COLORS = {
  school: "#eb6834",
  station: "#4a3aa7",
  shop: "#1baf7a",
} as const;

export const BIKE_COLOR = "#2a78d6";

/** The proposal halo — deliberately not a step on any measurement ramp. */
export const RECOMMENDATION_COLOR = "#1baf7a";

/**
 * The existing cycling network. This is the fifth simultaneous identity on a
 * map the palette note above says holds four, so it earns its place by being
 * a different *mark*, not a fifth hue competing with the point layers: it is
 * drawn as a line, and the four it has to stay clear of are circles.
 *
 * Magenta because the four categorical slots are spoken for and this is the
 * furthest remaining hue from all of them in lightness as well as hue — which
 * matters, since magenta and the violet used for stations do converge under
 * deuteranopia. Being a line vs a point is what actually separates them there;
 * treat the hue as secondary and keep the legend labels.
 *
 * One colour for the whole overlay, exactly as the bike facilities toggle
 * does. The three kinds of provision are separated by dash pattern instead —
 * see CYCLEWAY_DASH in MapView. Ordered deliberately: solid reads as the most
 * complete provision, and the gaps in the dashes read as the compromise each
 * lesser kind actually is.
 */
export const CYCLEWAY_COLOR = "#b5379c";

/**
 * The selection glow — what marks the segment or corridor the reader is
 * currently looking at.
 *
 * Deliberately paler than every blue that carries data (STRESS_LINE's lightest
 * step is #5b9fe8, SEQ_LINE's is #6da7ec, BIKE_COLOR is #2a78d6). Selection is
 * not a measurement, so it should not read as one; combined with a wide,
 * blurred, semi-transparent stroke it reads as emphasis on the street rather
 * than as another value on a ramp.
 */
export const SELECTION_COLOR = "#8ec5f0";

/**
 * The two states of an access surface: a 250m cell whose residents can reach
 * the selected school or station on low-stress streets, and one whose
 * residents can only reach it by riding something above `calm_max_lts`.
 *
 * Two steps off STRESS_LINE rather than a new pair, and not for economy. The
 * surface *is* the LTS threshold, applied to areas instead of to lines: a cell
 * is calm exactly when a route to it exists within LTS 1-2, and severed when
 * the only routes run through LTS 3-4. Picking fresh hues would give the same
 * variable two visual languages depending on whether it was drawn as a street
 * or as a neighbourhood, and a reader moving between the Network tab and this
 * one would have to learn the break twice.
 *
 * The calm state is the ramp's second step rather than its first: the LTS 1
 * colour is deliberately near-invisible on the line layers, and at 0.42 opacity
 * across a 250m cell it would not clear the basemap at all.
 *
 * The severed state is the ramp's last step rather than its third, which is a
 * change forced by the new ramp: LTS 3 is now amber, and amber against blue
 * reads as a third state rather than as the other side of a break. Severed
 * means "LTS 3-4 only", so it takes the end of that half — the muted red is
 * calm enough at this size that the old reason for stepping in from the end
 * (the previous #992f2c was alarming across a whole cell) no longer applies.
 */
export const ACCESS_SURFACE = {
  calm: STRESS_LINE[1],
  severed: STRESS_LINE[3],
} as const;

/**
 * How solid those fills are. Low enough that the basemap's street pattern
 * still shows through — the reader has to be able to see *which* streets a
 * cell contains, or the surface is an abstract mosaic — and equal for both
 * states, because the comparison between them is the entire measurement.
 */
export const ACCESS_FILL_OPACITY = 0.42;

/** Sentinel below any real value, so `step` can route nulls to the no-data bucket. */
const NULL_SENTINEL = -1e9;

export interface LegendEntry {
  color: string;
  label: string;
  /**
   * `[on, off]` in line-width units, matching MapLibre's `line-dasharray`.
   * Set only where a layer distinguishes its categories by dash rather than
   * by hue — the existing-cycleway overlay is one colour across three kinds,
   * so the dash is the entire difference and the legend has to draw it.
   */
  dash?: [number, number];
}

export interface Scale {
  expression: ExpressionSpecification;
  entries: LegendEntry[];
  /** Set when some features have no value for this metric. */
  hasNoData: boolean;
}

type RawValue = string | number | boolean | null | undefined;

// --- Helpers ------------------------------------------------------------

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Class breaks for a continuous variable.
 *
 * Quantiles rather than equal intervals because most of these distributions are
 * heavily skewed — shops_nearby runs 0 to 771 with the bulk under 20, and equal
 * intervals would paint the entire study area the lightest class.
 */
function classBreaks(values: number[], classes: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const distinct = [...new Set(sorted)];

  // Few enough distinct values that every one can be its own class.
  if (distinct.length <= classes) return distinct;

  const breaks: number[] = [distinct[0]];
  for (let i = 1; i < classes; i++) {
    breaks.push(quantile(sorted, i / classes));
  }

  // Quantiles collapse when a value dominates (the zero-inflated ROI columns),
  // which would emit a `step` expression with non-ascending stops. Fall back to
  // equal intervals over the range, which always ascends.
  const deduped = [...new Set(breaks)];
  if (deduped.length < classes) {
    const min = distinct[0];
    const max = distinct[distinct.length - 1];
    if (max === min) return [min];
    return Array.from(
      { length: classes },
      (_, i) => min + ((max - min) * i) / classes
    );
  }
  return deduped;
}

function formatNumber(metric: MetricDef, v: number): string {
  return metric.format ? metric.format(v) : String(Math.round(v * 100) / 100);
}

function rangeLabel(metric: MetricDef, lo: number, hi: number | null): string {
  if (hi === null) return `≥ ${formatNumber(metric, lo)}`;
  if (lo === hi) return formatNumber(metric, lo);
  return `${formatNumber(metric, lo)} – ${formatNumber(metric, hi)}`;
}

// --- Scale builders -----------------------------------------------------

function sequentialScale(
  metric: MetricDef,
  values: RawValue[],
  ramp: string[],
  t: Dict
): Scale {
  const nums = values.filter((v): v is number => typeof v === "number");
  const hasNoData = nums.length < values.length;

  if (nums.length === 0) {
    return {
      expression: NO_DATA as unknown as ExpressionSpecification,
      entries: [{ color: NO_DATA, label: t.scales.noData }],
      hasNoData: true,
    };
  }

  const breaks = classBreaks(nums, ramp.length);
  const colors = ramp.slice(ramp.length - breaks.length); // keep the dark end

  // step(): output0 covers everything below the first stop, which is where the
  // null sentinel lands.
  const expr: unknown[] = [
    "step",
    ["coalesce", ["get", metric.key], NULL_SENTINEL],
    NO_DATA,
  ];
  breaks.forEach((b, i) => expr.push(b, colors[i]));

  const max = Math.max(...nums);
  const entries = breaks.map((b, i) => ({
    color: colors[i],
    label: rangeLabel(
      metric,
      b,
      i === breaks.length - 1 ? (b === max ? b : null) : breaks[i + 1]
    ),
  }));

  return {
    expression: expr as unknown as ExpressionSpecification,
    entries,
    hasNoData,
  };
}

/**
 * Symmetric around zero so that "no gap" always sits on the neutral midpoint
 * and the two signs stay comparable in width.
 */
function divergingScale(metric: MetricDef, values: RawValue[], t: Dict): Scale {
  const nums = values.filter((v): v is number => typeof v === "number");
  const hasNoData = nums.length < values.length;

  if (nums.length === 0) {
    return {
      expression: NO_DATA as unknown as ExpressionSpecification,
      entries: [{ color: NO_DATA, label: t.scales.noData }],
      hasNoData: true,
    };
  }

  // A flat all-zero column would produce five identical stops, and `step`
  // requires strictly ascending ones — MapLibre throws rather than degrading.
  const extent = Math.max(...nums.map(Math.abs)) || 1;
  const half = extent / 2;
  const breaks = [-extent, -half, -half / 3, half / 3, half];

  const expr: unknown[] = [
    "step",
    ["coalesce", ["get", metric.key], NULL_SENTINEL],
    NO_DATA,
  ];
  breaks.forEach((b, i) => expr.push(b, DIVERGING[i]));

  const entries: LegendEntry[] = [
    { color: DIVERGING[0], label: t.scales.wellServed(formatNumber(metric, -half)) },
    { color: DIVERGING[1], label: t.scales.slightlyAhead },
    { color: DIVERGING[2], label: t.scales.balanced },
    { color: DIVERGING[3], label: t.scales.slightlyUnderserved },
    { color: DIVERGING[4], label: t.scales.underserved(formatNumber(metric, half)) },
  ];

  return {
    expression: expr as unknown as ExpressionSpecification,
    entries,
    hasNoData,
  };
}

function booleanScale(metric: MetricDef, values: RawValue[], t: Dict): Scale {
  const [noLabel, yesLabel] = metric.boolLabels ?? [t.common.no, t.common.yes];
  const hasNoData = values.some((v) => v == null);

  // to-string keeps null out of the comparison: it becomes "" and falls through
  // to the fallback rather than erroring on a type mismatch.
  const expr = [
    "match",
    ["to-string", ["get", metric.key]],
    "true",
    BOOL_TRUE,
    "false",
    BOOL_FALSE,
    NO_DATA,
  ] as unknown as ExpressionSpecification;

  return {
    expression: expr,
    entries: [
      { color: BOOL_TRUE, label: yesLabel },
      { color: BOOL_FALSE, label: noLabel },
    ],
    hasNoData,
  };
}

/** Ordered short domains — LTS 1-4, cost tier, lane count. */
function ordinalScale(metric: MetricDef, values: RawValue[]): Scale {
  const domain = metric.domain ?? [];
  const hasNoData = values.some((v) => v == null);

  // Spread the ramp across however many steps the domain has, always keeping
  // both ends so the extremes stay maximally separated.
  const ramp = metric.key === "lts" ? STRESS_LINE : SEQ_LINE;
  const colors = domain.map((_, i) =>
    domain.length === 1
      ? ramp[ramp.length - 1]
      : ramp[Math.round((i / (domain.length - 1)) * (ramp.length - 1))]
  );

  const numeric = domain.every((d) => typeof d === "number");

  const expr = numeric
    ? (() => {
        const e: unknown[] = [
          "step",
          ["coalesce", ["get", metric.key], NULL_SENTINEL],
          NO_DATA,
        ];
        (domain as number[]).forEach((d, i) => e.push(d, colors[i]));
        return e;
      })()
    : (() => {
        const e: unknown[] = ["match", ["to-string", ["get", metric.key]]];
        domain.forEach((d, i) => e.push(String(d), colors[i]));
        e.push(NO_DATA);
        return e;
      })();

  return {
    expression: expr as unknown as ExpressionSpecification,
    entries: domain.map((d, i) => ({
      color: colors[i],
      label: metric.domainLabels?.[i] ?? String(d),
    })),
    hasNoData,
  };
}

/**
 * Unordered identities. A fixed domain gets the categorical slots in order; an
 * open-ended one (island_id, which runs to 99) shows the largest few and folds
 * the rest into "Other" rather than cycling hues, which would make unrelated
 * groups look related.
 */
function nominalScale(metric: MetricDef, values: RawValue[], t: Dict): Scale {
  const hasNoData = values.some((v) => v == null);

  // display_category keeps the project's established semantic colours: green
  // reads as fine, red as the strategic bottleneck the whole analysis is for.
  if (metric.key === "display_category") {
    const domain = (metric.domain ?? []) as DisplayCategory[];
    const expr: unknown[] = ["match", ["to-string", ["get", metric.key]]];
    domain.forEach((d) => expr.push(d, CATEGORY_COLORS[d]));
    expr.push(NO_DATA);
    return {
      expression: expr as unknown as ExpressionSpecification,
      entries: domain.map((d) => ({
        color: CATEGORY_COLORS[d],
        label: t.categories[d],
      })),
      hasNoData,
    };
  }

  // infra_gap is the same shape: a fixed two-value domain whose colours mean
  // something, rather than an open set of identities.
  if (metric.key === "infra_gap") {
    const domain = (metric.domain ?? []).map(String) as ("low" | "high")[];
    const expr: unknown[] = ["match", ["to-string", ["get", metric.key]]];
    domain.forEach((d) => expr.push(d, GAP_COLORS[d]));
    expr.push(NO_DATA);
    return {
      expression: expr as unknown as ExpressionSpecification,
      entries: domain.map((d, i) => ({
        color: GAP_COLORS[d],
        label: metric.domainLabels?.[i] ?? d,
      })),
      hasNoData,
    };
  }

  let domain = metric.domain?.map(String);
  let foldedRest = false;

  if (!domain) {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (v == null) continue;
      const k = String(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const ordered = [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    // Three is the number of categorical slots that stay distinguishable under
    // colour-vision deficiency when every pair can appear side by side, which
    // is exactly the case on a map.
    domain = ordered.slice(0, 3);
    foldedRest = ordered.length > domain.length;
  }

  const colors = domain.map((_, i) => NOMINAL[i % NOMINAL.length]);

  const expr: unknown[] = ["match", ["to-string", ["get", metric.key]]];
  domain.forEach((d, i) => expr.push(d, colors[i]));
  expr.push(foldedRest ? OTHER : NO_DATA);

  const entries = domain.map((d, i) => ({
    color: colors[i],
    label:
      metric.domainLabels?.[i] ??
      (metric.key === "island_id" ? t.scales.island(d) : d),
  }));
  if (foldedRest) entries.push({ color: OTHER, label: t.scales.otherIslands });

  return {
    expression: expr as unknown as ExpressionSpecification,
    entries,
    hasNoData,
  };
}

// --- Entry point --------------------------------------------------------

/**
 * @param target `fill` uses the lighter ramp (large areas), `line` the darker
 *   one (thin marks need to clear the basemap on their own).
 */
export function buildScale(
  metric: MetricDef,
  values: RawValue[],
  target: "fill" | "line",
  t: Dict
): Scale {
  switch (metric.scale) {
    case "diverging":
      return divergingScale(metric, values, t);
    case "boolean":
      return booleanScale(metric, values, t);
    case "ordinal":
      return ordinalScale(metric, values);
    case "nominal":
      return nominalScale(metric, values, t);
    case "sequential":
    default:
      return sequentialScale(
        metric,
        values,
        target === "fill" ? SEQ_FILL : SEQ_LINE,
        t
      );
  }
}

/** Pull one property out of every feature, for the scale builder. */
export function collectValues(
  features: { properties: Record<string, unknown> | null }[] | undefined,
  key: string
): RawValue[] {
  if (!features) return [];
  return features.map((f) => (f.properties?.[key] ?? null) as RawValue);
}
