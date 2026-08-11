"use client";

import { useState } from "react";
import FilterSidebar from "@/components/layout/FilterSidebar";
import MapView from "@/components/map/MapView";
import SegmentInfoPanel from "@/components/panels/SegmentInfoPanel";
import Legend from "@/components/panels/Legend";
import type { SegmentFeature } from "@/lib/types";

export default function NetworkPage() {
  const [selected, setSelected] = useState<SegmentFeature | null>(null);
  const [intervention, setIntervention] = useState<string | null>(null);

  return (
    <>
      <FilterSidebar
        intervention={intervention}
        onInterventionChange={setIntervention}
      />
      <main className="flex-1 relative bg-[#F7F8FA]">
        <MapView
          onSegmentClick={setSelected}
          interventionFilter={intervention}
        />
        {selected && (
          <SegmentInfoPanel
            segment={selected}
            onClose={() => setSelected(null)}
          />
        )}
        <Legend />
      </main>
    </>
  );
}
