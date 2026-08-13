/**
 * The bit of the trip that isn't the route.
 *
 * Every routing provider snaps a request onto its own network, so the point the
 * reader clicked and the point the route starts from are rarely the same one —
 * a click mid-block, inside a park, or on the wrong side of a rail line can be
 * tens of metres from the nearest thing anyone can cycle along. Drawn as a
 * dashed stub, that distance reads as "walk this"; left undrawn, it reads as
 * the route having been put in the wrong place, which is what it looked like.
 *
 * Shared by the map layer that draws the stubs and the legend that names them,
 * so the threshold below is decided once.
 */

export type Point = [number, number];

/**
 * Metres between two lon/lat pairs, equirectangular. Exact enough over the tens
 * of metres this is used for, and it saves pulling turf into the client bundle
 * to decide whether a 6m line is worth drawing.
 */
export function roughMetres([lon1, lat1]: Point, [lon2, lat2]: Point): number {
  const mPerDeg = 111_320;
  const x =
    (lon2 - lon1) * mPerDeg * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const y = (lat2 - lat1) * mPerDeg;
  return Math.hypot(x, y);
}

/**
 * Below this, the stub is shorter than the route line is wide: it would put a
 * smudge under the pin rather than tell the reader anything.
 */
export const MIN_ACCESS_LEG_M = 8;

/**
 * Pin → where the router actually started, for each end that has one worth
 * drawing. Empty before a result comes back, and empty for a trip whose two
 * ends both landed on a road.
 */
export function accessLegs(
  pins: { origin: Point | null; destination: Point | null },
  snapped: { origin: Point; destination: Point } | null
): [Point, Point][] {
  if (!snapped) return [];
  const legs: [Point, Point][] = [];
  for (const [pin, end] of [
    [pins.origin, snapped.origin],
    [pins.destination, snapped.destination],
  ] as const) {
    if (!pin) continue;
    if (roughMetres(pin, end) < MIN_ACCESS_LEG_M) continue;
    legs.push([pin, end]);
  }
  return legs;
}

/** Grey rather than on the stress ramp: nothing was scored along this. */
export const ACCESS_LEG_COLOR = "#6b7280";
export const ACCESS_LEG_DASH: [number, number] = [1, 1.6];
