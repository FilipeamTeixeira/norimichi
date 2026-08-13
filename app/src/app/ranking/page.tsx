"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RankingTable from "@/components/ranking/RankingTable";
import type {
  CorridorProperties,
  HexProperties,
  InvestmentRanking,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export default function RankingPage() {
  const router = useRouter();
  const [ranking, setRanking] = useState<InvestmentRanking | null>(null);
  const [hexes, setHexes] = useState<HexProperties[] | null>(null);
  const [tab, setTab] = useState<"corridors" | "areas">("corridors");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/investment_ranking.json")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d: InvestmentRanking) => setRanking(d))
      .catch((e: Error) => setError(e.message));
  }, []);

  // The hex overview is a secondary view, so its data only loads if asked for.
  useEffect(() => {
    if (tab !== "areas" || hexes) return;
    fetch("/data/hexagons.geojson")
      .then((r) => r.json())
      .then((d) =>
        setHexes(
          d.features.map((f: { properties: HexProperties }) => f.properties)
        )
      )
      .catch(() => setHexes([]));
  }, [tab, hexes]);

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
    router.push(`/?corridor=${c.corridor_id}`);
  };

  return (
    <main className="flex-1 bg-[#F7F8FA] overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <h1 className="text-lg font-semibold text-neutral-900 mb-1">
          Investment Ranking
        </h1>
        <p className="text-sm text-neutral-500 mb-5 max-w-2xl leading-relaxed">
          Fundable projects, ranked. Each row is a corridor — stretches of one
          street that run end to end into each other and are all worth
          spending money on — not a single OSM way, so a row is something that
          can actually be built.
        </p>

        <div className="flex items-center gap-1 mb-5 border-b border-neutral-200">
          {(
            [
              ["corridors", "Corridors"],
              ["areas", "Areas"],
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
              Could not load investment_ranking.json ({error}). Run
              pipeline/scripts/05d_score_interventions.R then
              12_compute_investment_ranking.R.
            </p>
          ) : !ranking ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <RankingTable
              corridors={ranking.corridors}
              onSelect={openOnMap}
            />
          )
        ) : (
          <>
            <p className="text-sm text-neutral-500 mb-4 max-w-2xl leading-relaxed">
              The strategic overview: areas ranked by missed-opportunity score —
              the gap between cycling demand and infrastructure quality. Useful
              for deciding where to look; the Corridors tab is where the fundable
              items are.
            </p>
            {hexes === null ? (
              <p className="text-sm text-neutral-400">Loading…</p>
            ) : (
              <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-left">
                      {[
                        "Rank",
                        "Area",
                        "Gap score",
                        "Population",
                        "Stress",
                        "Est. daily savings",
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
              Yen figures come from score_roi.R&rsquo;s illustrative 20%
              mode-shift scenario. Two constants are from MLIT&rsquo;s official
              cost-benefit manual; the rest are labelled defaults. Treat them as
              order-of-magnitude.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
