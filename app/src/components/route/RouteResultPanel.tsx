"use client";

import type { RouteScoreResponse } from "@/lib/route-types";
import { LTS_LABELS } from "@/lib/metrics";
import { STRESS_LINE } from "@/lib/scales";
import { SECONDS_PER_TRAFFIC_SIGNAL } from "@/lib/scoring-constants";
import PanelShell from "@/components/panels/PanelShell";
import FactorRow from "@/components/panels/FactorRow";

/**
 * The trip, said back to the reader. Mirrors SegmentInfoPanel's structure —
 * same shell, same factor rows, same green proposal-style card at the bottom —
 * because it is the same argument made about a journey instead of a street.
 *
 * The headline is deliberately not one blended comfort score. A 4km ride that
 * is 90% calm with one hostile block averages out to "moderate", which is the
 * single most misleading thing this page could say: the bad block is the whole
 * reason somebody doesn't make the trip. So the breakdown is a stacked bar over
 * the four LTS classes, and the worst stretch gets named.
 */

interface Props {
  result: RouteScoreResponse;
  onClose: () => void;
}

const km = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const mins = (v: number) => `${Math.round(v)} min`;
const yen = (v: number) => `¥${Math.round(v).toLocaleString()}`;

function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="px-5 pb-3">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
        {title}
      </h3>
      {children}
      {note && (
        <p className="text-[11px] leading-relaxed text-neutral-400 mt-1.5">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Two travel times, side by side, neither presented as the answer.
 *
 * The provider's is a generic cycling profile's guess and models no junctions
 * at all. Ours rides slower on the streets our own data calls hostile and then
 * charges for the traffic signals the pipeline counted — which is the entire
 * reason those were fetched. The gap between the two numbers is the finding.
 *
 * The `graph` provider reports nothing, because its route *was* chosen on our
 * own data and a second column would be the same number twice pretending to
 * corroborate itself. There the estimate stands alone, full width.
 */
function Times({ result }: { result: RouteScoreResponse }) {
  const { ours, reported, provider } = result;
  return (
    <div className={reported ? "grid grid-cols-2 gap-2" : "grid grid-cols-1"}>
      <div className="rounded-lg border border-neutral-900/10 bg-neutral-50 p-3">
        <p className="text-[10.5px] uppercase tracking-wider font-medium text-neutral-500">
          Our estimate
        </p>
        <p className="text-2xl font-bold text-neutral-900 leading-none mt-1">
          {Math.round(ours.minutes)}
          <span className="text-[13px] font-medium text-neutral-400 ml-1">
            min
          </span>
        </p>
        <p className="text-[11px] text-neutral-500 leading-snug mt-1.5">
          {Math.round(ours.riding_minutes)} riding +{" "}
          {Math.round(ours.signal_minutes)} at signals
        </p>
      </div>
      {reported ? (
        <div className="rounded-lg border border-neutral-200 p-3">
          <p className="text-[10.5px] uppercase tracking-wider font-medium text-neutral-400">
            {provider.label}
          </p>
          <p className="text-2xl font-bold text-neutral-400 leading-none mt-1">
            {Math.round(reported.minutes)}
            <span className="text-[13px] font-medium text-neutral-300 ml-1">
              min
            </span>
          </p>
          <p className="text-[11px] text-neutral-400 leading-snug mt-1.5">
            Generic profile, no signals modelled
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The stacked bar. Fixed four-class domain, so two routes are comparable. */
function ComfortBar({ result }: { result: RouteScoreResponse }) {
  const bands = result.stats.lts_bands;
  const any = bands.some((b) => b.length_m > 0);
  if (!any) return null;

  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
        {bands.map((b) =>
          b.share > 0 ? (
            <div
              key={b.lts}
              title={`LTS ${b.lts} — ${LTS_LABELS[b.lts - 1]}: ${km(
                b.length_m
              )}`}
              style={{
                width: `${b.share * 100}%`,
                backgroundColor: STRESS_LINE[b.lts - 1],
              }}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-col mt-2">
        {bands.map((b) =>
          b.share > 0 ? (
            <div
              key={b.lts}
              className="flex items-center gap-2.5 py-[3px]"
            >
              <span
                className="w-6 h-[3px] rounded-full shrink-0"
                style={{ backgroundColor: STRESS_LINE[b.lts - 1] }}
              />
              <span className="text-[12px] text-neutral-500 leading-snug">
                {b.lts} — {LTS_LABELS[b.lts - 1].toLowerCase()}
              </span>
              <span className="text-[12px] font-medium text-neutral-900 tabular-nums ml-auto shrink-0">
                {pct(b.share)}
              </span>
            </div>
          ) : null
        )}
      </div>
    </>
  );
}

/**
 * The one bad block, named. Reinforces the project's framing at the scale of a
 * single trip: this is a specific fixable thing on a specific street, not a
 * verdict on the journey.
 */
function WorstStretch({ result }: { result: RouteScoreResponse }) {
  const worst = result.stats.worst;
  if (!worst || worst.lts <= 2) return null;

  const reasons = [
    !worst.has_cycle_infra && "no cycle infrastructure",
    !worst.sidewalk_available && "no sidewalk to fall back on",
    worst.likely_informal_parking && "likely kerbside parking",
    worst.speed_kmh != null && worst.speed_kmh >= 50 && `${worst.speed_kmh}km/h limit`,
  ].filter(Boolean) as string[];

  return (
    <div className="px-5 pb-3">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
        Worst stretch
      </h3>
      <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-900">
        <p className="text-[12.5px] font-semibold leading-snug">
          {worst.name ?? `Unnamed ${worst.highway ?? "road"}`} ·{" "}
          {km(worst.matched_length_m)}
        </p>
        <p className="text-[11.5px] leading-relaxed mt-1 opacity-80">
          LTS {worst.lts} — {LTS_LABELS[worst.lts - 1].toLowerCase()}
          {reasons.length > 0 && `: ${reasons.join(", ")}`}.
        </p>
      </div>
    </div>
  );
}

/**
 * The same MLIT unit values score_roi.R applies to a whole ward, applied to one
 * trip. Order-of-magnitude framing, not an audit — the two yen figures are
 * sourced, the CO₂ factor and health value are illustrative defaults.
 */
function CarComparison({ result }: { result: RouteScoreResponse }) {
  const { car } = result;
  return (
    <div className="mx-4 mb-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
      <p className="text-xs font-semibold text-emerald-700">
        If you drove this instead
      </p>
      <p className="text-[11px] text-emerald-700/70 leading-relaxed mt-0.5 mb-2.5">
        ~{mins(car.minutes)} by car door to door, at the same effective urban
        speed the study-area ROI assumes.
      </p>
      <div className="space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <span className="text-emerald-700">Time value</span>
          <span className="font-semibold text-emerald-900">
            {yen(car.time_value_yen)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-emerald-700">Running cost</span>
          <span className="font-semibold text-emerald-900">
            {yen(car.operating_cost_yen)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-emerald-700">CO&#8322;</span>
          <span className="font-semibold text-emerald-900">
            {car.co2_kg.toFixed(2)} kg
          </span>
        </div>
        <div className="flex justify-between border-t border-emerald-200/70 pt-1.5">
          <span className="text-emerald-700">Health value of cycling it</span>
          <span className="font-semibold text-emerald-900">
            {yen(car.health_benefit_yen)}
          </span>
        </div>
      </div>
      <p className="text-[10.5px] text-emerald-700/60 leading-relaxed mt-2.5">
        ¥43.74/min and ¥24.43/km are MLIT&rsquo;s official appraisal units
        (令和6年価格). The CO&#8322; factor and the health value per km are
        illustrative defaults — see score_roi.R.
      </p>
    </div>
  );
}

function Facilities({ result }: { result: RouteScoreResponse }) {
  const { facilities } = result;
  const parking = facilities.filter((f) => f.facility_type === "parking");
  const sharing = facilities.filter((f) => f.facility_type === "sharing");

  return (
    <Section
      title="At the destination"
      note="Within 300 m of B — the same radius the hex-level counts use."
    >
      {facilities.length === 0 ? (
        <p className="text-[12px] text-neutral-500 leading-relaxed">
          No bike parking or sharing dock recorded within 300 m. Somewhere to
          leave the bike is part of whether the trip works.
        </p>
      ) : (
        <>
          <FactorRow
            label="Bike parking sites"
            value={String(parking.length)}
            tone={parking.length > 0 ? "good" : "bad"}
          />
          <FactorRow
            label="Sharing docks"
            value={String(sharing.length)}
            tone="neutral"
          />
          <div className="flex flex-col mt-1.5 gap-1">
            {facilities.slice(0, 4).map((f) => (
              <div
                key={f.osm_id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-[11.5px] text-neutral-600 truncate">
                  {f.name ??
                    (f.facility_type === "parking"
                      ? "Bike parking"
                      : "Sharing dock")}
                  {f.capacity != null && (
                    <span className="text-neutral-400"> · {f.capacity}</span>
                  )}
                </span>
                <span className="text-[11.5px] text-neutral-400 tabular-nums shrink-0">
                  {Math.round(f.distance_m)} m
                </span>
              </div>
            ))}
            {facilities.length > 4 && (
              <span className="text-[11px] text-neutral-400">
                + {facilities.length - 4} more
              </span>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

export default function RouteResultPanel({ result, onClose }: Props) {
  const s = result.stats;
  const poorMatch = s.matched_share < 0.8;

  return (
    <PanelShell
      title="This trip"
      subtitle={`${km(s.total_length_m)} · ${s.segments.length} street${
        s.segments.length === 1 ? "" : "s"
      }`}
      onClose={onClose}
    >
      <div className="px-5 pb-4">
        <Times result={result} />
      </div>

      <Section
        title="Comfort along the way"
        note="Share of the route by traffic stress class. Shown as a breakdown rather than one blended score, because a mostly-calm route with one hostile block is exactly the case an average hides."
      >
        <ComfortBar result={result} />
      </Section>

      <WorstStretch result={result} />

      <Section title="Exposure">
        <FactorRow
          label="No sidewalk to fall back on"
          value={pct(s.no_sidewalk_share)}
          hint="Share of the route where there is neither cycle infrastructure nor a footway to retreat to."
          tone={s.no_sidewalk_share > 0.25 ? "bad" : "good"}
        />
        <FactorRow
          label="Likely kerbside parking"
          value={`${pct(s.informal_parking_share)} · ${
            s.informal_parking_segments
          } street${s.informal_parking_segments === 1 ? "" : "s"}`}
          hint="Parked cars that push a rider out into moving traffic — often the deciding factor in the stress score."
          tone={s.informal_parking_share > 0.15 ? "bad" : "good"}
        />
        <FactorRow
          label="On existing cycle provision"
          value={pct(s.cycle_infra_share)}
          tone={s.cycle_infra_share > 0 ? "good" : "bad"}
        />
        <FactorRow
          label="Signalised junctions"
          value={String(s.signal_junctions)}
          hint={`Junctions the route passes through, not signal heads it passes — OSM tags one per approach. Charged at ${SECONDS_PER_TRAFFIC_SIGNAL}s each, an illustrative constant.`}
        />
        <FactorRow
          label="Mean traffic stress"
          value={s.mean_lts.toFixed(1)}
          hint="Length-weighted over the matched part of the route. 1 calm, 4 hostile."
        />
      </Section>

      <Facilities result={result} />

      {/* The match is the one thing between ORS's geometry and everything
          above, so when it goes badly the reader is told rather than handed a
          confident number built on a third of the trip. */}
      {poorMatch && (
        <div className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-[12px] font-semibold text-amber-900 leading-snug">
            {pct(1 - s.matched_share)} of this route matched no street in our
            data
          </p>
          <p className="text-[11px] leading-relaxed text-amber-900/80 mt-1">
            Everything above describes the {pct(s.matched_share)} that did
            match. This usually means the route left the study area or ran along
            a path our OSM extract does not carry.
          </p>
        </div>
      )}

      <CarComparison result={result} />
    </PanelShell>
  );
}
