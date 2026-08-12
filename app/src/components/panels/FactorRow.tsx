"use client";

/**
 * One label-and-value line in a panel.
 *
 * Pulled out of SegmentInfoPanel so the Route Analysis panel can use the same
 * row rather than a near-copy of it: "no sidewalk" has to look the same whether
 * it is being said about one street or about 40% of somebody's trip, or the two
 * screens quietly become two products.
 *
 * `tone` is the only decoration. Green and red are for the two-state facts —
 * the part of a panel people scan rather than read — and everything measured
 * stays neutral, because a number is not good or bad on its own.
 */
export type FactorTone = "neutral" | "good" | "bad";

const TONE_CLASS: Record<FactorTone, string> = {
  neutral: "text-neutral-900",
  good: "text-emerald-700",
  bad: "text-red-700",
};

export default function FactorRow({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: FactorTone;
}) {
  return (
    <div
      title={hint}
      className="flex items-baseline justify-between gap-3 py-[3px]"
    >
      <span className="text-[12px] text-neutral-500 leading-snug">{label}</span>
      <span
        className={`text-[12px] font-medium shrink-0 tabular-nums ${TONE_CLASS[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
