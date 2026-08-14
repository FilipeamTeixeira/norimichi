"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Network", href: "/" },
  { label: "Route Analysis", href: "/route" },
  { label: "Investment Ranking", href: "/ranking" },
  { label: "About", href: "/about" },
] as const;

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="h-14 border-b border-neutral-200 bg-white flex items-center px-6 shrink-0">
      <div className="flex items-center gap-2.5 mr-10">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="8" cy="20" r="5" stroke="#1e293b" strokeWidth="1.5" fill="none" />
          <circle cx="20" cy="20" r="5" stroke="#1e293b" strokeWidth="1.5" fill="none" />
          <path d="M8 20l4-12h4l4 12" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M12 8h4" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[15px] font-semibold text-neutral-900 tracking-tight">
          Norimichi
        </span>
      </div>

      <div className="flex items-center gap-6">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "text-sm py-4 border-b-2 transition-colors",
                active
                  ? "border-neutral-900 text-neutral-900 font-medium"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-neutral-400">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-neutral-400">Search place...</span>
        </div>
      </div>
    </nav>
  );
}
