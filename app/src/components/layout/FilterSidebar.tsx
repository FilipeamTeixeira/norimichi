"use client";

import { useState } from "react";

const userTypes = [
  "Children going to school",
  "Elderly mobility",
  "Commuters",
  "Station access",
  "Tourism routes",
] as const;

const tripDistances = ["0 – 3 km", "3 – 5 km", "5 – 10 km"] as const;

// These must match the `recommendation` values written by
// pipeline/scripts/11_export.R, which is what the map filters on.
// "Bike parking" has no segment-level equivalent - it's a point facility,
// carried by the bike_facilities layer instead - so it has nothing to match.
const interventionTypes = [
  "Protected cycle lane",
  "Crossing improvement",
  "Traffic calming",
  "Missing link",
] as const;

interface Props {
  intervention: string | null;
  onInterventionChange: (value: string | null) => void;
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-neutral-400 shrink-0">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 6.5v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SectionHeader({ title, info }: { title: string; info?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {info && <InfoIcon />}
    </div>
  );
}

/**
 * Explains why a filter group is inert instead of letting the user click
 * controls that quietly do nothing.
 */
function NotAvailable({ reason }: { reason: string }) {
  return (
    <p className="text-[11px] leading-relaxed text-neutral-400 mt-2 italic">
      {reason}
    </p>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 py-1 group ${
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      }`}
    >
      {/* A real input, visually hidden: gives keyboard focus and screen
          reader semantics that a styled <div> alone cannot. */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only peer"
      />
      <div
        className={`w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 peer-focus-visible:ring-offset-1 ${
          checked
            ? "bg-neutral-800 border-neutral-800"
            : `bg-white border-neutral-300 ${!disabled && "group-hover:border-neutral-400"}`
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-[13px] text-neutral-700">{label}</span>
    </label>
  );
}

function Radio({
  label,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 py-1 group ${
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      }`}
    >
      {/* Radios are click-to-toggle-off here, so onClick carries the change
          rather than onChange - React won't fire onChange when re-clicking
          an already-checked radio. */}
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={() => {}}
        onClick={onChange}
        disabled={disabled}
        className="sr-only peer"
      />
      <div
        className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 peer-focus-visible:ring-offset-1 ${
          checked
            ? "border-neutral-800"
            : `border-neutral-300 ${!disabled && "group-hover:border-neutral-400"}`
        }`}
      >
        {checked && <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />}
      </div>
      <span className="text-[13px] text-neutral-700">{label}</span>
    </label>
  );
}

export default function FilterSidebar({
  intervention,
  onInterventionChange,
}: Props) {
  // Users and Trip distance are kept visible because they're part of the
  // design, but there is no data behind either yet (persona-reweighted
  // demand scoring and isochrone reachability - both Part D item 7), so
  // they stay disabled rather than pretending to filter.
  const [selectedUsers] = useState<Set<string>>(new Set());
  const [selectedDistance] = useState<string | null>(null);

  const reset = () => onInterventionChange(null);
  const hasSelection = intervention != null;

  return (
    <aside className="w-[220px] border-r border-neutral-200 bg-white shrink-0 overflow-y-auto flex flex-col">
      <div className="px-5 pt-5 pb-2">
        <h2 className="text-base font-bold text-neutral-900 leading-tight">
          What do you want
          <br />
          to analyse?
        </h2>
      </div>

      <div className="px-5 py-3">
        <SectionHeader title="Users" info />
        <div className="flex flex-col gap-0.5">
          {userTypes.map((u) => (
            <Checkbox
              key={u}
              label={u}
              checked={selectedUsers.has(u)}
              onChange={() => {}}
              disabled
            />
          ))}
        </div>
        <NotAvailable reason="Needs persona-weighted demand scoring — not built yet." />
      </div>

      <div className="mx-5 border-t border-neutral-100" />

      <div className="px-5 py-3">
        <SectionHeader title="Trip distance" info />
        <div className="flex flex-col gap-0.5">
          {tripDistances.map((d) => (
            <Radio
              key={d}
              name="trip-distance"
              label={d}
              checked={selectedDistance === d}
              onChange={() => {}}
              disabled
            />
          ))}
        </div>
        <NotAvailable reason="Needs isochrone reachability analysis — not built yet." />
      </div>

      <div className="mx-5 border-t border-neutral-100" />

      <div className="px-5 py-3">
        <SectionHeader title="Intervention type" info />
        <div className="flex flex-col gap-0.5">
          {interventionTypes.map((t) => (
            <Radio
              key={t}
              name="intervention-type"
              label={t}
              checked={intervention === t}
              onChange={() =>
                onInterventionChange(intervention === t ? null : t)
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-auto px-5 py-4">
        {hasSelection && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7a5 5 0 019.33-2.5M12 7a5 5 0 01-9.33 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M11 2v3h-3M3 12V9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reset
          </button>
        )}
      </div>
    </aside>
  );
}
