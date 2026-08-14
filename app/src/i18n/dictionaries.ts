import en, { type Dict } from "./en";
import ja from "./ja";
import type { Locale } from "./config";

/**
 * Both dictionaries, by locale.
 *
 * Imported into the client bundle whole rather than handed down from the server
 * as props. Two reasons: the dictionary would otherwise be serialised into the
 * RSC payload of every page, and — more usefully — switching language becomes a
 * `setState` rather than a round trip, because the strings for both languages
 * are already in the browser.
 */
export const DICTIONARIES: Record<Locale, Dict> = { en, ja };

export type { Dict };
