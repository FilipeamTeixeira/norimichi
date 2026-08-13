"use client";

import { useMemo, useState } from "react";
import type { CorridorProperties, InterventionType } from "@/lib/types";
import { corridorLabel, COST_TIER_ORDER } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  | "cost"
  | "lts"
  | "savings";

interface Column {
  key: SortKey;
  label: string;
  /** Marks a column describing the neighbourhood, not the corridor. */
  context?: boolean;
  help?: string;
}

const COLUMNS: Column[] = [
  {
    key: "lts",
    label: "LTS now",
    help: "Level of Traffic Stress, 1–4. Length-weighted across the corridor's segments.",
  },
  {
    key: "after",
    label: "Score after",
    help: "Suitability (0–100) after the recommended intervention, re-scored by the same function that produced the current score. N/A where the intervention is not one the stress model has an input for.",
  },
  {
    key: "beneficiaries",
    label: "Residents within 500m",
    help: "From a single unioned buffer around the whole corridor, not summed across its segments.",
  },
  { key: "length", label: "Length" },
  { key: "cost", label: "Cost tier" },
  {
    key: "gap",
    label: "Area gap",
    context: true,
    help: "The missed-opportunity score of the ~0.1km² hex this corridor sits in, from hex-level population. Two corridors crossing the same cell show the same figure — it ranks neighbourhoods, not projects.",
  },
  {
    key: "savings",
    label: "Area ¥/day",
    context: true,
    help: "The enclosing hex's modelled daily benefit under score_roi.R's illustrative 20% mode-shift scenario, for the whole cell. Not attributable to this corridor. Order-of-magnitude only.",
  },
];

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
      ? `${c.signalised_junctions} signalised junction${
          c.signalised_junctions === 1 ? "" : "s"
        }${
          // The rate is only worth printing on a corridor long enough for a
          // per-km figure to describe a ride. Two junctions on a 34m bridge is
          // 58.6/km, which is true and tells the reader nothing.
          c.length_m >= RATE_MEANINGFUL_ABOVE_M
            ? ` · ${c.signals_per_km.toFixed(1)} stops/km`
            : ""
        }`
      : c.informal_parking_length_m > 0
        ? `${formatLength(c.informal_parking_length_m)} kerbside pressure`
        : null;

  return (
    <div className="text-right">
      <span
        className="text-neutral-400 cursor-help border-b border-dotted border-neutral-300"
        title={`Not scored: ${c.intervention_lever}. The traffic-stress model has no input for this intervention, so no after-score is shown rather than borrowing another intervention's number.`}
      >
        N/A
      </span>
      {alt && (
        <div className="text-[10px] text-neutral-400 mt-0.5 leading-tight">
          {alt}
        </div>
      )}
    </div>
  );
}

interface Props {
  corridors: CorridorProperties[];
  /** Row click — F.6 hands the corridor to the Network tab. */
  onSelect: (c: CorridorProperties) => void;
}

export default function RankingTable({ corridors, onSelect }: Props) {
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

  const availableTypes = useMemo(() => {
    const present = new Set<string>();
    corridors.forEach((c) => present.add(c.recommendation));
    return present;
  }, [corridors]);

  const rows = useMemo(() => {
    const filtered =
      types.size === 0
        ? corridors
        : corridors.filter((c) => types.has(c.recommendation));

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
        case "cost":
          return c.cost_tier ? COST_TIER_ORDER[c.cost_tier] : null;
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
  }, [corridors, types, sortKey, sortDir]);

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
          Intervention
        </span>
        {INTERVENTION_TYPES.map((t) => {
          const on = types.has(t);
          const available = availableTypes.has(t);
          return (
            <button
              key={t}
              disabled={!available}
              onClick={() => toggleType(t)}
              title={
                available
                  ? undefined
                  : "No corridor carries this type — bike parking is a point facility, not a stretch of street."
              }
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
                style={{ backgroundColor: TYPE_COLORS[t] }}
              />
              {t}
            </button>
          );
        })}
        {types.size > 0 && (
          <button
            onClick={() => setTypes(new Set())}
            className="text-[12px] text-neutral-400 hover:text-neutral-700 ml-1"
          >
            Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No corridors match that filter.
        </p>
      ) : (
        <>
          <p className="text-[12px] text-neutral-400 mb-2.5 tabular-nums">
            {rows.length} corridors · {totalKm.toFixed(1)} km · click a row to
            see it on the map
          </p>

          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-left w-10">
                    #
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-left">
                    Project
                  </th>
                  {COLUMNS.map((col) => {
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
                              (context)
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
                        {corridorLabel(c)}
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
                          {c.recommendation}
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span>
                          {c.segment_count} segment
                          {c.segment_count === 1 ? "" : "s"}
                        </span>
                        {c.bridges_islands && (
                          <>
                            <span className="text-neutral-300">·</span>
                            <span
                              className="text-red-500"
                              title="Upgrading this would join two otherwise-disconnected low-stress areas."
                            >
                              joins severed areas
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
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "text-[11px] px-1.5 py-0.5 rounded",
                          c.cost_tier === "High"
                            ? "bg-red-50 text-red-600"
                            : c.cost_tier === "Medium"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-neutral-100 text-neutral-500"
                        )}
                      >
                        {c.cost_tier ?? "—"}
                      </span>
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
              Showing the top 100 of {rows.length}.
            </p>
          )}

          <div className="mt-5 space-y-2 text-[11px] leading-relaxed text-neutral-400 max-w-3xl">
            <p>
              <span className="text-neutral-500">
                No blended &ldquo;investment score&rdquo;, deliberately.
              </span>{" "}
              Cost is only ever a rough tier, so a single ranking number would
              be fake precision. Sort by whichever column matters to the
              decision you are making and weigh cost against benefit yourself.
            </p>
            {unmodelled > 0 && (
              <p>
                <span className="text-neutral-500">
                  {unmodelled} corridors show N/A for the after-score.
                </span>{" "}
                The traffic-stress model has no input representing a crossing
                treatment, so there is no honest way to compute one — those rows
                state what the intervention does address instead. Traffic calming
                is scored as a 30km/h zone plus kerbside management, because a
                speed cap alone moves 195 of 196 of those segments by zero
                points: they are already posted at 30.
              </p>
            )}
            <p>
              <span className="text-neutral-500">
                The two &ldquo;area&rdquo; columns are context, not corridor
                values.
              </span>{" "}
              Both come from the ~0.1km² hex the corridor sits in, computed from
              hex-level population, so two corridors crossing the same cell show
              the same figures.
            </p>
          </div>
        </>
      )}
    </>
  );
}
