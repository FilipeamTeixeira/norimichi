"use client";

import type {
  SegmentFeature,
  SegmentProperties,
  DisplayCategory,
} from "@/lib/types";
import {
  segmentSuitability,
  segmentCategory,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/types";
import {
  SEGMENT_INPUTS,
  SEGMENT_NETWORK,
  formatValue,
  type MetricDef,
} from "@/lib/metrics";
import PanelShell from "./PanelShell";
import FactorRow from "./FactorRow";

interface Props {
  segment: SegmentFeature;
  onClose: () => void;
}

function formatLength(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/**
 * The before/after headline. `suitability_score` is what the street is worth
 * to a cyclist today; `suitability_after` is what the recommendation would
 * make it — putting them side by side is the whole argument in one line.
 */
function BeforeAfter({
  score,
  after,
  color,
}: {
  score: number;
  after: number | null | undefined;
  color: string;
}) {
  return (
    <div className="flex items-end gap-3">
      <div>
        <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
          Suitability now
        </p>
        <p className="text-3xl font-bold leading-none mt-0.5" style={{ color }}>
          {score}
          <span className="text-sm font-medium text-neutral-400 ml-1">/100</span>
        </p>
      </div>
      {after != null && after > score && (
        <>
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            className="text-neutral-300 mb-1.5"
          >
            <path
              d="M3 8h9M9 5l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-[11px] text-emerald-600 uppercase tracking-wider font-medium">
              If built
            </p>
            <p className="text-3xl font-bold text-emerald-700 leading-none mt-0.5">
              {after}
              <span className="text-sm font-medium text-emerald-600/60 ml-1">
                /100
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function InputRow({ metric, value }: { metric: MetricDef; value: unknown }) {
  // Booleans get a colour cue as well as the word, since "None" vs "Present"
  // is the part of the panel people scan rather than read.
  const isBool = metric.scale === "boolean";
  const good =
    isBool && metric.key === "likely_informal_parking" ? value !== true : value === true;

  return (
    <FactorRow
      label={metric.label}
      value={formatValue(metric, value)}
      hint={metric.hint}
      tone={
        isBool && value != null ? (good ? "good" : "bad") : "neutral"
      }
    />
  );
}

/**
 * Explains the segment's position in the network, which is what separates a
 * strategic bottleneck from a merely unpleasant road. Without this the red
 * colour reads as "dangerous", which is the interpretation the design
 * explicitly wants to avoid.
 */
function NetworkRole({
  p,
  category,
}: {
  p: SegmentProperties;
  category: DisplayCategory;
}) {
  if (p.display_category == null) return null;

  const islands = p.islands_adjacent ?? 0;
  const criticality = p.network_criticality_score ?? 0;

  let tone: string;
  let title: string;
  let body: string;

  if (category === "bottleneck" && islands >= 2) {
    tone = "bg-red-50 border-red-100 text-red-900";
    title = `Connects ${islands} separate safe networks`;
    body =
      "These areas are already calm enough to cycle in, but this segment is the only thing between them. Upgrading it merges them into one usable network.";
  } else if (category === "bottleneck") {
    tone = "bg-red-50 border-red-100 text-red-900";
    title = "On a corridor between separated calm areas";
    body = `Part of a short chain of stressful segments that together sever otherwise-connected safe networks. Connectivity value: ${criticality}/100.`;
  } else if (category === "low_priority") {
    tone = "bg-neutral-50 border-neutral-200 text-neutral-700";
    title = "Connects little of the network";
    body =
      "Stressful to cycle, but upgrading it in isolation would not join any separated calm areas — so it ranks below the bottlenecks despite the low score.";
  } else if (p.island_id != null) {
    tone = "bg-emerald-50 border-emerald-100 text-emerald-900";
    title = "Part of a connected safe network";
    body =
      "Already comfortable enough to cycle, and joined to a wider calm network rather than stranded on its own.";
  } else {
    tone = "bg-neutral-50 border-neutral-200 text-neutral-700";
    title = "Isolated calm segment";
    body =
      "Comfortable in itself, but not connected to a wider calm network — its usefulness depends on the stressful roads around it.";
  }

  return (
    <div className="px-5 pb-3">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
        Network role
      </h3>
      <div className={`rounded-lg border p-3 ${tone}`}>
        <p className="text-[12.5px] font-semibold leading-snug">{title}</p>
        <p className="text-[11.5px] leading-relaxed mt-1 opacity-80">{body}</p>
      </div>
      <div className="flex flex-col mt-1.5">
        {SEGMENT_NETWORK.map((m) => (
          <InputRow
            key={m.key}
            metric={m}
            value={(p as unknown as Record<string, unknown>)[m.key]}
          />
        ))}
      </div>
    </div>
  );
}

export default function SegmentInfoPanel({ segment, onClose }: Props) {
  const p: SegmentProperties = segment.properties;
  const props = p as unknown as Record<string, unknown>;
  const score = segmentSuitability(p);
  const category = segmentCategory(p);
  const categoryColor = CATEGORY_COLORS[category];
  const beneficiaries = p.estimated_beneficiaries ?? 0;

  return (
    <PanelShell
      title={p.name ?? "Road segment"}
      subtitle={`${p.highway ?? "road"} · ${formatLength(p.length_m)} · #${p.way_id}`}
      onClose={onClose}
      badge={
        <div
          className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{
            backgroundColor: `${categoryColor}1a`,
            color: categoryColor,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: categoryColor }}
          />
          {CATEGORY_LABELS[category]}
        </div>
      }
    >
      <div className="px-5 pb-4">
        <BeforeAfter
          score={score}
          after={p.suitability_after}
          color={categoryColor}
        />
      </div>

      <div className="px-5 pb-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
          Why this street scores as it does
        </h3>
        <div className="flex flex-col">
          {SEGMENT_INPUTS.map((m) => (
            <InputRow key={m.key} metric={m} value={props[m.key]} />
          ))}
        </div>
      </div>

      <NetworkRole p={p} category={category} />

      {/* The proposal. Kept visually distinct from every measurement above so
          it reads as "here is what to build", not "here is another number". */}
      {p.recommendation && (
        <div className="mx-4 mb-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="12" r="3" stroke="white" strokeWidth="1.2" fill="none" />
                <circle cx="11" cy="12" r="3" stroke="white" strokeWidth="1.2" fill="none" />
                <path
                  d="M5 12l2.5-8h3L13 12"
                  stroke="white"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                Proposed intervention
              </p>
              <p className="text-[13px] font-bold text-emerald-900">
                {p.recommendation}
              </p>
            </div>
          </div>
          <div className="space-y-1.5 text-[13px]">
            {/* N/A, not a bare current score. Two of the five intervention
                types have no counterpart in the traffic-stress model (see
                BenefitKind in lib/types.ts), and falling back to `score` here
                printed today's number under a "Proposed intervention" heading —
                which reads as the intervention delivering it. */}
            <div className="flex justify-between">
              <span className="text-emerald-700">Suitability</span>
              {p.suitability_after != null ? (
                <span className="font-semibold text-emerald-900">
                  {score} → {p.suitability_after}
                </span>
              ) : (
                <span
                  className="font-semibold text-emerald-700/70 cursor-help border-b border-dotted border-emerald-300"
                  title={
                    p.intervention_lever
                      ? `Not scored: ${p.intervention_lever}.`
                      : "The traffic-stress score has no input for this intervention, so no after-score is computed."
                  }
                >
                  N/A
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700">Cost tier</span>
              <span className="font-semibold text-emerald-900">
                {p.cost_tier ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700">Beneficiaries</span>
              <span className="font-semibold text-emerald-900">
                {beneficiaries > 0
                  ? `~${beneficiaries.toLocaleString()} people`
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}
