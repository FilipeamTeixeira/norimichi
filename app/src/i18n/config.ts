/**
 * Locale plumbing, with no dependency on React or on `next/headers`.
 *
 * Imported by the server layout, the client provider and the middleware-free
 * cookie helpers alike, so it has to stay free of anything that pins it to one
 * of those environments.
 */

export const LOCALES = ["en", "ja"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * English rather than Japanese, despite the audience.
 *
 * A first-time visitor with no cookie gets this, and the `Accept-Language`
 * header is deliberately not consulted: the URL does not carry the locale (see
 * docs/I18N.md), so a header-driven default would mean the same link showed
 * two different languages to two people with no way for either to tell why.
 * The switcher is in the nav on every page; one click and the cookie decides
 * from then on.
 */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Named for Next's own convention even though nothing in the framework reads
 * it here — if this app ever grows `[locale]` routing, the cookie the proxy
 * would look for is already the one being written.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** A year: the choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * What the switcher shows. Each language names itself — a reader who cannot
 * read the current language still has to be able to find their own.
 */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
};

/** The compact form, for the nav button itself. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  ja: "日本語",
};
