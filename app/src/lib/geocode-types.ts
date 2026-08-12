/**
 * The contract between /api/geocode and the Route Analysis page.
 *
 * Separate from route-types.ts because the two endpoints fail for unrelated
 * reasons and share no shape — and separate from the route handler itself so a
 * client component can import the result type without pulling `fs` into the
 * browser bundle.
 */

export interface GeocodeResult {
  /** Stable within one response; used as a React key, not a database id. */
  id: string;
  /** The line the reader picks by: a place or street name. */
  label: string;
  /** Where it is, in progressively wider terms. Empty when nothing to add. */
  detail: string;
  /** `[lon, lat]`, as GeoJSON and MapLibre both order it. */
  at: [number, number];
}

export interface GeocodeResponse {
  results: GeocodeResult[];
  /** True when this came back from the in-process query cache. */
  cached: boolean;
}

/**
 * Geocoding is a convenience over a map that already works by clicking, so
 * every failure here is recoverable by the reader without leaving the page.
 * The UI says so rather than presenting a dead search box.
 */
export type GeocodeErrorKind = "unavailable" | "bad_request";

export interface GeocodeError {
  error: GeocodeErrorKind;
  message: string;
}

export function isGeocodeError(
  body: GeocodeResponse | GeocodeError
): body is GeocodeError {
  return "error" in body;
}
