"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/i18n/context";
import { LOCALES, LOCALE_LABEL, LOCALE_SHORT } from "@/i18n/config";
import { useRegion } from "@/components/region/context";
import RegionSwitcher from "@/components/region/RegionSwitcher";

const tabs = [
  { key: "network", href: "/" },
  { key: "access", href: "/access" },
  { key: "route", href: "/route" },
  { key: "ranking", href: "/ranking" },
  { key: "about", href: "/about" },
] as const;

/**
 * Two languages, so a segmented control rather than a dropdown: both options
 * are worth showing at once, and each names itself in its own script — a reader
 * who cannot read the language currently on screen still has to be able to find
 * their own.
 */
function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <div
      role="radiogroup"
      aria-label={t.nav.language}
      className="flex items-center rounded-lg border border-neutral-200 p-0.5 gap-0.5"
    >
      {LOCALES.map((code) => {
        const selected = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LOCALE_LABEL[code]}
            onClick={() => setLocale(code)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              selected
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:bg-neutral-100"
            )}
          >
            {LOCALE_SHORT[code]}
          </button>
        );
      })}
    </div>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const t = useT();
  const { region, href } = useRegion();

  // "/yokohama/access" -> "/access", so the tab comparison below stays written
  // in terms of the routes rather than the current city.
  const withinRegion = pathname.startsWith(`/${region.slug}`)
    ? pathname.slice(region.slug.length + 1) || "/"
    : pathname;

  return (
    <nav className="h-14 border-b border-neutral-200 bg-white flex items-center px-6 shrink-0">
      <div className="flex items-center gap-3 mr-10">
        <Link href={href("/")} className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="8" cy="20" r="5" stroke="#1e293b" strokeWidth="1.5" fill="none" />
            <circle cx="20" cy="20" r="5" stroke="#1e293b" strokeWidth="1.5" fill="none" />
            <path d="M8 20l4-12h4l4 12" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M12 8h4" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[15px] font-semibold text-neutral-900 tracking-tight">
            Norimichi
          </span>
        </Link>
        <RegionSwitcher />
      </div>

      <div className="flex items-center gap-6">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? withinRegion === "/"
              : withinRegion.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={href(tab.href)}
              className={cn(
                "text-sm py-4 border-b-2 transition-colors whitespace-nowrap",
                active
                  ? "border-neutral-900 text-neutral-900 font-medium"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              )}
            >
              {t.nav[tab.key]}
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
