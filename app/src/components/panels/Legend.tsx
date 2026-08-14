"use client";

import type { LegendEntry } from "@/lib/scales";
import { NO_DATA } from "@/lib/scales";
import { useT } from "@/i18n/context";

export interface LegendSection {
  title: string;
  /** "line" draws the swatch as a road, "fill" as an area. */
  shape: "line" | "fill";
  entries: LegendEntry[];
  hasNoData: boolean;
  note?: string;
}

/**
 * The one place zoom is allowed to say anything. It offers the other geometry
 * when the active one has left its useful scale — and it only ever offers:
 * acting on it is a click, never a side effect of panning.
 */
export interface LegendNudge {
  text: string;
  action: string;
  onAct: () => void;
  onDismiss: () => void;
}

/**
 * Always rendered when a layer is on: with the map's colours driven by a
 * sidebar choice, the legend is the only thing naming what a colour means.
 */
export default function Legend({
  sections,
  nudge,
}: {
  sections: LegendSection[];
  nudge?: LegendNudge | null;
}) {
  const t = useT();
  if (sections.length === 0 && !nudge) return null;

  return (
    <div className="absolute bottom-8 left-6 z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-neutral-200 shadow-md px-5 py-3.5 max-w-[280px] max-h-[60%] overflow-y-auto">
      {sections.map((section, i) => (
        <div key={section.title} className={i > 0 ? "mt-3.5 pt-3.5 border-t border-neutral-100" : ""}>
          <div className="text-[13px] font-semibold text-neutral-900 mb-2">
            {section.title}
          </div>
          <div className="flex flex-col gap-1.5">
            {section.entries.map((e) => (
              <LegendItem
                key={`${e.color}-${e.label}`}
                color={e.color}
                label={e.label}
                dash={e.dash}
                shape={section.shape}
              />
            ))}
            {section.hasNoData && (
              <LegendItem
                color={NO_DATA}
                label={t.common.noData}
                shape={section.shape}
              />
            )}
          </div>
          {section.note && (
            <p className="text-[11px] leading-relaxed text-neutral-500 mt-2">
              {section.note}
            </p>
          )}
        </div>
      ))}

      {nudge && (
        <div
          className={
            sections.length > 0
              ? "mt-3.5 pt-3.5 border-t border-neutral-100"
              : ""
          }
        >
          <p className="text-[11px] leading-relaxed text-neutral-500">
            {nudge.text}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <button
              type="button"
              onClick={nudge.onAct}
              className="text-[11px] font-semibold text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
            >
              {nudge.action}
            </button>
            <button
              type="button"
              onClick={nudge.onDismiss}
              className="text-[11px] text-neutral-400 hover:text-neutral-600"
            >
              {t.legend.dismiss}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The swatch is 3px tall, which is also MapLibre's line-width unit here. */
const DASH_UNIT_PX = 3;

function LegendItem({
  color,
  label,
  dash,
  shape,
}: {
  color: string;
  label: string;
  dash?: [number, number];
  shape: "line" | "fill";
}) {
  // A dashed swatch is painted as a repeating gradient rather than a flat
  // fill, so the legend shows the same pattern the map draws. Rounded ends
  // are dropped with it — at this size they close the gaps back up.
  const swatchStyle: React.CSSProperties =
    dash && shape === "line"
      ? {
          backgroundImage: `repeating-linear-gradient(to right, ${color} 0 ${
            dash[0] * DASH_UNIT_PX
          }px, transparent ${dash[0] * DASH_UNIT_PX}px ${
            (dash[0] + dash[1]) * DASH_UNIT_PX
          }px)`,
        }
      : { backgroundColor: color };

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={
          shape === "line"
            ? `w-6 h-[3px] shrink-0${dash ? "" : " rounded-full"}`
            : "w-6 h-[12px] rounded-[3px] shrink-0 border border-black/5"
        }
        style={swatchStyle}
      />
      <span className="text-[12px] text-neutral-600 leading-snug">{label}</span>
    </div>
  );
}
