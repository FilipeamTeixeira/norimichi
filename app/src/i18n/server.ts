import { cookies } from "next/headers";
import { DICTIONARIES, type Dict } from "./dictionaries";
import { LOCALE_COOKIE, toLocale, type Locale } from "./config";

/**
 * The locale for the current request, from the cookie the switcher writes.
 *
 * Reading a cookie is a request-time API, so anything calling this opts its
 * route into dynamic rendering. That is the price of not putting the locale in
 * the URL and it is the right trade here: every page on this site already
 * fetches its GeoJSON at runtime, and the two API routes are dynamic anyway,
 * so there was no static prerendering left to lose.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return toLocale(store.get(LOCALE_COOKIE)?.value);
}

/** The dictionary for the current request — for `generateMetadata` and layouts. */
export async function getDictionary(): Promise<Dict> {
  return DICTIONARIES[await getLocale()];
}
