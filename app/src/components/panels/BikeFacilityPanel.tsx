"use client";

import type { BikeFacilityFeature, BikeFacilityProperties } from "@/lib/types";
import { BIKE_COLOR } from "@/lib/scales";
import PanelShell from "./PanelShell";
import { useT } from "@/i18n/context";
import type { Dict } from "@/i18n/en";

/**
 * OSM writes these as free text; yes/no are by far the commonest values, and
 * only those two are translated. Anything else is passed through as the mapper
 * wrote it — it is data, and guessing at it would be worse than showing it.
 */
function yesNo(v: string | null, t: Dict): string | null {
  if (v == null) return null;
  if (v === "yes") return t.common.yes;
  if (v === "no") return t.common.no;
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
  const t = useT();
  const p = facility.properties as BikeFacilityProperties;
  // One hue for both: on the map they are separated by fill vs ring, and here
  // the label does the work.
  const type =
    p.facility_type === "parking"
      ? { label: t.panels.facility.parking, color: BIKE_COLOR }
      : p.facility_type === "sharing"
        ? { label: t.panels.facility.sharing, color: BIKE_COLOR }
        : { label: p.facility_type, color: "#898781" };
  const capacity =
    p.capacity != null ? Number(p.capacity) : null;

  return (
    <PanelShell
      title={p.name ?? type.label}
      subtitle={`OSM ${p.osm_id}`}
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
            {t.panels.facility.capacity}
          </p>
          <p className="text-3xl font-bold text-neutral-900 mt-0.5 leading-none">
            {capacity.toLocaleString()}
            <span className="text-sm font-medium text-neutral-400 ml-1.5">
              {p.facility_type === "sharing"
                ? t.panels.facility.bikes
                : t.panels.facility.spaces}
            </span>
          </p>
        </div>
      )}

      <div className="px-5 pb-5 pt-3 border-t border-neutral-100">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
          {t.panels.facility.operation}
        </h4>
        <div className="flex flex-col">
          <Row label={t.panels.facility.brand} value={p.brand} />
          <Row label={t.panels.facility.operator} value={p.operator} />
          <Row label={t.panels.facility.openingHours} value={p.opening_hours} />
          <Row label={t.panels.facility.fee} value={yesNo(p.fee, t)} />
        </div>

        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mt-3 mb-1">
          {t.panels.facility.accessAndShelter}
        </h4>
        <div className="flex flex-col">
          <Row label={t.panels.facility.access} value={p.access} />
          <Row label={t.panels.facility.covered} value={yesNo(p.covered, t)} />
          <Row
            label={t.panels.facility.supervised}
            value={yesNo(p.supervised, t)}
          />
        </div>

        <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mt-3 mb-1">
          {t.panels.facility.reference}
        </h4>
        <div className="flex flex-col">
          <Row label={t.panels.facility.osmAmenity} value={p.amenity} />
          <Row label={t.panels.facility.ref} value={p.ref} />
          <Row
            label={t.panels.facility.capacity}
            value={capacity?.toLocaleString() ?? null}
          />
          <Row label={t.panels.facility.note} value={p.note} />
        </div>
      </div>
    </PanelShell>
  );
}
