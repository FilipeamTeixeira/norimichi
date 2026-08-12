"use client";

import type { BikeFacilityFeature, BikeFacilityProperties } from "@/lib/types";
import { BIKE_COLOR } from "@/lib/scales";
import PanelShell from "./PanelShell";

// One hue for both: on the map they are separated by fill vs ring, and here
// the label does the work.
const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  parking: { label: "Bike parking", color: BIKE_COLOR },
  sharing: { label: "Bike sharing dock", color: BIKE_COLOR },
};

/** OSM writes these as free text; yes/no are by far the commonest values. */
function yesNo(v: string | null): string | null {
  if (v == null) return null;
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return v;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[12px] text-neutral-500 leading-snug">{label}</span>
      <span
        className={`text-[12px] shrink-0 text-right ${
          value ? "text-neutral-900 font-medium" : "text-neutral-300"
        }`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function BikeFacilityPanel({
  facility,
  onClose,
}: {
  facility: BikeFacilityFeature;
  onClose: () => void;
}) {
  const p = facility.properties as BikeFacilityProperties;
  const type = TYPE_STYLE[p.facility_type] ?? {
    label: p.facility_type,
    color: "#898781",
  };
  const capacity =
    p.capacity != null ? Number(p.capacity) : null;

  return (
    <PanelShell
      title={p.name ?? type.label}
      subtitle={`OSM #${p.osm_id}`}
      onClose={onClose}
      badge={
        <div
          className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ backgroundColor: `${type.color}1a`, color: type.color }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: type.color }}
          />
          {type.label}
        </div>
      }
    >
      {capacity != null && (
        <div className="px-5 pb-3">
          <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
            Capacity
          </p>
          <p className="text-3xl font-bold text-neutral-900 mt-0.5 leading-none">
            {capacity.toLocaleString()}
            <span className="text-sm font-medium text-neutral-400 ml-1.5">
              {p.facility_type === "sharing" ? "bikes" : "spaces"}
            </span>
          </p>
        </div>
      )}

      <div className="px-5 pb-5 pt-3 border-t border-neutral-100">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
          Operation
        </h4>
        <div className="flex flex-col">
          <Row label="Brand" value={p.brand} />
          <Row label="Operator" value={p.operator} />
          <Row label="Opening hours" value={p.opening_hours} />
          <Row label="Fee" value={yesNo(p.fee)} />
        </div>

        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mt-3 mb-1">
          Access & shelter
        </h4>
        <div className="flex flex-col">
          <Row label="Access" value={p.access} />
          <Row label="Covered" value={yesNo(p.covered)} />
          <Row label="Supervised" value={yesNo(p.supervised)} />
        </div>

        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mt-3 mb-1">
          Reference
        </h4>
        <div className="flex flex-col">
          <Row label="OSM amenity" value={p.amenity} />
          <Row label="Ref" value={p.ref} />
          <Row label="Capacity" value={capacity?.toLocaleString() ?? null} />
          <Row label="Note" value={p.note} />
        </div>
      </div>
    </PanelShell>
  );
}
