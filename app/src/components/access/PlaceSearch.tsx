"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, School, Search, TrainFront, X } from "lucide-react";
import {
  isGeocodeError,
  type GeocodeError,
  type GeocodeResponse,
  type GeocodeResult,
} from "@/lib/geocode-types";
import type { AccessOrigin } from "@/lib/access-types";
import { useT } from "@/i18n/context";
import { useRegion } from "@/components/region/context";

/**
 * One box, two ways of finding somewhere.
 *
 * The list below this is ranked by how cut off a place is, which is the right
 * default and the wrong way to locate one specific school among 135. A plain
 * substring filter over that list only helps a reader who already knows the
 * name — and the names here are KSJ's, so a station is 「石川町」 and not
 * 「石川町駅」, and a school is its formal name rather than the one anybody
 * says. Neither is guessable.
 *
 * So the box searches two indexes at once and says which is which:
 *
 *   - **the origins themselves**, matched locally on name and address. Instant,
 *     no request, and the only path that ends in a surface being drawn.
 *   - **places**, through /api/geocode — the same Photon proxy the Route
 *     Analysis page uses, already bounded to the study area. Picking one does
 *     not select anything: it sets a point to measure *from*, and the list
 *     re-sorts to the schools and stations nearest it.
 *
 * That second path is the one a resident actually has. They know where they
 * live; they do not know which of 106 schools is the one down the road.
 *
 * Geocoding is a free service with no availability guarantee, so it stays a
 * convenience over an index that works without it: when the lookup fails the
 * local matches are still there and the dropdown says what happened.
 */

/** Long enough that single letters don't fire a request, short enough for "本牧". */
const MIN_GEOCODE_LENGTH = 2;
/** A pause in typing rather than a gap between characters. Same as AddressSearch. */
const DEBOUNCE_MS = 300;
const MAX_LOCAL_RESULTS = 6;

type Row =
  | { kind: "origin"; origin: AccessOrigin }
  | { kind: "place"; result: GeocodeResult };

interface Props {
  origins: AccessOrigin[];
  onPickOrigin: (origin: AccessOrigin) => void;
  onPickPlace: (at: [number, number], label: string) => void;
}

export default function PlaceSearch({
  origins,
  onPickOrigin,
  onPickPlace,
}: Props) {
  const t = useT();
  const { region } = useRegion();
  const ts = t.access.search;
  const listId = useId();

  const [text, setText] = useState("");
  const [places, setPlaces] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    },
    []
  );

  const localMatches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return origins
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.detail ?? "").toLowerCase().includes(q)
      )
      .slice(0, MAX_LOCAL_RESULTS);
  }, [origins, text]);

  /** Flattened, because the highlight moves through both groups as one list. */
  const rows = useMemo<Row[]>(
    () => [
      ...localMatches.map((origin) => ({ kind: "origin" as const, origin })),
      ...places.map((result) => ({ kind: "place" as const, result })),
    ],
    [localMatches, places]
  );

  const run = useCallback(
    async (query: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(query)}&region=${region.slug}`,
          {
            signal: controller.signal,
          }
        );
        const body = (await res.json()) as GeocodeResponse | GeocodeError;
        if (controller.signal.aborted) return;

        if (isGeocodeError(body)) {
          setPlaces([]);
          /**
           * Not the server's sentence, and not `t.errors.geocode.unavailable`
           * either. Both are written for the Route Analysis page and end in
           * "click the map to set the trip instead" — advice that is false
           * here, where there is no trip and clicking the map does nothing.
           * The fallback this page actually has is the local index, which is
           * what `ts.unreachable` says. `bad_request` is page-neutral ("try a
           * shorter query") and is reused as it stands.
           */
          setMessage(
            body.error === "bad_request"
              ? t.errors.geocode.bad_request
              : ts.unreachable
          );
          return;
        }
        setPlaces(body.results);
        setMessage(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setPlaces([]);
        setMessage(ts.unreachable);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [t, ts, region.slug]
  );

  const onChange = (next: string) => {
    setText(next);
    setMessage(null);
    setHighlight(0);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);

    const query = next.trim();
    if (query.length < MIN_GEOCODE_LENGTH) {
      abort.current?.abort();
      setPlaces([]);
      setLoading(false);
      return;
    }
    timer.current = setTimeout(() => void run(query), DEBOUNCE_MS);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    setOpen(false);
    setPlaces([]);
    setText("");
    setLoading(false);
  };

  const pick = (row: Row) => {
    if (row.kind === "origin") onPickOrigin(row.origin);
    else onPickPlace(row.result.at, row.result.label);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(rows[highlight]);
    }
  };

  const showDropdown =
    open && (rows.length > 0 || message !== null || (loading && text.trim()));

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 pl-2.5 pr-1.5 hover:border-neutral-300 focus-within:border-neutral-400 transition-colors">
        <Search className="w-3.5 h-3.5 text-neutral-300 shrink-0" aria-hidden />
        <input
          type="text"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          // A click on a suggestion fires blur first; closing on blur alone
          // would unmount the option before its click lands.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={ts.placeholder}
          aria-label={ts.label}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
        {loading ? (
          <span className="text-[10px] text-neutral-400 pr-1 shrink-0">…</span>
        ) : text ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={close}
            aria-label={ts.clear}
            className="p-1 text-neutral-300 hover:text-neutral-600 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 right-0 top-full mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg py-1"
        >
          {localMatches.length > 0 && <GroupLabel>{ts.groupOrigins}</GroupLabel>}
          {localMatches.map((origin, i) => (
            <li key={origin.origin_id} role="option" aria-selected={i === highlight}>
              <RowButton
                row={rows[i]}
                active={i === highlight}
                onEnter={() => setHighlight(i)}
                onPick={() => pick(rows[i])}
              />
            </li>
          ))}

          {places.length > 0 && <GroupLabel>{ts.groupPlaces}</GroupLabel>}
          {places.map((result, j) => {
            const i = localMatches.length + j;
            return (
              <li key={result.id} role="option" aria-selected={i === highlight}>
                <RowButton
                  row={rows[i]}
                  active={i === highlight}
                  onEnter={() => setHighlight(i)}
                  onPick={() => pick(rows[i])}
                />
              </li>
            );
          })}
          {(message ?? (!loading && text.trim() && rows.length === 0)) && (
            <li className="px-2.5 py-2 text-[11px] leading-relaxed text-neutral-500">
              {message ?? ts.nothingFound}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** An `li`, not a `div` — it is a direct child of the listbox `ul`. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li
      role="presentation"
      className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400"
    >
      {children}
    </li>
  );
}

function RowButton({
  row,
  active,
  onEnter,
  onPick,
}: {
  row: Row;
  active: boolean;
  onEnter: () => void;
  onPick: () => void;
}) {
  const Icon =
    row.kind === "place"
      ? MapPin
      : row.origin.kind === "station"
        ? TrainFront
        : School;
  const label = row.kind === "place" ? row.result.label : row.origin.name;
  const detail = row.kind === "place" ? row.result.detail : row.origin.detail;

  return (
    <button
      type="button"
      // Keeps focus in the input so blur doesn't race the click.
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onEnter}
      onClick={onPick}
      className={`w-full flex items-start gap-2 px-2.5 py-1.5 text-left ${
        active ? "bg-neutral-100" : ""
      }`}
    >
      <Icon className="w-3 h-3 text-neutral-400 mt-[3px] shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[12px] text-neutral-900 leading-tight truncate">
          {label}
        </span>
        {detail && (
          <span className="block text-[11px] text-neutral-400 leading-tight truncate">
            {detail}
          </span>
        )}
      </span>
    </button>
  );
}
