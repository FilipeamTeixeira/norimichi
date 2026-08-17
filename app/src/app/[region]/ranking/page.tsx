"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RankingTable from "@/components/ranking/RankingTable";
import type {
  CorridorProperties,
  HexProperties,
  InvestmentRanking,
  ProgrammeLedger,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { useRegion } from "@/components/region/context";

/**
 * The whole-study-area ledger: what building every recommended corridor would
 * cost, against what a year of the modelled mode shift returns.
 *
 * This is the sentence the project's framing was built to produce and could
 * not write until the cost side existed — and it is the *only* place the two
 * sides may be put together, for a reason that is arithmetic rather than
 * rhetorical. Costs are summed over corridors, which is valid because they are
 * disjoint stretches of street. The benefit is not the sum of those corridors'
 * own benefit figures — their catchments overlap — but the hex-grid scenario,
 * where every resident sits in one cell and is counted once. Adding up the
 * table's own benefit column instead would multiply the same residents by
 * however many corridors happen to serve them.
 *
 * Rendered above the table rather than as a footnote: a reader who takes one
 * thing from this page should take this.
 */
function Ledger({ ledger }: { ledger: ProgrammeLedger }) {
  const t = useT();
  const tl = t.ranking.ledger;
  const yen = t.units.yenBig;

  const payback =
    ledger.payback_years_low !== null && ledger.payback_years_high !== null
      ? `${ledger.payback_years_low.toFixed(1)}–${ledger.payback_years_high.toFixed(1)}`
      : null;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] px-5 py-4 mb-5">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Figure
          label={tl.cost(ledger.costed_corridors)}
          value={`${yen(ledger.total_cost_yen_low)}–${yen(ledger.total_cost_yen_high)}`}
        />
        <Figure label={tl.benefit} value={`${yen(ledger.annual_benefit_yen)}`} />
        {payback && (
          <Figure
            label={tl.payback}
            value={t.units.years(payback)}
            emphasis
          />
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-400 mt-3 max-w-3xl">
        {tl.caveat}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
        {label}
      </div>
      <div
        className={cn(
          "tabular-nums mt-0.5",
          emphasis
            ? "text-[19px] font-semibold text-neutral-900"
            : "text-[17px] text-neutral-800"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function RankingPage() {
  const t = useT();
  const { data, href } = useRegion();
  const router = useRouter();
  const [ranking, setRanking] = useState<InvestmentRanking | null>(null);
  const [hexes, setHexes] = useState<HexProperties[] | null>(null);
  const [tab, setTab] = useState<"corridors" | "areas">("corridors");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(data("investment_ranking.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d: InvestmentRanking) => setRanking(d))
      .catch((e: Error) => setError(e.message));
  }, [data]);

  // The hex overview is a secondary view, so its data only loads if asked for.
  useEffect(() => {
    if (tab !== "areas" || hexes) return;
    fetch(data("hexagons.geojson"))
      .then((r) => r.json())
      .then((d) =>
        setHexes(
          d.features.map((f: { properties: HexProperties }) => f.properties)
        )
      )
      .catch(() => setHexes([]));
  }, [tab, hexes, data]);

  const rankedHexes = useMemo(() => {
    if (!hexes) return [];
    return hexes
      .filter((h) => (h.gap_score ?? 0) > 0)
      .sort((a, b) => (b.gap_score ?? 0) - (a.gap_score ?? 0));
  }, [hexes]);

  /**
   * F.6: hand the corridor to the Network tab rather than opening a detail view
   * here, so the two pages stay one tool. The Network page already owns segment
   * selection, the map and the info panel — it takes `corridor` from the query
   * string, fits the map to the corridor's extent and selects its longest
   * member. Only the id travels; the network page reads the rest off
   * segments.geojson, which it loads anyway.
   */
  const openOnMap = (c: CorridorProperties) => {
    // Within the current region: corridor ids are assigned per region, so this
    // link only means anything alongside the study area it came from.
    router.push(`${href("/")}?corridor=${c.corridor_id}`);
  };

  return (
    <main className="flex-1 bg-[#F7F8FA] overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <h1 className="text-lg font-semibold text-neutral-900 mb-1">
          {t.ranking.title}
        </h1>
        <p className="text-sm text-neutral-500 mb-5 max-w-2xl leading-relaxed">
          {t.ranking.lede}
        </p>

        <div className="flex items-center gap-1 mb-5 border-b border-neutral-200">
          {(
            [
              ["corridors", t.ranking.tabs.corridors],
              ["areas", t.ranking.tabs.areas],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "text-[13px] px-3 py-2 border-b-2 -mb-px transition-colors",
                tab === id
                  ? "border-neutral-900 text-neutral-900 font-medium"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "corridors" ? (
          error ? (
            <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {t.ranking.loadError(error)}
            </p>
          ) : !ranking ? (
            <p className="text-sm text-neutral-400">{t.common.loading}</p>
          ) : (
            <>
              {ranking.ledger && <Ledger ledger={ranking.ledger} />}
              <RankingTable
                corridors={ranking.corridors}
                onSelect={openOnMap}
              />
            </>
          )
        ) : (
          <>
            <p className="text-sm text-neutral-500 mb-4 max-w-2xl leading-relaxed">
              {t.ranking.areas.lede}
            </p>
            {hexes === null ? (
              <p className="text-sm text-neutral-400">{t.common.loading}</p>
            ) : (
              <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-left">
                      {[
                        t.ranking.areas.columns.rank,
                        t.ranking.areas.columns.area,
                        t.ranking.areas.columns.gap,
                        t.ranking.areas.columns.population,
                        t.ranking.areas.columns.stress,
                        t.ranking.areas.columns.savings,
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            "px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider",
                            i >= 2 && "text-right"
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {rankedHexes.slice(0, 50).map((h, i) => (
                      <tr
                        key={h.hex_id}
                        className="hover:bg-neutral-50 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-700 font-mono text-xs">
                          {h.hex_id.slice(-6)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-neutral-900 tabular-nums">
                          {(h.gap_score ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-600 tabular-nums">
                          {Math.round(h.population).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-600 tabular-nums">
                          {h.stress_score.toFixed(1)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-600 tabular-nums">
                          ¥
                          {Math.round(
                            h.roi_congestion_savings_yen_day +
                              h.roi_operating_savings_yen_day +
                              h.roi_health_benefit_yen_day
                          ).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-neutral-400 mt-4 max-w-3xl">
              {t.ranking.areas.footnote}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
