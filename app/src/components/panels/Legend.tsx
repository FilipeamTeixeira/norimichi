function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-neutral-400">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
      <path d="M6 5.5v3M6 3.5v.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export default function Legend() {
  return (
    <div className="absolute bottom-8 left-6 z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-neutral-200 shadow-md px-5 py-3.5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[13px] font-semibold text-neutral-900">Cycling suitability</span>
        <InfoIcon />
      </div>
      <div className="flex flex-col gap-2">
        <LegendItem color="#22c55e" label="High (70 – 100)" />
        <LegendItem color="#f59e0b" label="Moderate (40 – 69)" />
        <LegendItem color="#ef4444" label="Bottleneck (0 – 39)" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-6 h-[3px] rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[12px] text-neutral-600">{label}</span>
    </div>
  );
}
