"use client";

import { useState } from "react";
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
  /**
   * Overlay sections. They fold into one shared block, one wrapping row each,
   * with their own title and note dropped: the sidebar toggle that turned the
   * overlay on already names and describes it, and repeating that per overlay
   * is what grew the legend past the height of the map.
   */
  compact?: boolean;
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
 *
 * It can be folded away to a pill, because "what does this colour mean" is a
 * question you ask once and then stop asking, while the map underneath it is
 * the thing you came for.
 */
export default function Legend({
  sections,
  nudge,
}: {
  sections: LegendSection[];
  nudge?: LegendNudge | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  if (sections.length === 0 && !nudge) return null;

  const scales = sections.filter((s) => !s.compact);
  const overlays = sections.filter((s) => s.compact);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-8 left-6 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg border border-neutral-200 shadow-md px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:text-neutral-900"
      >
        {t.legend.title}
        <Chevron direction="up" />
      </button>
    );
  }

  // Sits on the first block that renders, whichever that is.
  const collapse = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label={t.legend.collapse}
      className="shrink-0 -mr-1 -mt-0.5 p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
    >
      <Chevron direction="down" />
    </button>
  );

  return (
    <div className="absolute bottom-8 left-6 z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-neutral-200 shadow-md px-4 py-3 max-w-[300px] max-h-[55%] overflow-y-auto">
      {scales.map((section, i) => (
        <div key={section.title} className={i > 0 ? DIVIDER : ""}>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-neutral-900 leading-snug">
              {section.title}
            </span>
            {i === 0 && collapse}
          </div>
          <div className="flex flex-col gap-1">
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
            <p className="text-[11px] leading-relaxed text-neutral-500 mt-1.5">
              {section.note}
            </p>
          )}
        </div>
      ))}

      {overlays.length > 0 && (
        <div className={scales.length > 0 ? DIVIDER : ""}>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-neutral-900 leading-snug">
              {t.legend.overlays}
            </span>
            {scales.length === 0 && collapse}
          </div>
          {/* One wrapping row per overlay: short labels pack onto a single
              line, and the grouping survives without a heading each. */}
          <div className="flex flex-col gap-1.5">
            {overlays.map((section) => (
              <div
                key={section.title}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                {section.entries.map((e) => (
                  <LegendItem
                    key={`${e.color}-${e.label}`}
                    color={e.color}
                    label={e.label}
                    dash={e.dash}
                    shape={section.shape}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {nudge && (
        <div className={sections.length > 0 ? DIVIDER : ""}>
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

const DIVIDER = "mt-2.5 pt-2.5 border-t border-neutral-100";

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={direction === "up" ? "rotate-180" : ""}
    >
      <path
        d="M1.5 3.5L5 7l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
    <div className="flex items-center gap-2">
      <div
        className={
          shape === "line"
            ? `w-5 h-[3px] shrink-0${dash ? "" : " rounded-full"}`
            : // The border carries the swatch on its own for white fills —
              // "Parking (outlined)" is a white square on a white card.
              "w-3 h-3 rounded-[3px] shrink-0 border border-black/20"
        }
        style={swatchStyle}
      />
      <span className="text-[11.5px] text-neutral-600 leading-snug">
        {label}
      </span>
    </div>
  );
}
