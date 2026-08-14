"use client";

import AddressSearch, { type Endpoint } from "@/components/route/AddressSearch";
import type { ProviderInfo, RouteErrorKind } from "@/lib/route-types";
import type { RouteAlternative, RouteType } from "@/lib/routing/types";
import { useT } from "@/i18n/context";

/**
 * The left rail on the Route Analysis page, in the slot FilterSidebar occupies
 * on the network view — same width, same section rhythm, so switching tabs
 * doesn't feel like switching applications.
 *
 * Either end can be set by searching for an address or by clicking the map,
 * and neither is the fallback for the other: a commute is remembered by name
 * at one end ("Yamashita Park") and by sight at the other ("that corner"). The
 * two share a single field per end so the panel always reads as one answer per
 * end rather than as two competing inputs — see AddressSearch.
 */

export type PinTarget = "origin" | "destination";

interface Props {
  origin: Endpoint | null;
  destination: Endpoint | null;
  /** Which end the next map click sets. */
  next: PinTarget;
  onNextChange: (target: PinTarget) => void;
  /** An address picked from search, for one end. */
  onPick: (target: PinTarget, at: [number, number], label: string) => void;
  /** Drop one end without touching the other. */
  onClearOne: (target: PinTarget) => void;
  onClear: () => void;
  onSwap: () => void;
  loading: boolean;
  error: { kind: RouteErrorKind; message: string } | null;
  /** True when the last result came from the coordinate cache, not a provider. */
  cached: boolean;
  /**
   * Which backend drew the last route, or null before there is one. The
   * disclosure text below is a claim about how the path was chosen, and that
   * claim is different for each provider — so it cannot be static copy.
   */
  provider: ProviderInfo | null;
  routeType: RouteType;
  onRouteTypeChange: (value: RouteType) => void;
  alternative: RouteAlternative;
  onAlternativeChange: (value: RouteAlternative) => void;
}

/**
 * BRouter will return up to four routes per profile, ordered by its own cost:
 * 0 is the optimum and the rest are progressively costlier ways round. Two are
 * offered here because two is what a reader will actually compare — the other
 * two are a one-line addition to this array if they ever earn their place.
 */
/**
 * The second opinion, where there is one.
 *
 * Only BRouter offers this. Dijkstra returns *the* optimum, so the graph
 * provider has nothing to show without a k-shortest-paths implementation, and
 * ORS's alternatives are an unwired opt-in that would multiply quota cost. The
 * control is hidden rather than disabled for those two: a greyed-out row that
 * can never light up is furniture, not information — the route-preference note
 * above already names the active provider.
 */
function AlternativeSelector({
  value,
  onChange,
  disabled,
  provider,
}: {
  value: RouteAlternative;
  onChange: (value: RouteAlternative) => void;
  disabled: boolean;
  provider: ProviderInfo | null;
}) {
  const t = useT();
  const options = [
    { value: 0 as RouteAlternative, ...t.route.input.alternatives.original },
    { value: 1 as RouteAlternative, ...t.route.input.alternatives.first },
  ];

  if (!provider?.supports_alternatives) return null;

  return (
    <div className="px-5 pb-4">
      <p className="text-[10.5px] uppercase tracking-wider font-medium text-neutral-500 mb-1.5">
        {t.route.input.whichRoute}
      </p>
      <div
        role="radiogroup"
        aria-label={t.route.input.whichRoute}
        className="flex rounded-lg border border-neutral-200 p-0.5 gap-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={option.hint}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={[
                "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                selected
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-400 leading-snug mt-1.5">
        {options.find((o) => o.value === value)?.hint}
      </p>
    </div>
  );
}

/**
 * The three route types, and what each actually means to a rider.
 *
 * The descriptions are deliberately about the *trade* rather than the label —
 * "relaxed" on its own tells nobody that it will lengthen the trip, which is
 * the only thing worth knowing before picking it.
 */
const ROUTE_TYPE_ORDER = ["relaxed", "efficient", "quick"] as const;

/**
 * Three cost models over one network, not three vehicles.
 *
 * Whether this control does anything depends on the active provider, and it
 * has to say so rather than let the reader infer that three labels mean three
 * answers: `graph` and `brouter` honour it, `ors` takes it and ignores it. The
 * provider is unknown until a first result comes back, so before then the
 * control is shown plainly with no claim attached.
 */
function RouteTypeSelector({
  value,
  onChange,
  disabled,
  provider,
}: {
  value: RouteType;
  onChange: (value: RouteType) => void;
  disabled: boolean;
  provider: ProviderInfo | null;
}) {
  const t = useT();
  const options = ROUTE_TYPE_ORDER.map((key) => ({
    value: key as RouteType,
    ...t.route.input.routeTypes[key],
  }));
  const inert = provider !== null && !provider.supports_route_types;

  return (
    <div className="px-5 pb-4">
      <p className="text-[10.5px] uppercase tracking-wider font-medium text-neutral-500 mb-1.5">
        {t.route.input.routePreference}
      </p>
      <div
        role="radiogroup"
        aria-label={t.route.input.routePreference}
        className="flex rounded-lg border border-neutral-200 p-0.5 gap-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={option.hint}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={[
                "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                selected
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-400 leading-snug mt-1.5">
        {inert
          ? t.route.input.routeTypeInert(
              provider?.label ?? t.route.input.disclosure.externalFallback
            )
          : options.find((o) => o.value === value)?.hint}
      </p>
    </div>
  );
}

/**
 * Failure states the reader can act on, separated from the ones they can't.
 * The free ORS tier is 2,000 directions requests a day, so running out is a
 * normal Tuesday for this app rather than an incident — and it has to say so
 * in those words instead of failing silently or blaming the reader's input.
 */
function ErrorNote({
  kind,
  message,
}: {
  kind: RouteErrorKind;
  /** The server's own wording, used only where the kind has none of its own. */
  message: string;
}) {
  const t = useT();
  const copy = t.errors.route[kind];
  const amber = kind === "quota" || kind === "unavailable";
  return (
    <div
      className={`rounded-lg border p-3 ${
        amber
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-red-50 border-red-200 text-red-900"
      }`}
    >
      <p className="text-[12px] font-semibold leading-snug">{copy.title}</p>
      <p className="text-[11px] leading-relaxed mt-1 opacity-80">
        {copy?.message ?? message}
      </p>
    </div>
  );
}

export default function RouteInputPanel({
  origin,
  destination,
  next,
  onNextChange,
  onPick,
  onClearOne,
  onClear,
  onSwap,
  loading,
  error,
  cached,
  provider,
  routeType,
  onRouteTypeChange,
  alternative,
  onAlternativeChange,
}: Props) {
  const t = useT();
  const ti = t.route.input;
  // Before the first result there is no provider to describe, and the ORS
  // fallback is the honest thing to assume least about — so the text below
  // falls back to the generic wording rather than naming anything.
  const routesOnOurData = provider?.id === "graph";
  return (
    <aside className="w-[268px] border-r border-neutral-200 bg-white shrink-0 overflow-y-auto flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-base font-bold text-neutral-900 leading-tight">
          {ti.title}
        </h2>
        <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
          {ti.caption}
        </p>
      </div>

      <div className="px-5 pb-4 flex flex-col gap-1.5">
        <AddressSearch
          label={ti.start}
          letter="A"
          placeholder={ti.searchPlaceholder}
          value={origin}
          active={next === "origin"}
          onFocus={() => onNextChange("origin")}
          onPick={(at, label) => onPick("origin", at, label)}
          onClear={() => onClearOne("origin")}
        />
        <AddressSearch
          label={ti.destination}
          letter="B"
          placeholder={ti.searchPlaceholder}
          value={destination}
          active={next === "destination"}
          onFocus={() => onNextChange("destination")}
          onPick={(at, label) => onPick("destination", at, label)}
          onClear={() => onClearOne("destination")}
        />
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onSwap}
            disabled={!origin || !destination}
            className="text-[11px] font-medium text-neutral-600 hover:text-neutral-900 disabled:text-neutral-300 disabled:hover:text-neutral-300"
          >
            {ti.reverse}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!origin && !destination}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 disabled:text-neutral-300 disabled:hover:text-neutral-300"
          >
            {ti.clear}
          </button>
          {loading && (
            <span className="text-[11px] text-neutral-500 ml-auto">
              {ti.scoring}
            </span>
          )}
          {!loading && cached && (
            <span
              className="text-[11px] text-neutral-400 ml-auto"
              title={ti.cachedHelp}
            >
              {ti.cached}
            </span>
          )}
        </div>
      </div>

      <RouteTypeSelector
        value={routeType}
        onChange={onRouteTypeChange}
        disabled={loading}
        provider={provider}
      />

      <AlternativeSelector
        value={alternative}
        onChange={onAlternativeChange}
        disabled={loading}
        provider={provider}
      />

      {error && (
        <div className="px-5 pb-4">
          <ErrorNote kind={error.kind} message={error.message} />
        </div>
      )}

      {/* The limitation this page has to state out loud rather than leave for
          whoever reads the docs. See PROJECT_STATUS.md C.3. Which limitation
          applies depends on the provider: an external router cannot avoid a
          hostile road, and our own router can but is only as good as the data
          under it. Both are worth saying; neither is worth saying about the
          other. */}
      <div className="px-5 py-4 border-t border-neutral-200">
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">
          {ti.disclosure.title}
        </h3>
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          {routesOnOurData
            ? ti.disclosure.onOurData
            : ti.disclosure.external(
                provider?.label ?? ti.disclosure.externalFallback
              )}
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-400 px-5 py-4 border-t border-neutral-200 italic mt-auto">
        {ti.sources(
          provider?.label ?? ti.sourcesProviderFallback,
          provider ? ` (${provider.route_type})` : ""
        )}
      </p>
    </aside>
  );
}
