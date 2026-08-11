"use client";

import { useState } from "react";
import FilterSidebar from "@/components/layout/FilterSidebar";
import MapView from "@/components/map/MapView";
import SegmentInfoPanel from "@/components/panels/SegmentInfoPanel";
import Legend from "@/components/panels/Legend";
import type { SegmentFeature } from "@/lib/types";

export default function NetworkPage() {
  const [selected, setSelected] = useState<SegmentFeature | null>(null);

  return (
    <>
      <FilterSidebar />
      <main className="flex-1 relative bg-[#F7F8FA]">
        <MapView onSegmentClick={setSelected} />
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
