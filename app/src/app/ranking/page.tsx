"use client";

import { useEffect, useState } from "react";
import type { HexProperties } from "@/lib/types";

interface RankedHex {
  hex_id: string;
  gap_score: number;
  population: number;
  stress_score: number;
  daily_savings_yen: number;
}

export default function RankingPage() {
  const [hexes, setHexes] = useState<RankedHex[]>([]);

  useEffect(() => {
    fetch("/data/hexagons.geojson")
      .then((r) => r.json())
      .then((data) => {
        const ranked: RankedHex[] = data.features
          .map(
            (f: { properties: HexProperties }) => {
              const p = f.properties;
              return {
                hex_id: p.hex_id,
                gap_score: p.gap_score ?? 0,
                population: p.population,
                stress_score: p.stress_score,
                daily_savings_yen:
                  p.roi_congestion_savings_yen_day +
                  p.roi_operating_savings_yen_day +
                  p.roi_health_benefit_yen_day,
              };
            }
          )
          .filter((h: RankedHex) => h.gap_score > 0)
          .sort((a: RankedHex, b: RankedHex) => b.gap_score - a.gap_score);
        setHexes(ranked);
      });
  }, []);

  return (
    <main className="flex-1 bg-[#F7F8FA] overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-lg font-semibold text-neutral-900 mb-1">
          Investment Ranking
        </h1>
        <p className="text-sm text-neutral-500 mb-6">
          Areas ranked by missed-opportunity score — highest gap between cycling
          demand and infrastructure quality.
        </p>

        {hexes.length === 0 ? (
          <p className="text-sm text-neutral-400">Loading...</p>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-left">
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                    Area
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-right">
                    Gap Score
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-right">
                    Population
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-right">
                    Stress
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider text-right">
                    Est. Daily Savings
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {hexes.slice(0, 50).map((h, i) => (
                  <tr
                    key={h.hex_id}
                    className="hover:bg-neutral-50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-neutral-400 font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700 font-mono text-xs">
                      {h.hex_id.slice(-6)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-neutral-900">
                      {h.gap_score.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-neutral-600">
                      {Math.round(h.population).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-neutral-600">
                      {h.stress_score.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-neutral-600">
                      ¥{Math.round(h.daily_savings_yen).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
