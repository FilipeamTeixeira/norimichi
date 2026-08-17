"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import {
  isGeocodeError,
  type GeocodeError,
  type GeocodeResponse,
  type GeocodeResult,
} from "@/lib/geocode-types";
import { useT } from "@/i18n/context";
import { useRegion } from "@/components/region/context";

/**
 * One end of the trip: a text field that searches addresses, over a value the
 * map can also set.
 *
 * The two input methods are deliberately not separate controls. Whichever one
 * the reader used, this field shows what the end currently *is* — a picked
 * address by name, or a dropped pin by coordinate — so there is one place to
 * look for the answer to "where does this trip start". Focusing the field also
 * aims the next map click at this end, which makes the two methods
 * interchangeable mid-edit rather than modal.
 */

export interface Endpoint {
  at: [number, number];
  label: string;
}

interface Props {
  label: string;
  /** A or B, matching the map pins. */
  letter: string;
  placeholder: string;
  value: Endpoint | null;
  /** True when the next map click lands on this end. */
  active: boolean;
  onFocus: () => void;
  onPick: (at: [number, number], label: string) => void;
  onClear: () => void;
}

/** Long enough that single letters don't fire a request, short enough for "本牧". */
const MIN_QUERY_LENGTH = 2;
/**
 * Photon is a free service and this fires on keystrokes. 300ms is roughly a
 * pause in typing rather than a gap between characters, which is the
 * difference between one request per word and one per letter.
 */
const DEBOUNCE_MS = 300;

export default function AddressSearch({
  label,
  letter,
  placeholder,
  value,
  active,
  onFocus,
  onPick,
  onClear,
}: Props) {
  const t = useT();
  const { region } = useRegion();
  const listId = useId();
  /**
   * What the reader has typed since focusing, or null when they haven't — in
   * which case the field simply *is* the endpoint's own label. Keeping the
   * unedited state as null rather than as a copy of the label is what lets a
   * map click, Reverse or Clear show through immediately: there is no local
   * copy to keep in sync with the prop, so there is nothing to go stale.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value?.label ?? "";

  const [results, setResults] = useState<GeocodeResult[]>([]);
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
          setResults([]);
          // The kind, not the server's sentence: see the errors block in en.ts.
          setMessage(t.errors.geocode[body.error] ?? body.message);
          setOpen(true);
          return;
        }
        const found = body.results;
        setResults(found);
        setHighlight(0);
        setMessage(found.length ? null : t.route.search.nothingFound);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
        setMessage(t.route.search.unreachable);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [t, region.slug]
  );

  const onChange = (next: string) => {
    setDraft(next);
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);

    const query = next.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      abort.current?.abort();
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    timer.current = setTimeout(() => void run(query), DEBOUNCE_MS);
  };

  const pick = (result: GeocodeResult) => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    setOpen(false);
    setResults([]);
    // Not setText(result.label): the field goes back to reading the endpoint,
    // which is about to become this result.
    setDraft(null);
    onPick(result.at, result.label);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[highlight]);
    }
  };

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border pl-2.5 pr-1.5 transition-colors ${
          active
            ? "border-neutral-900 bg-neutral-50"
            : "border-neutral-200 hover:border-neutral-300"
        }`}
      >
        <span
          className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0"
          aria-hidden
        >
          {letter}
        </span>
        <input
          type="text"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            onFocus();
            if (results.length || message) setOpen(true);
          }}
          // A click on a suggestion fires blur first; letting the list close on
          // blur alone would unmount the option before its click lands. A query
          // abandoned half-typed is also dropped here — the field has to read
          // as what this end *is*, not as what was last typed at it. Clicking
          // the map blurs this field on the way, which is what lets the pin it
          // drops appear here without any prop-syncing.
          onBlur={() =>
            setTimeout(() => {
              setOpen(false);
              setDraft(null);
            }, 120)
          }
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 text-[12px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
        {loading ? (
          <span className="text-[10px] text-neutral-400 pr-1 shrink-0">…</span>
        ) : value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={t.route.input.clearEnd(label)}
            className="p-1 text-neutral-300 hover:text-neutral-600 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Search className="w-3.5 h-3.5 text-neutral-300 mr-1 shrink-0" aria-hidden />
        )}
      </div>

      {open && (results.length > 0 || message) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg py-1"
        >
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                // Keeps focus in the input so blur doesn't race the click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(r)}
                className={`w-full flex items-start gap-2 px-2.5 py-1.5 text-left ${
                  i === highlight ? "bg-neutral-100" : ""
                }`}
              >
                <MapPin
                  className="w-3 h-3 text-neutral-400 mt-[3px] shrink-0"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-[12px] text-neutral-900 leading-tight truncate">
                    {r.label}
                  </span>
                  {r.detail && (
                    <span className="block text-[11px] text-neutral-400 leading-tight truncate">
                      {r.detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {message && (
            <li className="px-2.5 py-2 text-[11px] leading-relaxed text-neutral-500">
              {message}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
