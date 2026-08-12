"use client";

import type { AmenityFeature, AmenityProperties } from "@/lib/types";
import { AMENITY_COLORS } from "@/lib/scales";
import PanelShell from "./PanelShell";

const KIND_LABEL: Record<AmenityProperties["kind"], string> = {
  school: "School",
  station: "Station",
  shop: "Shop or restaurant",
};

const KIND_DETAIL_LABEL: Record<AmenityProperties["kind"], string> = {
  school: "Address",
  station: "Lines",
  shop: "Type",
};

export default function AmenityPanel({
  amenity,
  onClose,
}: {
  amenity: AmenityFeature;
  onClose: () => void;
}) {
  const p = amenity.properties;
  const color = AMENITY_COLORS[p.kind] ?? "#898781";

  return (
    <PanelShell
      title={p.name ?? KIND_LABEL[p.kind]}
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
          {KIND_LABEL[p.kind]}
        </div>
      }
    >
      <div className="px-5 pb-5 pt-2">
        <div className="flex items-baseline justify-between gap-3 py-[3px]">
          <span className="text-[12px] text-neutral-500">
            {KIND_DETAIL_LABEL[p.kind]}
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
          Counted in this hex&rsquo;s destination totals — see the neighbourhood
          panel for how many are within reach.
        </p>
      </div>
    </PanelShell>
  );
}
