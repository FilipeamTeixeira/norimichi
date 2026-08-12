"use client";

import type { ReactNode } from "react";

/**
 * The shared chrome for the three click-through panels. They all sit in the
 * same corner and only one is ever open, so they need identical framing and a
 * height cap — a hexagon carries 25 attributes and would otherwise run off the
 * bottom of the map.
 */
export default function PanelShell({
  title,
  subtitle,
  badge,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute top-3 right-3 w-[340px] max-h-[calc(100%-1.5rem)] bg-white rounded-xl border border-neutral-200 shadow-xl overflow-y-auto z-10">
      <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-neutral-900 truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[13px] text-neutral-500 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
          {badge}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-400 hover:text-neutral-600 p-0.5 mt-0.5 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}
