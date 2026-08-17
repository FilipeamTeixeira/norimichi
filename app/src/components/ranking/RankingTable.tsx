"use client";

import { useMemo, useState } from "react";
import type { CorridorProperties, InterventionType } from "@/lib/types";
import { corridorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type { Dict } from "@/i18n/en";

/**
 * The five intervention labels, in the order the design's sidebar lists them.
 * Matched against `recommendation` directly — the pipeline emits exactly these
 * strings (pipeline/R/score_intervention.R), which is the whole reason the
 * recommendation is a typed category rather than free text.
 *
 * "Bike parking" is listed because it is part of the vocabulary, but no
 * corridor can carry it: parking is a point facility, not a stretch of street.
 * It renders as a disabled chip rather than being hidden, so the filter does
 * not silently disagree with the design it implements.
 */
const INTERVENTION_TYPES: InterventionType[] = [
  "Protected cycle lane",
  "Missing link",
  "Traffic calming",
  "Crossing improvement",
  "Bike parking",
];

/**
 * Shortest corridor for which a per-kilometre rate is worth showing. Below
 * this the rate is dominated by the length rather than the street: the two
 * shortest crossing corridors here are a 59m stub and a 34m bridge, whose two
 * junctions each work out at 33.9 and 58.6 stops/km — arithmetic, not a ride.
 * Every corridor from 182m up lands in a sane 8–17 stops/km, so this cuts
 * exactly the degenerate tail. The junction count is still shown at any
 * length; that one is a plain fact.
 */
const RATE_MEANINGFUL_ABOVE_M = 150;

/**
 * Shortest corridor listed by default. Deliberately the same number as
 * RATE_MEANINGFUL_ABOVE_M, because it is the same observation twice: below
 * ~150m a row stops describing a street and starts describing where OSM
 * happened to cut one. Two thirds of the corridors under it are a single
 * segment, against a median recommended OSM way of 119m.
 *
 * It also corrects a ranking distortion rather than only tidying the list.
 * Build cost scales with length but `estimated_beneficiaries` barely does —
 * it comes from a 500m buffer, so in Tokyo the median sub-100m corridor still
 * claims 15,053 residents against 28,924 for one over 500m. Half the benefit
 * at a tenth of the cost puts fragments at the top of a payback sort: the best
 * payback in Tokyo currently belongs to a 47m corridor.
 *
 * This is a *display* threshold and the pipeline does not apply it — the map,
 * the exported segment table and the programme ledger all keep the full 795km,
 * because hiding a row from a funding table is not the same as claiming the
 * street is not there. The pipeline's own floor is MIN_CORRIDOR_LENGTH_M in
 * pipeline/R/build_corridors.R, which is 10m and answers a different question:
 * whether the row is real at all.
 */
const MIN_FUNDABLE_LENGTH_M = 150;

/**
 * Whether a corridor is listed at the default length filter. Not a bare
 * length test: two kinds of short corridor are the point rather than the
 * noise, and cutting them would delete findings the pipeline exists to
 * produce.
 */
function isFundableLength(c: CorridorProperties): boolean {
  return (
    c.length_m >= MIN_FUNDABLE_LENGTH_M ||
    // A short link joining two low-stress islands is the cheapest high-value
    // row in the table — exactly what score_network.R is for.
    c.bridges_islands ||
    // Length is not the unit of work for a point intervention.
    c.recommendation === "Crossing improvement"
  );
}

const TYPE_COLORS: Record<InterventionType, string> = {
  "Protected cycle lane": "#1baf7a",
  "Missing link": "#ef4444",
  "Traffic calming": "#f59e0b",
  "Crossing improvement": "#6366f1",
  "Bike parking": "#9ca3af",
};

type SortKey =
  | "gap"
  | "beneficiaries"
  | "after"
  | "length"
  | "build"
  | "payback"
  | "lts"
  | "savings";

interface Column {
  key: SortKey;
  label: string;
  /** Marks a column describing the neighbourhood, not the corridor. */
  context?: boolean;
  help?: string;
}

/**
 * Order and which two are context; the words come from the dictionary.
 *
 * `build` replaced the old cost-*tier* column rather than joining it. The two
 * answer different questions — tier is how disruptive a scheme is, yen is how
 * much money — but a funding table wants the money, and showing both invites
 * "why does this Low-tier corridor cost more than that Medium one?" (answer:
 * it is four times as long). The tier is still in the data and in the
 * glossary; it is what escalates the per-metre rate behind this column.
 */
const COLUMN_KEYS: { key: SortKey; context?: boolean }[] = [
  { key: "lts" },
  { key: "after" },
  { key: "beneficiaries" },
  { key: "length" },
  { key: "build" },
  { key: "payback" },
  { key: "gap", context: true },
  { key: "savings", context: true },
];

function columns(t: Dict): Column[] {
  return COLUMN_KEYS.map(({ key, context }) => ({
    key,
    context,
    label: t.ranking.table.columns[key].label,
    help: t.ranking.table.columns[key].help || undefined,
  }));
}

function formatLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/**
 * The after-score cell — the one place the `benefit_kind` contract is enforced
 * in the UI.
 *
 * A `not_modelled` corridor gets **N/A**, never a number and never an arrow,
 * because the traffic-stress score has no input corresponding to its
 * intervention. It gets a real, differently-shaped benefit statement beneath
 * instead. Showing "33 → 100" here for a crossing improvement — which an
 * earlier version of the pipeline did compute — would be reporting the effect
 * of building a cycle lane nobody proposed.
 */
function AfterCell({ c }: { c: CorridorProperties }) {
  const t = useT();
  const tt = t.ranking.table;

  if (c.benefit_kind === "lts_recalc" && c.suitability_after !== null) {
    const gain = c.suitability_after - c.suitability_before;
    return (
      <div className="flex items-baseline justify-end gap-1.5 tabular-nums">
        <span className="text-neutral-300 text-[11px]">
          {Math.round(c.suitability_before)}→
        </span>
        <span className="font-medium text-neutral-900">
          {Math.round(c.suitability_after)}
        </span>
        <span className="text-[11px] text-emerald-600">+{Math.round(gain)}</span>
      </div>
    );
  }

  const alt =
    c.recommendation === "Crossing improvement"
      ? `${tt.junctions(c.signalised_junctions)}${
          // The rate is only worth printing on a corridor long enough for a
          // per-km figure to describe a ride. Two junctions on a 34m bridge is
          // 58.6/km, which is true and tells the reader nothing.
          c.length_m >= RATE_MEANINGFUL_ABOVE_M
            ? ` · ${tt.stopsPerKm(c.signals_per_km.toFixed(1))}`
            : ""
        }`
      : c.informal_parking_length_m > 0
        ? tt.kerbsidePressure(formatLength(c.informal_parking_length_m))
        : null;

  return (
    <div className="text-right">
      <span
        className="text-neutral-400 cursor-help border-b border-dotted border-neutral-300"
        title={tt.naHelp(c.intervention_lever)}
      >
        {t.panels.segment.proposal.na}
      </span>
      {alt && (
        <div className="text-[10px] text-neutral-400 mt-0.5 leading-tight">
          {alt}
        </div>
      )}
    </div>
  );
}

/**
 * A low-to-high range, or an em dash where there is nothing to show.
 *
 * Always both ends, never a midpoint. The unit costs behind these are
 * illustrative placeholders (pipeline/R/score_cost.R), and collapsing the
 * range to one number is exactly the move that would turn a stated
 * uncertainty into an apparent quotation. Where the two ends round to the
 * same string it prints once rather than "¥40M–¥40M".
 */
function RangeCell({
  low,
  high,
  format,
  title,
}: {
  low: number | null;
  high: number | null;
  format: (v: number) => string;
  title?: string;
}) {
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high)) {
    return <span className="text-neutral-300">—</span>;
  }
  const a = format(low);
  const b = format(high);
  return (
    <span title={title} className={title ? "cursor-help" : undefined}>
      {a === b ? a : `${a}–${b}`}
    </span>
  );
}

interface Props {
  corridors: CorridorProperties[];
  /** Row click — F.6 hands the corridor to the Network tab. */
  onSelect: (c: CorridorProperties) => void;
}

export default function RankingTable({ corridors, onSelect }: Props) {
  const t = useT();
  const tt = t.ranking.table;
  const [types, setTypes] = useState<Set<InterventionType>>(new Set());
  /**
   * Default: the enclosing hex's gap score, descending — the number the whole
   * project is built around. Note what that means: it is a *neighbourhood*
   * property, so corridors in the same cell tie exactly and a corridor's own
   * size or benefit does not affect its rank. Beneficiaries break the tie so
   * the order within a cell is at least meaningful rather than arbitrary.
   */
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  /** See MIN_FUNDABLE_LENGTH_M. Off by default; the count is always stated. */
  const [showShort, setShowShort] = useState(false);

  const cols = useMemo(() => columns(t), [t]);

  const availableTypes = useMemo(() => {
    const present = new Set<string>();
    corridors.forEach((c) => present.add(c.recommendation));
    return present;
  }, [corridors]);

  const rows = useMemo(() => {
    const byType =
      types.size === 0
        ? corridors
        : corridors.filter((c) => types.has(c.recommendation));
    const filtered = showShort ? byType : byType.filter(isFundableLength);

    const value = (c: CorridorProperties): number | null => {
      switch (sortKey) {
        case "gap":
          return c.context_hex_gap_score;
        case "savings":
          return c.context_hex_daily_savings_yen;
        case "beneficiaries":
          return c.estimated_beneficiaries;
        case "length":
          return c.length_m;
        case "lts":
          return c.lts_before;
        case "build":
          // The low end of the range. Sorting on a midpoint would invent a
          // point estimate the data deliberately refuses to state.
          return c.cost_yen_low;
        case "payback":
          return c.payback_years_low;
        case "after":
          // Corridors with no modelled after-score have no value to rank on.
          // They sort last in either direction rather than being silently
          // treated as zero-benefit projects.
          return c.suitability_after;
      }
    };

    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va !== vb) return (va - vb) * sortDir;
      // Stable, meaningful tiebreak — matters most for the default sort, where
      // every corridor in one hex carries an identical gap score.
      return b.estimated_beneficiaries - a.estimated_beneficiaries;
    });
  }, [corridors, types, sortKey, sortDir, showShort]);

  /**
   * How many rows the length filter is holding back, counted inside whatever
   * intervention filter is active so the number matches the table above it.
   */
  const shortHidden = useMemo(() => {
    const byType =
      types.size === 0
        ? corridors
        : corridors.filter((c) => types.has(c.recommendation));
    return byType.length - byType.filter(isFundableLength).length;
  }, [corridors, types]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };

  const toggleType = (t: InterventionType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const totalKm = rows.reduce((s, c) => s + c.length_m, 0) / 1000;
  const unmodelled = rows.filter((c) => c.benefit_kind !== "lts_recalc").length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mr-1.5">
          {tt.interventionFilter}
        </span>
        {INTERVENTION_TYPES.map((type) => {
          const on = types.has(type);
          const available = availableTypes.has(type);
          return (
            <button
              key={type}
              disabled={!available}
              onClick={() => toggleType(type)}
              title={available ? undefined : tt.unavailableType}
              className={cn(
                "text-[12px] px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5",
                !available && "opacity-40 cursor-not-allowed",
                on
                  ? "bg-neutral-900 border-neutral-900 text-white"
                  : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300"
              )}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_COLORS[type] }}
              />
              {t.interventions[type]}
            </button>
          );
        })}
        {types.size > 0 && (
          <button
            onClick={() => setTypes(new Set())}
            className="text-[12px] text-neutral-400 hover:text-neutral-700 ml-1"
          >
            {t.common.clear}
          </button>
        )}
      </div>

      {/* Outside the empty-table branch on purpose: a length filter strict
          enough to empty the table must still be visible and reversible. */}
      {shortHidden > 0 && (
        <p className="text-[12px] text-neutral-400 mb-2.5 tabular-nums">
          {showShort
            ? tt.shortShown(shortHidden, MIN_FUNDABLE_LENGTH_M)
            : tt.shortHidden(shortHidden, MIN_FUNDABLE_LENGTH_M)}{" "}
          <button
            onClick={() => setShowShort((v) => !v)}
            className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
          >
            {showShort ? tt.shortHide : tt.shortShow}
          </button>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">{tt.noMatch}</p>
      ) : (
        <>
          <p className="text-[12px] text-neutral-400 mb-2.5 tabular-nums">
            {tt.summary(rows.length, totalKm.toFixed(1))}
          </p>

          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-left w-10">
                    #
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-left">
                    {tt.project}
                  </th>
                  {cols.map((col) => {
                    const active = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-right whitespace-nowrap",
                          col.context ? "text-neutral-300" : "text-neutral-400"
                        )}
                      >
                        <button
                          onClick={() => onSort(col.key)}
                          title={col.help}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-neutral-700 transition-colors uppercase",
                            active && "text-neutral-900"
                          )}
                        >
                          {col.label}
                          {col.context && (
                            <span className="normal-case text-[10px] text-neutral-300">
                              {tt.context}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[9px]",
                              active ? "opacity-100" : "opacity-0"
                            )}
                          >
                            {sortDir === -1 ? "▼" : "▲"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {rows.slice(0, 100).map((c, i) => (
                  <tr
                    key={c.corridor_id}
                    onClick={() => onSelect(c)}
                    className="hover:bg-neutral-50 transition-colors align-top cursor-pointer"
                  >
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="text-[13px] text-neutral-900 leading-snug">
                        {corridorLabel(c, t)}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ color: TYPE_COLORS[c.recommendation] }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: TYPE_COLORS[c.recommendation],
                            }}
                          />
                          {t.interventions[c.recommendation]}
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span>{tt.segments(c.segment_count)}</span>
                        {c.bridges_islands && (
                          <>
                            <span className="text-neutral-300">·</span>
                            <span
                              className="text-red-500"
                              title={tt.joinsSeveredHelp}
                            >
                              {tt.joinsSevered}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500 tabular-nums">
                      {c.lts_before.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <AfterCell c={c} />
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700 tabular-nums">
                      {c.estimated_beneficiaries.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500 tabular-nums whitespace-nowrap">
                      {formatLength(c.length_m)}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700 tabular-nums whitespace-nowrap">
                      <RangeCell
                        low={c.cost_yen_low}
                        high={c.cost_yen_high}
                        format={t.units.yenBig}
                        // The tier is what escalated the per-metre rate behind
                        // this, so it belongs in the tooltip rather than in a
                        // column of its own.
                        title={
                          c.cost_tier
                            ? tt.buildHelp(t.costTiers[c.cost_tier])
                            : undefined
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700 tabular-nums whitespace-nowrap">
                      <RangeCell
                        low={c.payback_years_low}
                        high={c.payback_years_high}
                        format={(v) => t.units.years(v.toFixed(v < 10 ? 1 : 0))}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">
                      {c.context_hex_gap_score !== null
                        ? c.context_hex_gap_score.toFixed(2)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-400 tabular-nums">
                      {c.context_hex_daily_savings_yen !== null
                        ? `¥${c.context_hex_daily_savings_yen.toLocaleString()}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 100 && (
            <p className="text-[11px] text-neutral-400 mt-2">
              {tt.showingTop(rows.length)}
            </p>
          )}

          <div className="mt-5 space-y-2 text-[11px] leading-relaxed text-neutral-400 max-w-3xl">
            <p>
              <span className="text-neutral-500">{tt.notes.noScoreLead}</span>{" "}
              {tt.notes.noScoreBody}
            </p>
            {unmodelled > 0 && (
              <p>
                <span className="text-neutral-500">
                  {tt.notes.unmodelledLead(unmodelled)}
                </span>{" "}
                {tt.notes.unmodelledBody}
              </p>
            )}
            <p>
              <span className="text-neutral-500">{tt.notes.contextLead}</span>{" "}
              {tt.notes.contextBody}
            </p>
          </div>
        </>
      )}
    </>
  );
}
