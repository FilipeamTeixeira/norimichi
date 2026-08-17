"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useT } from "@/i18n/context";
import { regionLabel } from "@/lib/regions";
import { useRegion } from "./context";

/**
 * Which study area the app is showing.
 *
 * A native <select> rather than a styled popup. The list is not a handful of
 * fixed options like the language switcher — it grows every time a city is
 * published, and past a dozen entries the platform's own list (scrolling, type
 * to jump, a real sheet on mobile) beats anything reimplemented here.
 */
export default function RegionSwitcher() {
  const { region, regions } = useRegion();
  const { locale } = useLocale();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Same page, different region: "/yokohama/access" -> "/tokyo/access".
   *
   * The query string is deliberately dropped. `?corridor=` and the access
   * page's origin ids are row indexes assigned per region, so carrying them
   * across would not fail — it would resolve to an unrelated street in the
   * new city and look like it had worked.
   */
  const onChange = (slug: string) => {
    if (slug === region.slug) return;
    const rest = pathname.split("/").slice(2).join("/");
    router.push(`/${slug}${rest ? `/${rest}` : ""}`);
  };

  return (
    <div className="relative">
      <select
        aria-label={t.nav.region}
        value={region.slug}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-neutral-200 bg-white py-1.5 pl-2.5 pr-7 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
      >
        {regions.map((r) => (
          <option key={r.slug} value={r.slug}>
            {regionLabel(r, locale)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
      />
    </div>
  );
}
