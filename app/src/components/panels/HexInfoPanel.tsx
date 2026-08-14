"use client";

import type { HexFeature } from "@/lib/types";
import { formatValue, type MetricDef } from "@/lib/metrics";
import PanelShell from "./PanelShell";
import { useT } from "@/i18n/context";
import {
  useFormatValue,
  useHexAmenityCounts,
  useHexBikeCounts,
  useHexInputs,
  useHexRoadSummary,
  useHexSubscores,
  useRoiShifted,
  useRoiToday,
} from "@/i18n/metrics";

/**
 * The two halves of the demand score, side by side. A single "demand: 0.62"
 * doesn't say whether people start journeys here or come here for them, and
 * that distinction changes what you'd build.
 */
function SubScoreBar({ metric, value }: { metric: MetricDef; value: unknown }) {
  const fallbacks = useFormatValue();
  const v = typeof value === "number" ? value : null;
  const pct = v == null ? 0 : Math.max(0, Math.min(1, v)) * 100;

  return (
    <div title={metric.hint}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-neutral-600">{metric.label}</span>
        <span className="text-[12px] font-semibold text-neutral-900 tabular-nums">
          {formatValue(metric, value, fallbacks)}
        </span>
      </div>
      <div className="h-[6px] rounded-full bg-neutral-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#2a78d6] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Row({ metric, value }: { metric: MetricDef; value: unknown }) {
  const fallbacks = useFormatValue();
  return (
    <div
      title={metric.hint}
      className="flex items-baseline justify-between gap-3 py-[3px]"
    >
      <span className="text-[12px] text-neutral-500 leading-snug">
        {metric.label}
      </span>
      <span className="text-[12px] font-medium text-neutral-900 shrink-0 tabular-nums">
        {formatValue(metric, value, fallbacks)}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 pb-3">
      <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
        {title}
      </h4>
      {children}
    </div>
  );
}

export default function HexInfoPanel({
  hex,
  metric,
  viewLabel,
  viewHint,
  onShowStreets,
  onClose,
}: {
  hex: HexFeature;
  /** The active area view's metric, or undefined when none is on. */
  metric?: MetricDef;
  viewLabel?: string;
  viewHint?: string;
  /** Zooms to this hex and switches the map to the street view. */
  onShowStreets: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const fallbacks = useFormatValue();
  const roadSummary = useHexRoadSummary();
  const subscores = useHexSubscores();
  const inputs = useHexInputs();
  const amenityCounts = useHexAmenityCounts();
  const bikeCounts = useHexBikeCounts();
  const roiToday = useRoiToday();
  const roiShifted = useRoiShifted();

  const p = hex.properties as unknown as Record<string, unknown>;
  const isFlat = p.flat_terrain === true;
  const hasTerrain = p.flat_terrain != null;

  return (
    <PanelShell
      title={t.panels.hex.title}
      subtitle={String(p.hex_id)}
      onClose={onClose}
      badge={
        hasTerrain ? (
          <div
            className={`inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium ${
              isFlat
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <SlopeIcon />
            {isFlat ? t.panels.hex.flat : t.panels.hex.hilly}
          </div>
        ) : undefined
      }
    >
      {metric && (
        <div className="px-5 pb-3">
          <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
            {viewLabel ?? metric.label}
          </p>
          <p className="text-3xl font-bold text-neutral-900 mt-0.5 leading-none">
            {formatValue(metric, p[metric.key], fallbacks)}
          </p>
          {(viewHint ?? metric.hint) && (
            <p className="text-[11.5px] text-neutral-500 mt-1.5 leading-relaxed">
              {viewHint ?? metric.hint}
            </p>
          )}
        </div>
      )}

      {/* The area/street relationship, made explicit and clickable. Teaching it
          by performing it beats any amount of caption. */}
      <div className="px-5 pb-3">
        <button
          type="button"
          onClick={onShowStreets}
          className="w-full text-left rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 px-3 py-2 transition-colors group"
        >
          <span className="text-[12px] font-semibold text-neutral-900">
            {t.panels.hex.seeStreets.label}
          </span>
          <span className="block text-[11px] text-neutral-500 leading-relaxed mt-0.5">
            {t.panels.hex.seeStreets.hint}
          </span>
        </button>
      </div>

      <Section title={t.panels.hex.sections.roads}>
        <div className="flex flex-col">
          {roadSummary.map((m) => (
            <Row key={m.key} metric={m} value={p[m.key]} />
          ))}
        </div>
      </Section>

      <Section title={t.panels.hex.sections.demand}>
        <div className="flex flex-col gap-2.5">
          {subscores.map((m) => (
            <SubScoreBar key={m.key} metric={m} value={p[m.key]} />
          ))}
        </div>
      </Section>

      <Section title={t.panels.hex.sections.inputs}>
        <div className="flex flex-col">
          {inputs.map((m) => (
            <Row key={m.key} metric={m} value={p[m.key]} />
          ))}
        </div>
      </Section>

      <Section title={t.panels.hex.sections.destinations}>
        <div className="flex flex-col">
          {amenityCounts.map((m) => (
            <Row key={m.key} metric={m} value={p[m.key]} />
          ))}
        </div>
      </Section>

      <Section title={t.panels.hex.sections.bikeFacilities}>
        <div className="flex flex-col">
          {bikeCounts.map((m) => (
            <Row key={m.key} metric={m} value={p[m.key]} />
          ))}
        </div>
      </Section>

      {/* The ROI report: what driving costs here now, against what shifting a
          share of it to bikes would return. Two columns rather than twelve
          choropleths. */}
      <div className="mx-4 mb-4 rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-3.5 py-2 bg-neutral-50 border-b border-neutral-200">
          <p className="text-[12px] font-bold text-neutral-900">
            {t.panels.hex.roi.title}
          </p>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            {t.panels.hex.roi.caption}
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-neutral-200">
          <div className="p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              {t.panels.hex.roi.today}
            </p>
            <div className="flex flex-col gap-1">
              {roiToday.map((m) => (
                <div key={m.key} className="flex flex-col">
                  <span className="text-[11px] text-neutral-500 leading-tight">
                    {m.label}
                  </span>
                  <span className="text-[13px] font-semibold text-neutral-900 tabular-nums">
                    {formatValue(m, p[m.key], fallbacks)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 bg-emerald-50/40">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
              {t.panels.hex.roi.ifShifted}
            </p>
            <div className="flex flex-col gap-1">
              {roiShifted.map((m) => (
                <div key={m.key} className="flex flex-col">
                  <span className="text-[11px] text-emerald-700/80 leading-tight">
                    {m.label}
                  </span>
                  <span className="text-[13px] font-semibold text-emerald-900 tabular-nums">
                    {formatValue(m, p[m.key], fallbacks)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

function SlopeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 13l5-8 3 4 4-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
