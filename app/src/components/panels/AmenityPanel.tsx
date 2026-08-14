"use client";

import type { AmenityFeature } from "@/lib/types";
import { AMENITY_COLORS } from "@/lib/scales";
import PanelShell from "./PanelShell";
import { useT } from "@/i18n/context";

export default function AmenityPanel({
  amenity,
  onClose,
}: {
  amenity: AmenityFeature;
  onClose: () => void;
}) {
  const t = useT();
  const p = amenity.properties;
  const color = AMENITY_COLORS[p.kind] ?? "#898781";
  const kindLabel = t.panels.amenity.kinds[p.kind];

  return (
    <PanelShell
      title={p.name ?? kindLabel}
      onClose={onClose}
      badge={
        <div
          className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {kindLabel}
        </div>
      }
    >
      <div className="px-5 pb-5 pt-2">
        <div className="flex items-baseline justify-between gap-3 py-[3px]">
          <span className="text-[12px] text-neutral-500">
            {t.panels.amenity.detail[p.kind]}
          </span>
          <span
            className={`text-[12px] text-right ${
              p.detail ? "text-neutral-900 font-medium" : "text-neutral-300"
            }`}
          >
            {p.detail ?? "—"}
          </span>
        </div>
        <p className="text-[11px] text-neutral-400 leading-relaxed mt-3">
          {t.panels.amenity.footnote}
        </p>
      </div>
    </PanelShell>
  );
}
