"use client";

import type { ToggleKey, ToggleState } from "@/lib/types";
import { VIEWS, VIEW_GROUPS, type ViewDef } from "@/lib/metrics";
import { CYCLEWAY_COLOR } from "@/lib/scales";

interface Props {
  /** `null` = no view is on and the map is basemap only. */
  activeView: string | null;
  onViewChange: (id: string) => void;
  toggles: ToggleState;
  onTogglesChange: (next: ToggleState) => void;
}

const TOGGLE_ROWS: {
  key: ToggleKey;
  label: string;
  description: string;
  swatch: string;
}[] = [
  {
    key: "recommendations",
    label: "Recommendations",
    description: "Segments with a proposed intervention",
    swatch: "#1baf7a",
  },
  {
    key: "cycleways",
    label: "Existing cycleways",
    description: "Cycling provision already on the ground",
    swatch: CYCLEWAY_COLOR,
  },
  {
    key: "amenities",
    label: "Amenities",
    description: "Schools, stations, shops",
    swatch: "#eb6834",
  },
  {
    key: "bike_facilities",
    label: "Bike facilities",
    description: "Parking and sharing docks",
    swatch: "#6366f1",
  },
];

function Switch({ on }: { on: boolean }) {
  return (
    <div
      className={`w-[30px] h-[18px] rounded-full shrink-0 transition-colors relative peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 peer-focus-visible:ring-offset-1 ${
        on ? "bg-neutral-800" : "bg-neutral-200 group-hover:bg-neutral-300"
      }`}
    >
      <div
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
          on ? "left-[14px]" : "left-[2px]"
        }`}
      />
    </div>
  );
}

function ViewOption({
  view,
  selected,
  onSelect,
}: {
  view: ViewDef;
  selected: boolean;
  onSelect: () => void;
}) {
  // A checkbox, not a radio: clicking the active view switches it off, which
  // is the only way to see the basemap (or the overlays alone) underneath.
  return (
    <label className="flex items-start gap-2.5 py-1 cursor-pointer group">
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        className="sr-only peer"
      />
      <div className="mt-[1px]">
        <Switch on={selected} />
      </div>
      <div className="min-w-0">
        <span
          className={`text-[13px] leading-snug ${
            selected
              ? "text-neutral-900 font-medium"
              : "text-neutral-600 group-hover:text-neutral-900"
          }`}
        >
          {view.label}
        </span>
        {selected && (
          <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5">
            {view.hint}
          </p>
        )}
      </div>
    </label>
  );
}

export default function FilterSidebar({
  activeView,
  onViewChange,
  toggles,
  onTogglesChange,
}: Props) {
  const toggle = (key: ToggleKey) =>
    onTogglesChange({ ...toggles, [key]: !toggles[key] });

  return (
    <aside className="w-[268px] border-r border-neutral-200 bg-white shrink-0 overflow-y-auto flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-base font-bold text-neutral-900 leading-tight">
          What do you want
          <br />
          to analyse?
        </h2>
        <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
          One at a time — each colours the map its own way. Nothing here changes
          on its own as you move around.
        </p>
      </div>

      {/* Every view is listed at every zoom. The list used to swap itself out
          when the map crossed z15, so navigating silently replaced the
          question being asked. */}
      {VIEW_GROUPS.map((group) => {
        const views = VIEWS.filter((v) => v.group === group.id);
        if (views.length === 0) return null;
        return (
          <div key={group.id} className="px-5 pb-4">
            <h3 className="text-sm font-semibold text-neutral-900 mb-0.5">
              {group.title}
            </h3>
            <p className="text-[11px] text-neutral-400 mb-2 leading-relaxed">
              {group.caption}
            </p>
            <div className="flex flex-col gap-0.5">
              {views.map((v) => (
                <ViewOption
                  key={v.id}
                  view={v}
                  selected={activeView === v.id}
                  onSelect={() => onViewChange(v.id)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="px-5 py-4 border-t border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-900 mb-0.5">
          Overlays
        </h3>
        <p className="text-[11px] text-neutral-400 mb-2.5 leading-relaxed">
          Drawn on top of any view without taking its colours, so these combine
          freely. Click anything for detail.
        </p>
        <div className="flex flex-col gap-1">
          {TOGGLE_ROWS.map((row) => (
            <label
              key={row.key}
              className="flex items-start gap-2.5 py-1 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={toggles[row.key]}
                onChange={() => toggle(row.key)}
                className="sr-only peer"
              />
              <div className="mt-[1px]">
                <Switch on={toggles[row.key]} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: row.swatch }}
                  />
                  <span
                    className={`text-[13px] leading-snug ${
                      toggles[row.key] ? "text-neutral-900" : "text-neutral-600"
                    }`}
                  >
                    {row.label}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed mt-0.5">
                  {row.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-400 px-5 py-4 border-t border-neutral-200 italic mt-auto">
        Sources: hexagons, segments, cycleways, bike_facilities and amenities GeoJSON
        (exported by pipeline/scripts/11_export.R).
      </p>
    </aside>
  );
}
