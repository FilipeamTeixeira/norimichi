"use client";

import type {
  SegmentFeature,
  SegmentProperties,
  DisplayCategory,
} from "@/lib/types";
import {
  segmentSuitability,
  segmentCategory,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/types";

interface Props {
  segment: SegmentFeature;
  onClose: () => void;
}

function ScoreArc({ score, color }: { score: number; color: string }) {
  const r = 52;
  const startAngle = -220;
  const endAngle = 40;
  const totalAngle = endAngle - startAngle;
  const filledAngle = startAngle + (score / 100) * totalAngle;

  const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const describeArc = (cx: number, cy: number, radius: number, start: number, end: number) => {
    const s = polarToCartesian(cx, cy, radius, start);
    const e = polarToCartesian(cx, cy, radius, end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <svg width="120" height="100" viewBox="0 0 120 100">
      <path
        d={describeArc(60, 58, r, startAngle, endAngle)}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Skip the filled arc entirely at zero - a zero-length path with a
          round linecap renders as a stray dot. */}
      {score > 0 && (
        <path
          d={describeArc(60, 58, r, startAngle, filledAngle)}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      )}
      <text x="60" y="55" textAnchor="middle" style={{ fontSize: "32px", fontWeight: 700 }} className="fill-neutral-900">
        {score}
      </text>
      <text x="60" y="72" textAnchor="middle" style={{ fontSize: "12px" }} className="fill-neutral-400">
        / 100
      </text>
    </svg>
  );
}

function StatusIcon({ status }: { status: "bad" | "good" | "info" }) {
  if (status === "bad")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="#fee2e2" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  if (status === "good")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="#dcfce7" />
        <path d="M5 8l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#dbeafe" />
      <circle cx="8" cy="5.5" r="0.8" fill="#3b82f6" />
      <path d="M8 7.5v3.5" stroke="#3b82f6" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function FactorRow({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: "bad" | "good" | "info";
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-5 h-5 flex items-center justify-center text-neutral-400 shrink-0">
        {icon}
      </div>
      <span className="text-[13px] text-neutral-700 flex-1">{label}</span>
      <StatusIcon status={status} />
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-5 h-5 flex items-center justify-center text-neutral-400 shrink-0">
        {icon}
      </div>
      <span className="text-[13px] text-neutral-700 flex-1">{label}</span>
      <span className="text-[13px] font-semibold text-neutral-900">{value}</span>
    </div>
  );
}

function formatLength(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function NetworkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="3" cy="3" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.4 4.4l5.2 5.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Explains the segment's position in the network, which is what separates a
 * strategic bottleneck from a merely unpleasant road. Without this the red
 * colour reads as "dangerous", which is the interpretation the design
 * explicitly wants to avoid.
 */
function NetworkRole({
  p,
  category,
}: {
  p: SegmentProperties;
  category: DisplayCategory;
}) {
  // Nothing to say for data exported before the network analysis existed.
  if (p.display_category == null) return null;

  const islands = p.islands_adjacent ?? 0;
  const criticality = p.network_criticality_score ?? 0;

  let tone: string;
  let title: string;
  let body: string;

  if (category === "bottleneck" && islands >= 2) {
    tone = "bg-red-50 border-red-100 text-red-900";
    title = `Connects ${islands} separate low-stress areas`;
    body =
      "These areas are already calm enough to cycle in, but this segment is the only thing between them. Upgrading it merges them into one usable network.";
  } else if (category === "bottleneck") {
    tone = "bg-red-50 border-red-100 text-red-900";
    title = "On a corridor between separated calm areas";
    body = `Part of a short chain of stressful segments that together sever otherwise-connected low-stress areas. Connectivity value: ${criticality}/100.`;
  } else if (category === "low_priority") {
    tone = "bg-neutral-50 border-neutral-200 text-neutral-700";
    title = "Connects little of the network";
    body =
      "Stressful to cycle, but upgrading it in isolation would not join any separated calm areas — so it ranks below the bottlenecks despite the low score.";
  } else if (p.island_id != null) {
    tone = "bg-emerald-50 border-emerald-100 text-emerald-900";
    title = "Part of a connected low-stress area";
    body =
      "Already comfortable enough to cycle, and joined to a wider calm network rather than stranded on its own.";
  } else {
    tone = "bg-neutral-50 border-neutral-200 text-neutral-700";
    title = "Isolated low-stress segment";
    body =
      "Comfortable in itself, but not connected to a wider calm network — its usefulness depends on the stressful roads around it.";
  }

  return (
    <div className="px-5 pb-3">
      <h3 className="text-sm font-bold text-neutral-900 mb-1.5">Network role</h3>
      <div className={`rounded-lg border p-3 ${tone}`}>
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0 opacity-70">
            <NetworkIcon />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold leading-snug">{title}</p>
            <p className="text-[11.5px] leading-relaxed mt-1 opacity-80">{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SegmentInfoPanel({ segment, onClose }: Props) {
  const p: SegmentProperties = segment.properties;
  const score = segmentSuitability(p);
  const category = segmentCategory(p);
  const categoryColor = CATEGORY_COLORS[category];
  const hasCycleInfra = p.has_cycle_infra ?? p.infra_gap !== "high";
  const lanes = p.lanes_n ?? 2;
  const stationNearby = p.station_nearby ?? 0;
  const schoolNearby = p.school_nearby ?? 0;
  const isFlat = p.flat_terrain ?? true;
  const beneficiaries = p.estimated_beneficiaries ?? 0;

  return (
    <div className="absolute top-3 right-3 w-[340px] bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden z-10">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-neutral-900">
            {p.name ?? "Road segment"}
          </h2>
          <p className="text-[13px] text-neutral-500 mt-0.5">
            {p.highway ?? "road"} &middot; Segment #{p.way_id}
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: `${categoryColor}1a`, color: categoryColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: categoryColor }} />
            {CATEGORY_LABELS[category]}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-600 p-0.5 mt-0.5"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Score + Length */}
      <div className="px-5 pb-2 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium mb-0.5">Cycling score</p>
          <ScoreArc score={score} color={categoryColor} />
        </div>
        <div className="text-right">
          <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">Length</p>
          <p className="text-lg font-bold text-neutral-900 mt-1">{formatLength(p.length_m)}</p>
        </div>
      </div>

      {/* Why is the score low */}
      <div className="px-5 pb-2">
        <h3 className="text-sm font-bold text-neutral-900 mb-1">Why is the score low?</h3>
        <div className="divide-y divide-neutral-50">
          <FactorRow
            icon={<CycleIcon />}
            label={hasCycleInfra ? "Has cycling lane" : "No cycling lane"}
            status={hasCycleInfra ? "good" : "bad"}
          />
          <FactorRow
            icon={<LanesIcon />}
            label={`${lanes} lane${lanes !== 1 ? "s" : ""} · ${p.speed_kmh} km/h${p.speed_kmh > 40 ? " · High traffic" : ""}`}
            status={lanes > 2 || p.speed_kmh > 40 ? "bad" : "good"}
          />
          <FactorRow
            icon={<StationIcon />}
            label={stationNearby > 0 ? "Near station access" : "Blocks access to station"}
            status={stationNearby > 0 ? "good" : "bad"}
          />
          <FactorRow
            icon={<SlopeIcon />}
            label={isFlat ? "Flat slope" : `Slope ${p.mean_slope_deg != null ? `${p.mean_slope_deg.toFixed(1)}°` : ""}`}
            status={isFlat ? "good" : "info"}
          />
          {/* Informal parking is often the deciding factor in the LTS score
              (it pushes streets 2->3 and 3->4), so omitting it leaves scores
              looking unexplained when every other row reads green. */}
          <FactorRow
            icon={<ParkingIcon />}
            label={p.likely_informal_parking ? "Informal parking likely" : "No informal parking"}
            status={p.likely_informal_parking ? "bad" : "good"}
          />
          {/* Sidewalk availability is what separates a 67 from a 57 - it's
              the no-safe-option penalty in score_suitability.R. */}
          <FactorRow
            icon={<SidewalkIcon />}
            label={p.sidewalk_available ? "Sidewalk available" : "No sidewalk fallback"}
            status={p.sidewalk_available ? "good" : "bad"}
          />
        </div>
      </div>

      {/* Network role — the B.3 distinction, in plain language */}
      <NetworkRole p={p} category={category} />

      {/* Why does this matter */}
      <div className="px-5 pb-3">
        <h3 className="text-sm font-bold text-neutral-900 mb-1">Why does this matter?</h3>
        <div className="divide-y divide-neutral-50">
          <StatRow
            icon={<ResidentsIcon />}
            label="Residents nearby"
            value={beneficiaries > 0 ? `~${beneficiaries.toLocaleString()}` : "—"}
          />
          <StatRow
            icon={<SchoolIcon />}
            label="Schools"
            value={String(schoolNearby)}
          />
          <StatRow
            icon={<StationUsersIcon />}
            label="Stations"
            value={String(stationNearby)}
          />
          <StatRow
            icon={<TripsIcon />}
            label="Signals"
            value={String(p.traffic_signals_count)}
          />
        </div>
      </div>

      {/* Suggested intervention */}
      {p.recommendation && (
        <div className="mx-4 mb-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="12" r="3" stroke="white" strokeWidth="1.2" fill="none" />
                <circle cx="11" cy="12" r="3" stroke="white" strokeWidth="1.2" fill="none" />
                <path d="M5 12l2.5-8h3L13 12" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-700">Suggested intervention</p>
              <p className="text-[13px] font-bold text-emerald-900">{p.recommendation}</p>
            </div>
          </div>
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-emerald-700">Score</span>
              <span className="font-semibold text-emerald-900">
                {p.suitability_after != null ? `${score} → ${p.suitability_after}` : score}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700">Cost</span>
              <span className="font-semibold text-emerald-900">
                {p.cost_tier ?? (lanes >= 3 ? "High" : "Medium")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700">Beneficiaries</span>
              <span className="font-semibold text-emerald-900">
                {beneficiaries > 0 ? `~${beneficiaries.toLocaleString()} people` : "—"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CycleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="11.5" r="2.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="11.5" r="2.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 11.5L7 4h2.5l2 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LanesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 4v8M10 4v8" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
    </svg>
  );
}

function StationIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="2" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 14l2.5-3 2.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="5.5" y1="7" x2="10.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SlopeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 13l5-8 3 4 4-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ParkingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 11.5V5h2.2a2 2 0 010 4H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SidewalkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2v12M13 2v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 3.5v1.5M8 7v1.5M8 10.5V12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ResidentsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L2 5.5 8 9l6-3.5L8 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M4 7v3.5L8 13l4-2.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function StationUsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1" />
      <path d="M5.5 14l2.5-4 2.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TripsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12c2-4 4-8 6-8s4 4 6 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
