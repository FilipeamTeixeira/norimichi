"use client";

import { useMemo } from "react";
import {
  hexAmenityCounts,
  hexBikeCounts,
  hexInputs,
  hexObserved,
  hexRoadSummary,
  hexSubscores,
  roiShifted,
  roiToday,
  segmentInputs,
  segmentNetwork,
  viewById,
  viewGroups,
  views,
  type MetricDef,
  type ViewDef,
  type ViewGroup,
} from "@/lib/metrics";
import { useT } from "./context";

/**
 * The metric groups, resolved against the active language and memoised on it.
 *
 * The memo is not premature: each of these rebuilds an array of objects, and
 * the panels call several of them on every selection change. Keying on the
 * dictionary rather than on the locale string means the identity is stable for
 * exactly as long as the strings are.
 */
function useGroup<T>(build: (t: ReturnType<typeof useT>) => T): T {
  const t = useT();
  return useMemo(() => build(t), [build, t]);
}

export const useViews = (): ViewDef[] => useGroup(views);
export const useViewGroups = (): ViewGroup[] => useGroup(viewGroups);
export const useViewById = (): Map<string, ViewDef> => useGroup(viewById);
export const useHexRoadSummary = (): MetricDef[] => useGroup(hexRoadSummary);
export const useHexSubscores = (): MetricDef[] => useGroup(hexSubscores);
export const useHexInputs = (): MetricDef[] => useGroup(hexInputs);
export const useHexObserved = (): MetricDef[] => useGroup(hexObserved);
export const useHexAmenityCounts = (): MetricDef[] => useGroup(hexAmenityCounts);
export const useHexBikeCounts = (): MetricDef[] => useGroup(hexBikeCounts);
export const useRoiToday = (): MetricDef[] => useGroup(roiToday);
export const useRoiShifted = (): MetricDef[] => useGroup(roiShifted);
export const useSegmentInputs = (): MetricDef[] => useGroup(segmentInputs);
export const useSegmentNetwork = (): MetricDef[] => useGroup(segmentNetwork);

/**
 * `formatValue` with the placeholder and boolean fallbacks already filled in
 * from the active language, so a panel never has to pass them.
 */
export function useFormatValue() {
  const t = useT();
  return useMemo(
    () => ({ noValue: "—", no: t.common.no, yes: t.common.yes }),
    [t]
  );
}
