"use client";

import { createContext, useContext, useMemo } from "react";
import type { Region } from "@/lib/regions";
import { regionData } from "@/lib/regions";

interface RegionValue {
  /** The region this page is showing. */
  region: Region;
  /** Every published region, for the switcher. In pipeline config order. */
  regions: Region[];
  /** Path to one of the active region's data files. */
  data: (file: string) => string;
  /** Rewrite an in-app path onto the active region, e.g. "/access". */
  href: (path: string) => string;
}

/**
 * No default value, deliberately.
 *
 * Everything that reads this lives under app/[region]/layout.tsx, so there is
 * always a real region in scope. A fallback here would turn "this component
 * got mounted outside the region tree" — which would silently fetch the wrong
 * city's data — into something that renders.
 */
const RegionContext = createContext<RegionValue | null>(null);

export function RegionProvider({
  region,
  regions,
  children,
}: {
  region: Region;
  regions: Region[];
  children: React.ReactNode;
}) {
  const value = useMemo<RegionValue>(
    () => ({
      region,
      regions,
      data: (file) => regionData(region.slug, file),
      href: (path) => `/${region.slug}${path === "/" ? "" : path}`,
    }),
    [region, regions]
  );

  return (
    <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
  );
}

export function useRegion(): RegionValue {
  const value = useContext(RegionContext);
  if (!value) {
    throw new Error("useRegion() must be used under a RegionProvider");
  }
  return value;
}
