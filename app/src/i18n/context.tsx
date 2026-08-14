"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { DICTIONARIES, type Dict } from "./dictionaries";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "./config";

interface LocaleValue {
  locale: Locale;
  t: Dict;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleValue>({
  locale: DEFAULT_LOCALE,
  t: DICTIONARIES[DEFAULT_LOCALE],
  setLocale: () => {},
});

/**
 * Holds the active locale for every client component under it.
 *
 * `initial` comes from the server, which read the cookie — so the first paint
 * is already in the right language and there is no hydration mismatch and no
 * flash of English.
 */
export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);

  /**
   * A cookie the server can read on the next request, and a state update the
   * browser can see immediately. Both are needed: state alone would revert on
   * reload, and the cookie alone would need a round trip to take effect.
   */
  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      setLocaleState(next);
      /**
       * Re-runs the server layout so `<html lang>` and the per-page metadata
       * follow the switch. Without it the page reads Japanese while the
       * document still claims `lang="en"` — which is not cosmetic: `lang`
       * is what makes a browser pick Japanese glyph forms for the Han
       * characters Japanese and Chinese share.
       */
      router.refresh();
    },
    [locale, router]
  );

  /**
   * The optimistic half of the same job. `router.refresh()` is a round trip;
   * this makes the glyph selection correct on the very next paint rather than
   * when the server answers.
   */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleValue>(
    () => ({ locale, t: DICTIONARIES[locale], setLocale }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** The dictionary, for rendering. The common case. */
export function useT(): Dict {
  return useContext(LocaleContext).t;
}

/** The locale and the setter, for the switcher and for locale-dependent logic. */
export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}
