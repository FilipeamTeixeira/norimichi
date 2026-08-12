/**
 * Putting our own segment data underneath somebody else's route geometry.
 *
 * OpenRouteService returns a LineString and nothing else — no way ids, no tags,
 * no link back to the network it routed over. Everything this project knows
 * about a street (`lts`, `sidewalk_available`, `likely_informal_parking`, the
 * traffic signal count) is keyed by `way_id` in segments.geojson, so before any
 * of it can be said about a trip, the route has to be worked out *back* onto
 * our segments. That is what this file does, and it is the one genuinely hard
 * part of the V1 route tool.
 *
 * The approach is deliberately the cheap one: cut the route into short pieces,
 * ask which of our segments each piece is nearest to, and attribute that
 * piece's length to it. Length-weighting is the point — a route can clip the
 * last 5m of one street and then run the full 400m of the next, and a
 * count-of-segments summary would call those equal.
 *
 * It will mismatch sometimes. Complex intersections, and anywhere ORS's graph
 * and our OSM extract disagree about where the centreline is, are the two
 * places to expect it. That is an accepted property of overlaying rather than
 * routing on our own data — the fix is the self-hosted GraphHopper path in
 * PROJECT_STATUS.md C.3, not a better tolerance. What this file does owe the
 * reader is an honest `matched_share`, so a bad match is visible rather than
 * silently averaged into a confident-looking number.
 *
 * No Node APIs in here: it takes a FeatureCollection and returns plain data, so
 * it can be exercised without a request or a file system.
 */

import lineChunk from "@turf/line-chunk";
import length from "@turf/length";
import pointToLineDistance from "@turf/point-to-line-distance";
import { lineString, point } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  Position,
} from "geojson";
import type { CyclewayType, SegmentProperties } from "./types";
import {
  CHUNK_LENGTH_M,
  CYCLING_SPEED_KMH,
  LTS_SPEED_FACTOR,
  MATCH_TOLERANCE_M,
  SECONDS_PER_TRAFFIC_SIGNAL,
  SIGNAL_JUNCTION_CLUSTER_M,
  SIGNAL_ROUTE_TOLERANCE_M,
} from "./scoring-constants";

// --- The index ----------------------------------------------------------

/**
 * One LineString of one segment. Segments are exported as MultiLineString (25
 * of 3,188 actually have more than one part), and every distance test here
 * wants a simple line, so the parts are split out once at index time rather
 * than unwrapped on every one of the thousands of lookups a route makes.
 */
interface IndexedPart {
  wayId: number;
  line: Feature<LineString>;
}

/**
 * Cell size of the lookup grid, in degrees. ~0.002° is 222m north–south and
 * 181m east–west at Yokohama's latitude — a few times the match tolerance,
 * which keeps the candidate list per lookup in single digits without making
 * the index itself large.
 */
const CELL_DEG = 0.002;

/** Degrees of latitude per metre. Longitude is corrected per-cell below. */
const DEG_PER_M_LAT = 1 / 111_320;

export interface SegmentIndex {
  /** Grid cell key -> the parts whose tolerance-expanded bbox touches it. */
  cells: Map<string, IndexedPart[]>;
  /** way_id -> the segment's own properties. */
  props: Map<number, SegmentProperties>;
  /**
   * Extent of the whole network, `[w, s, e, n]`. The study area is one ward,
   * and a route that starts outside it can be scored against nothing — so the
   * caller needs to be able to refuse rather than return a confident-looking
   * payload built from a 0% match.
   */
  bbox: [number, number, number, number];
}

const cellKey = (lon: number, lat: number): string =>
  `${Math.floor(lon / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;

/**
 * Build the lookup structure once, for the lifetime of the process.
 *
 * Parts are registered in every cell their bbox touches *after* being expanded
 * by the match tolerance. That expansion is what makes a single-cell lookup
 * correct: if a point is within tolerance of a part, the point necessarily
 * falls inside that expanded bbox, so the part is already filed in the point's
 * own cell and no neighbour cells need checking.
 */
export function buildSegmentIndex(
  segments: FeatureCollection<MultiLineString, SegmentProperties>
): SegmentIndex {
  const cells = new Map<string, IndexedPart[]>();
  const props = new Map<number, SegmentProperties>();
  const extent: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
  ];

  for (const feature of segments.features) {
    const p = feature.properties;
    if (!p) continue;
    props.set(p.way_id, p);

    for (const part of feature.geometry.coordinates) {
      if (part.length < 2) continue;
      const entry: IndexedPart = { wayId: p.way_id, line: lineString(part) };

      let w = Infinity;
      let s = Infinity;
      let e = -Infinity;
      let n = -Infinity;
      for (const [lon, lat] of part) {
        if (lon < w) w = lon;
        if (lon > e) e = lon;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
      }

      if (w < extent[0]) extent[0] = w;
      if (s < extent[1]) extent[1] = s;
      if (e > extent[2]) extent[2] = e;
      if (n > extent[3]) extent[3] = n;

      const padLat = MATCH_TOLERANCE_M * DEG_PER_M_LAT;
      const padLon =
        padLat / Math.max(0.2, Math.cos((((s + n) / 2) * Math.PI) / 180));

      const x0 = Math.floor((w - padLon) / CELL_DEG);
      const x1 = Math.floor((e + padLon) / CELL_DEG);
      const y0 = Math.floor((s - padLat) / CELL_DEG);
      const y1 = Math.floor((n + padLat) / CELL_DEG);

      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${x}:${y}`;
          const bucket = cells.get(key);
          if (bucket) bucket.push(entry);
          else cells.set(key, [entry]);
        }
      }
    }
  }

  return { cells, props, bbox: extent };
}

// --- Matching -----------------------------------------------------------

/**
 * How much closer a rival segment has to be before the match is allowed to
 * leave the street it is already on, in metres.
 *
 * Without this the match flips street mid-block wherever a side road's
 * centreline passes fractionally nearer than the road actually being ridden —
 * which is most junctions, and is exactly where the two networks' geometries
 * disagree most. Requiring a rival to be meaningfully, not marginally, closer
 * keeps a straight run down one road reading as one road. It cannot rescue a
 * genuine mismatch, only stop a correct match from being lost to noise.
 */
const STICKINESS_M = 4;

/** One piece of the route, and what it was decided to be running along. */
interface ChunkMatch {
  coords: Position[];
  lengthM: number;
  /** null where nothing of ours was within tolerance. */
  wayId: number | null;
}

/**
 * A chunk's representative point. Chunks are CHUNK_LENGTH_M long, so the
 * midpoint of the endpoints is within a metre or two of the true midpoint even
 * where the piece rounds a corner — well inside a 20m tolerance, and far
 * cheaper than interpolating along the piece.
 */
function chunkMidpoint(coords: Position[]): Position {
  const a = coords[0];
  const b = coords[coords.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function matchChunks(
  route: Feature<LineString>,
  index: SegmentIndex
): ChunkMatch[] {
  const chunks = lineChunk(route, CHUNK_LENGTH_M / 1000, {
    units: "kilometers",
  });

  const matches: ChunkMatch[] = [];
  let previous: number | null = null;

  for (const chunk of chunks.features) {
    const coords = chunk.geometry.coordinates;
    if (coords.length < 2) continue;

    const lengthM = length(chunk, { units: "meters" });
    const mid = chunkMidpoint(coords);
    const midPoint = point(mid);
    const candidates = index.cells.get(cellKey(mid[0], mid[1])) ?? [];

    let bestWay: number | null = null;
    let bestDist = MATCH_TOLERANCE_M;
    let previousDist = Infinity;

    for (const candidate of candidates) {
      const d = pointToLineDistance(midPoint, candidate.line, {
        units: "meters",
      });
      if (candidate.wayId === previous && d < previousDist) previousDist = d;
      if (d < bestDist) {
        bestDist = d;
        bestWay = candidate.wayId;
      }
    }

    // Stay on the previous street unless something is convincingly nearer.
    if (
      previous !== null &&
      bestWay !== previous &&
      previousDist <= MATCH_TOLERANCE_M &&
      previousDist - bestDist < STICKINESS_M
    ) {
      bestWay = previous;
    }

    matches.push({ coords, lengthM, wayId: bestWay });
    if (bestWay !== null) previous = bestWay;
  }

  return matches;
}

// --- Signalised junctions ----------------------------------------------

/** Junction centres, `[lon, lat]`. Built once, alongside the segment index. */
export type SignalJunctions = Position[];

/** Metres between two lon/lat pairs, flat-earth. Fine at these distances. */
function metres(a: Position, b: Position, cosLat: number): number {
  const dx = (a[0] - b[0]) * 111_320 * cosLat;
  const dy = (a[1] - b[1]) * 111_320;
  return Math.hypot(dx, dy);
}

/**
 * Collapse OSM's per-approach signal nodes into one point per junction.
 *
 * Single-link clustering, which is the right shape for this: a junction's nodes
 * form one tight blob and the next junction is a block away, so there is no
 * chaining hazard at a 30m threshold. Run once per process over ~465 points.
 */
export function buildSignalJunctions(
  signals: FeatureCollection<GeoJSON.Point>
): SignalJunctions {
  const points = signals.features
    .map((f) => f.geometry?.coordinates)
    .filter((c): c is Position => Array.isArray(c) && c.length >= 2);

  const cosLat = Math.cos(
    (((points[0]?.[1] ?? 35.43) * Math.PI) / 180)
  );

  const seen = new Array<boolean>(points.length).fill(false);
  const junctions: Position[] = [];

  for (let i = 0; i < points.length; i++) {
    if (seen[i]) continue;
    seen[i] = true;
    const cluster = [points[i]];
    const queue = [i];

    while (queue.length > 0) {
      const k = queue.pop() as number;
      for (let j = 0; j < points.length; j++) {
        if (seen[j]) continue;
        if (metres(points[k], points[j], cosLat) >= SIGNAL_JUNCTION_CLUSTER_M) {
          continue;
        }
        seen[j] = true;
        cluster.push(points[j]);
        queue.push(j);
      }
    }

    const lon = cluster.reduce((a, c) => a + c[0], 0) / cluster.length;
    const lat = cluster.reduce((a, c) => a + c[1], 0) / cluster.length;
    junctions.push([lon, lat]);
  }

  return junctions;
}

/**
 * How many of those junctions this route actually goes through.
 *
 * Measured against the ORS geometry rather than against the matched segments,
 * so it does not inherit the matcher's mistakes — and so a junction shared by
 * two consecutive segments is still one stop.
 */
function countSignalJunctions(
  route: Feature<LineString>,
  junctions: SignalJunctions
): number {
  const coords = route.geometry.coordinates;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  const padLat = SIGNAL_ROUTE_TOLERANCE_M * DEG_PER_M_LAT;
  const padLon = padLat / Math.max(0.2, Math.cos(((s + n) / 2) * (Math.PI / 180)));

  let count = 0;
  for (const j of junctions) {
    // Cheap rejection first: only a handful of the study area's junctions are
    // anywhere near any one route.
    if (
      j[0] < w - padLon ||
      j[0] > e + padLon ||
      j[1] < s - padLat ||
      j[1] > n + padLat
    ) {
      continue;
    }
    if (
      pointToLineDistance(point(j), route, { units: "meters" }) <=
      SIGNAL_ROUTE_TOLERANCE_M
    ) {
      count += 1;
    }
  }
  return count;
}

// --- Aggregation --------------------------------------------------------

/** One of our segments, and how much of the route ran along it. */
export interface RouteSegment {
  way_id: number;
  name: string | null;
  highway: string | null;
  lts: number;
  suitability_score: number;
  sidewalk_available: boolean;
  likely_informal_parking: boolean;
  has_cycle_infra: boolean;
  cycleway_type: CyclewayType | null;
  speed_kmh: number | null;
  /** Metres of route attributed to this segment. */
  matched_length_m: number;
  /** Share of the segment's own length that the route used, capped at 1. */
  fraction_used: number;
}

export interface LtsBand {
  lts: number;
  length_m: number;
  /** Of the matched length, not the whole route — see `matched_share`. */
  share: number;
}

export interface RouteAggregate {
  total_length_m: number;
  matched_length_m: number;
  unmatched_length_m: number;
  /**
   * Matched over total. The honesty valve: everything below is computed on the
   * matched part only, so a low value here means the rest of this object is
   * describing a fraction of the trip.
   */
  matched_share: number;

  /** Always four entries, LTS 1-4, so a stacked bar has a fixed domain. */
  lts_bands: LtsBand[];
  /** Length-weighted mean LTS over the matched part. */
  mean_lts: number;

  no_sidewalk_length_m: number;
  no_sidewalk_share: number;
  informal_parking_length_m: number;
  informal_parking_share: number;
  informal_parking_segments: number;
  cycle_infra_length_m: number;
  cycle_infra_share: number;

  /**
   * Signalised junctions the route passes through — places the rider stops,
   * not signal heads they ride past. Counted from the signal point layer
   * rather than by summing the segments' own `traffic_signals_count`; see
   * SIGNAL_JUNCTION_CLUSTER_M for why that sum is several times too large.
   */
  signal_junctions: number;

  /** Highest LTS, longest-matched first among ties. The bit worth naming. */
  worst: RouteSegment | null;
  /** Every matched segment, longest first. */
  segments: RouteSegment[];
}

function emptyBands(): LtsBand[] {
  return [1, 2, 3, 4].map((lts) => ({ lts, length_m: 0, share: 0 }));
}

function aggregate(
  matches: ChunkMatch[],
  index: SegmentIndex,
  signalJunctions: number
): RouteAggregate {
  const byWay = new Map<number, number>();
  let matchedLength = 0;
  let unmatchedLength = 0;

  for (const m of matches) {
    if (m.wayId === null) {
      unmatchedLength += m.lengthM;
      continue;
    }
    matchedLength += m.lengthM;
    byWay.set(m.wayId, (byWay.get(m.wayId) ?? 0) + m.lengthM);
  }

  const segments: RouteSegment[] = [];
  for (const [wayId, matchedLengthM] of byWay) {
    const p = index.props.get(wayId);
    if (!p) continue;
    segments.push({
      way_id: wayId,
      name: p.name ?? null,
      highway: p.highway ?? null,
      lts: p.lts,
      suitability_score: p.suitability_score ?? 0,
      sidewalk_available: p.sidewalk_available,
      likely_informal_parking: p.likely_informal_parking,
      has_cycle_infra: p.has_cycle_infra ?? false,
      cycleway_type: p.cycleway_type ?? null,
      speed_kmh: p.speed_kmh ?? null,
      matched_length_m: matchedLengthM,
      fraction_used:
        p.length_m > 0 ? Math.min(1, matchedLengthM / p.length_m) : 1,
    });
  }
  segments.sort((a, b) => b.matched_length_m - a.matched_length_m);

  const bands = emptyBands();
  let noSidewalk = 0;
  let informal = 0;
  let informalCount = 0;
  let cycleInfra = 0;
  let ltsWeighted = 0;

  for (const s of segments) {
    const band = bands.find((b) => b.lts === s.lts);
    if (band) band.length_m += s.matched_length_m;
    ltsWeighted += s.lts * s.matched_length_m;
    if (!s.sidewalk_available) noSidewalk += s.matched_length_m;
    if (s.likely_informal_parking) {
      informal += s.matched_length_m;
      informalCount += 1;
    }
    if (s.has_cycle_infra) cycleInfra += s.matched_length_m;
  }

  const share = (v: number) => (matchedLength > 0 ? v / matchedLength : 0);
  for (const b of bands) b.share = share(b.length_m);

  // Highest LTS wins; among equals, the one the route spends longest on, since
  // that is the one worth naming in a one-line callout.
  const worst =
    segments.length === 0
      ? null
      : segments.reduce((a, b) =>
          b.lts > a.lts ||
          (b.lts === a.lts && b.matched_length_m > a.matched_length_m)
            ? b
            : a
        );

  const total = matchedLength + unmatchedLength;

  return {
    total_length_m: total,
    matched_length_m: matchedLength,
    unmatched_length_m: unmatchedLength,
    matched_share: total > 0 ? matchedLength / total : 0,
    lts_bands: bands,
    mean_lts: matchedLength > 0 ? ltsWeighted / matchedLength : 0,
    no_sidewalk_length_m: noSidewalk,
    no_sidewalk_share: share(noSidewalk),
    informal_parking_length_m: informal,
    informal_parking_share: share(informal),
    informal_parking_segments: informalCount,
    cycle_infra_length_m: cycleInfra,
    cycle_infra_share: share(cycleInfra),
    signal_junctions: signalJunctions,
    worst,
    segments,
  };
}

// --- The pre-coloured geometry -----------------------------------------

/**
 * Properties the map layer needs and nothing else. The route arrives at the
 * client already cut and already classed, so the browser renders it with a
 * `match` on one property instead of repeating the whole matching exercise —
 * which is both slow and a second place for it to be got wrong.
 */
export interface RoutePieceProperties {
  /** null on stretches nothing of ours was near. */
  lts: number | null;
  way_id: number | null;
  name: string | null;
}

/**
 * Merge the chunks back into the fewest lines that still carry the colouring.
 *
 * Consecutive chunks on the same LTS become one feature: at 15m a chunk, a 5km
 * route is ~330 pieces, and handing MapLibre 330 two-point lines to draw a
 * route that changes character maybe a dozen times is wasteful for a
 * distinction nobody can see.
 */
function buildColouredRoute(
  matches: ChunkMatch[],
  index: SegmentIndex
): FeatureCollection<LineString, RoutePieceProperties> {
  const features: Feature<LineString, RoutePieceProperties>[] = [];
  let current: Feature<LineString, RoutePieceProperties> | null = null;
  let currentLts: number | null | undefined;

  for (const m of matches) {
    const p = m.wayId === null ? undefined : index.props.get(m.wayId);
    const lts = p?.lts ?? null;

    if (current && currentLts === lts) {
      // Chunks share an endpoint, so drop the repeated coordinate.
      current.geometry.coordinates.push(...m.coords.slice(1));
      continue;
    }

    if (current) {
      // Butt the previous run up against this one, or the join shows as a gap.
      current.geometry.coordinates.push(m.coords[0]);
      features.push(current);
    }

    current = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [...m.coords] },
      properties: {
        lts,
        way_id: m.wayId,
        name: p?.name ?? null,
      },
    };
    currentLts = lts;
  }

  if (current) features.push(current);
  return { type: "FeatureCollection", features };
}

// --- Travel time --------------------------------------------------------

export interface TimeEstimate {
  minutes: number;
  /** Riding time before signal delay, minutes. */
  riding_minutes: number;
  /** Time attributed to traffic signals, minutes. */
  signal_minutes: number;
  /** Length-weighted mean cycling speed used, km/h. */
  effective_speed_kmh: number;
}

/**
 * Our own travel time, which is the actual reason the pipeline went and
 * fetched traffic signals and speed limits in the first place.
 *
 * ORS returns a duration from its own generic cycling profile: a single assumed
 * speed over a graph that does not know this project's data and does not model
 * signals at all. This one rides slower where our own `lts` says the street is
 * hostile, and then adds the junctions. Both numbers are shown side by side in
 * the UI rather than one replacing the other — the difference between them is
 * itself the finding.
 *
 * Every constant it uses is illustrative. See scoring-constants.ts.
 */
export function estimateCyclingTime(agg: RouteAggregate): TimeEstimate {
  // Speed is averaged harmonically — time is what adds up over a trip, not
  // speed, so weighting the speeds directly would overstate a route that is
  // mostly calm with one slow stretch.
  let hours = 0;
  for (const band of agg.lts_bands) {
    if (band.length_m === 0) continue;
    const factor = LTS_SPEED_FACTOR[band.lts] ?? 1;
    hours += band.length_m / 1000 / (CYCLING_SPEED_KMH * factor);
  }

  // Anything unmatched is charged at the unmodified base speed: we have no
  // evidence about it either way, and dropping it would quietly shorten the
  // trip.
  hours += agg.unmatched_length_m / 1000 / CYCLING_SPEED_KMH;

  const ridingMinutes = hours * 60;
  const signalMinutes =
    (agg.signal_junctions * SECONDS_PER_TRAFFIC_SIGNAL) / 60;
  const km = agg.total_length_m / 1000;

  return {
    minutes: ridingMinutes + signalMinutes,
    riding_minutes: ridingMinutes,
    signal_minutes: signalMinutes,
    effective_speed_kmh: ridingMinutes > 0 ? km / (ridingMinutes / 60) : 0,
  };
}

// --- Entry point --------------------------------------------------------

export interface MatchedRoute {
  aggregate: RouteAggregate;
  geometry: FeatureCollection<LineString, RoutePieceProperties>;
}

/** Cut an ORS route onto our segments, and say what it ran along. */
export function matchRoute(
  route: Feature<LineString>,
  index: SegmentIndex,
  junctions: SignalJunctions
): MatchedRoute {
  const matches = matchChunks(route, index);
  return {
    aggregate: aggregate(matches, index, countSignalJunctions(route, junctions)),
    geometry: buildColouredRoute(matches, index),
  };
}
