"use client";

import Link from "next/link";
import PanelShell from "@/components/panels/PanelShell";
import FactorRow from "@/components/panels/FactorRow";
import { ACCESS_SURFACE } from "@/lib/scales";
import { useT } from "@/i18n/context";
import { useRegion } from "@/components/region/context";
import {
  bandAt,
  unlockAt,
  type AccessIndex,
  type AccessOrigin,
} from "@/lib/access-types";

/**
 * What the selected origin's surface says, in words and numbers.
 *
 * Three claims, in descending order of how safe they are to quote:
 *
 *  1. the share cut off — both sides of the subtraction share every constant
 *     in R/score_access.R, so this survives them;
 *  2. the counts, including children — order-of-magnitude, like every other
 *     population figure this project derives from a mesh;
 *  3. what upgrading one street would recover — a counterfactual, and labelled
 *     as one, in exactly the register the intervention card uses on the
 *     Network tab.
 *
 * The third is why this page is not just a lament. Each frontier corridor is a
 * row on the Investment Ranking, so the panel hands off to it rather than
 * restating it: a reader who asks "so fix it" lands on the page that costs it.
 */

interface Props {
  origin: AccessOrigin;
  index: AccessIndex;
  bandM: number;
  onClose: () => void;
}

export default function AccessPanel({ origin, index, bandM, onClose }: Props) {
  const t = useT();
  const { href } = useRegion();
  const ta = t.access;
  const band = bandAt(origin, bandM);
  const km = bandM / 1000;

  const pct = (v: number | null) =>
    v === null ? "—" : `${Math.round(v * 100)}%`;
  const n = (v: number) => Math.round(v).toLocaleString();

  return (
    <PanelShell
      title={origin.name}
      subtitle={origin.detail ?? undefined}
      badge={
        <span className="inline-block mt-1.5 text-[11px] rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-500">
          {origin.kind === "school" && origin.school_class
            ? ta.schoolClasses[origin.school_class]
            : ta.kinds[origin.kind]}
        </span>
      }
      onClose={onClose}
    >
      <div className="px-5 pb-5">
        {!origin.snapped ? (
          <p className="mt-3 text-[12px] leading-relaxed text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
            {ta.panel.unsnapped(index.buffer_m)}
          </p>
        ) : (
          <>
            {/* The headline. Written as a sentence rather than as a stat tile
                because the subject — a child, a resident — is the point, and
                a bare "38%" beside a school name invites the reader to supply
                their own subject for it. */}
            <p className="mt-3 text-[13px] leading-relaxed text-neutral-700">
              {ta.panel.headline({
                km,
                any: n(band.population_any),
                calm: n(band.population_calm),
              })}
            </p>

            <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-neutral-100">
              <span
                className="h-full"
                style={{
                  width: `${band.population_any > 0 ? (band.population_calm / band.population_any) * 100 : 0}%`,
                  backgroundColor: ACCESS_SURFACE.calm,
                }}
              />
              <span
                className="h-full"
                style={{
                  width: `${band.population_any > 0 ? (band.severed / band.population_any) * 100 : 0}%`,
                  backgroundColor: ACCESS_SURFACE.severed,
                }}
              />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-[11px] text-neutral-500">
                {ta.panel.severedLabel}
              </span>
              <span className="text-[15px] font-semibold text-neutral-900 tabular-nums">
                {n(band.severed)}{" "}
                <span className="text-[12px] font-normal text-neutral-400">
                  ({pct(band.severed_share)})
                </span>
              </span>
            </div>

            {!origin.calm_at_gate && (
              <p className="mt-3 text-[12px] leading-relaxed text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {ta.panel.noCalmAtGate(index.calm_max_lts)}
              </p>
            )}

            <Section title={ta.panel.whoTitle}>
              <FactorRow
                label={ta.panel.residents}
                value={`${n(band.population_calm)} / ${n(band.population_any)}`}
              />
              {index.mesh.has_child_band && (
                <FactorRow
                  label={ta.panel.children}
                  value={`${n(band.population_child_calm)} / ${n(band.population_child_any)}`}
                />
              )}
              {index.mesh.has_elderly_band && (
                <FactorRow
                  label={ta.panel.elderly}
                  value={`${n(band.population_elderly_calm)} / ${n(band.population_elderly_any)}`}
                />
              )}
              <FactorRow
                label={ta.panel.cells}
                value={`${band.cells_calm} / ${band.cells_any}`}
                hint={ta.panel.cellsHint(index.mesh.cell_size_m, index.buffer_m)}
              />
            </Section>

            {origin.frontier.length > 0 && (
              <Section
                title={ta.panel.frontierTitle}
                note={ta.panel.frontierNote(
                  origin.frontier.length,
                  origin.frontier_corridor_count
                )}
              >
                <div className="flex flex-col gap-1.5 mt-1">
                  {origin.frontier.map((c) => {
                    const gain = unlockAt(c, bandM);
                    return (
                      <Link
                        key={c.corridor_id}
                        href={`${href("/")}?corridor=${c.corridor_id}`}
                        className="block rounded-lg border border-neutral-200 px-3 py-2 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] text-neutral-900 truncate">
                            {c.name ?? c.corridor_id}
                          </span>
                          {gain && gain.population > 0 && (
                            <span className="text-[12px] font-semibold text-emerald-700 tabular-nums shrink-0">
                              +{n(gain.population)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-baseline justify-between gap-2">
                          <span className="text-[11px] text-neutral-400 truncate">
                            {c.recommendation ?? "—"}
                          </span>
                          {gain &&
                            gain.population > 0 &&
                            index.mesh.has_child_band &&
                            gain.population_child > 0 && (
                              <span className="text-[11px] text-neutral-400 shrink-0">
                                {ta.panel.ofWhichChildren(n(gain.population_child))}
                              </span>
                            )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
                  {ta.panel.unlockCaveat}
                </p>
              </Section>
            )}
          </>
        )}
      </div>
    </PanelShell>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 pt-3 border-t border-neutral-100">
      <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
        {title}
      </div>
      {note && (
        <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
          {note}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
