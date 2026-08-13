/**
 * Routing on our own network, with our own stress data choosing the road.
 *
 * This is the provider the whole project points at. ORS and BRouter draw a line
 * from a generic cycling profile and we score it afterwards — useful, honest,
 * and fundamentally unable to *avoid* anything, because neither of them has
 * ever seen `lts`. Here the pipeline's stress classification is the cost
 * function, so a `relaxed` route will genuinely go around the hostile arterial
 * that the other two send you down. PROJECT_STATUS.md C.3 framed this as
 * "self-host GraphHopper or not"; it turns out the study area is one ward and
 * 3,188 ways, which is small enough to route over directly and skip the server.
 *
 * ## Topology, and why it is built here rather than reused
 *
 * segments.geojson holds whole OSM ways, not ways split at intersections: only
 * 22% of way *endpoints* are shared with another way, so an endpoint-to-endpoint
 * graph is a heap of disconnected stubs. Ways meet at interior vertices, and
 * those vertices are shared exactly — building nodes from every vertex of every
 * way puts 97% of the network's 16,532 nodes into one connected component,
 * which is a routable graph. That is the one non-obvious thing in this file.
 *
 * `SegmentIndex` cannot be reused for this. It is built for "what is near this
 * point" and flattens ways into tolerance-padded grid cells with no record of
 * which vertex touches which, so it answers proximity and knows nothing about
 * connectivity.
 *
 * ## Known limitations
 *
 * - **One-way streets are not modelled.** `SegmentProperties` carries no
 *   `oneway` field, so every edge is bidirectional. In a dense ward this will
 *   occasionally propose riding the wrong way up a one-way street. Fixing it is
 *   a pipeline change (export `oneway`), not a change here.
 * - **Turn restrictions and signal delay do not enter the cost.** Signals are
 *   counted after the fact by the scorer, so two routes with equal cost but
 *   different junction counts are not distinguished during search.
 * - **Gradient is ignored** even though `mean_slope_deg` exists, because it is
 *   null on much of the network.
 */

import type { Feature, LineString, Position } from "geojson";
import { lineString } from "@turf/helpers";
import {
  CYCLING_SPEED_KMH,
  GRAPH_SNAP_RADIUS_M,
  LTS_COST_FACTOR,
  LTS_SPEED_FACTOR,
} from "../scoring-constants";
import { loadSegments } from "./data";
import type {
  ProviderResult,
  RouteProvider,
  RouteRequest,
  RouteType,
} from "./types";

// --- The routable network ------------------------------------------------

interface Edge {
  /** Index of the node at the far end. */
  to: number;
  lengthM: number;
  lts: number;
}

interface RoutableGraph {
  /** Node index -> its position. */
  nodes: Position[];
  /** Node index -> edges leaving it. */
  adjacency: Edge[][];
  /** Grid cell key -> node indices in that cell, for snapping a click. */
  cells: Map<string, number[]>;
}

/**
 * Vertex identity is exact string equality on the coordinate pair. That is
 * correct here rather than lazy: both ways at a junction inherit the same OSM
 * node, so the two coordinates are the same double, printed the same way. A
 * tolerance-based merge would additionally weld ways that merely pass close —
 * a bridge to the road beneath it — and invent routes that do not exist.
 */
const nodeKey = (c: Position): string => `${c[0]},${c[1]}`;

/** Same cell size as the matcher's index; see route-matching.ts. */
const CELL_DEG = 0.002;
const cellKey = (lon: number, lat: number): string =>
  `${Math.floor(lon / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;

/** Metres between two lon/lat pairs, flat-earth. Fine over a single ward. */
function metres(a: Position, b: Position): number {
  const cosLat = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (a[0] - b[0]) * 111_320 * cosLat;
  const dy = (a[1] - b[1]) * 111_320;
  return Math.hypot(dx, dy);
}

let graphPromise: Promise<RoutableGraph> | null = null;

/** Built once per process, like the segment index it sits beside. */
function loadGraph(): Promise<RoutableGraph> {
  graphPromise ??= loadSegments().then((segments) => {
    const nodes: Position[] = [];
    const adjacency: Edge[][] = [];
    const ids = new Map<string, number>();
    const cells = new Map<string, number[]>();

    const nodeAt = (c: Position): number => {
      const key = nodeKey(c);
      const existing = ids.get(key);
      if (existing !== undefined) return existing;

      const id = nodes.length;
      ids.set(key, id);
      nodes.push(c);
      adjacency.push([]);

      const ck = cellKey(c[0], c[1]);
      const bucket = cells.get(ck);
      if (bucket) bucket.push(id);
      else cells.set(ck, [id]);

      return id;
    };

    for (const feature of segments.features) {
      const p = feature.properties;
      if (!p) continue;
      // LTS is the cost function's only input, so a segment without one cannot
      // be priced. Treating a missing value as calm would make unclassified
      // roads the most attractive in the network, which is exactly backwards.
      const lts = Number.isFinite(p.lts) ? p.lts : 4;

      for (const part of feature.geometry.coordinates) {
        for (let i = 1; i < part.length; i++) {
          const a = nodeAt(part[i - 1]);
          const b = nodeAt(part[i]);
          if (a === b) continue;

          const lengthM = metres(part[i - 1], part[i]);
          if (lengthM <= 0) continue;

          // Bidirectional: see the one-way limitation in the file header.
          adjacency[a].push({ to: b, lengthM, lts });
          adjacency[b].push({ to: a, lengthM, lts });
        }
      }
    }

    return { nodes, adjacency, cells };
  });
  return graphPromise;
}

// --- Cost ----------------------------------------------------------------

/**
 * What one edge costs, in "metres of calm street equivalent".
 *
 * `quick` is priced in time rather than distance — it is the only route type
 * where a rider would accept a longer path for a faster one, and LTS_SPEED_FACTOR
 * already expresses how stress slows a rider down. The other two are priced in
 * distance so that the LTS multiplier reads as a straightforward detour budget.
 */
function edgeCost(edge: Edge, routeType: RouteType): number {
  const table = LTS_COST_FACTOR[routeType] ?? LTS_COST_FACTOR.efficient;
  const penalty = table[edge.lts] ?? table[4];

  if (routeType === "quick") {
    const speed = CYCLING_SPEED_KMH * (LTS_SPEED_FACTOR[edge.lts] ?? 1);
    // Seconds, scaled back into metre-ish units so all three route types come
    // out of the same order of magnitude and are debuggable side by side.
    return (edge.lengthM / (speed / 3.6)) * penalty * (CYCLING_SPEED_KMH / 3.6);
  }

  return edge.lengthM * penalty;
}

// --- Search --------------------------------------------------------------

/**
 * A binary min-heap keyed on cost. `Array.sort` per pop is O(n log n) on a
 * frontier that reaches into the thousands here, which is enough to be felt on
 * a request; this keeps a cross-ward route in single-digit milliseconds.
 */
class MinHeap {
  private cost: number[] = [];
  private node: number[] = [];

  get size(): number {
    return this.cost.length;
  }

  push(node: number, cost: number): void {
    this.cost.push(cost);
    this.node.push(node);
    let i = this.cost.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cost[parent] <= this.cost[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): { node: number; cost: number } | null {
    if (this.cost.length === 0) return null;
    const node = this.node[0];
    const cost = this.cost[0];
    const lastCost = this.cost.pop() as number;
    const lastNode = this.node.pop() as number;

    if (this.cost.length > 0) {
      this.cost[0] = lastCost;
      this.node[0] = lastNode;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.cost.length && this.cost[l] < this.cost[smallest]) {
          smallest = l;
        }
        if (r < this.cost.length && this.cost[r] < this.cost[smallest]) {
          smallest = r;
        }
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }

    return { node, cost };
  }

  private swap(a: number, b: number): void {
    [this.cost[a], this.cost[b]] = [this.cost[b], this.cost[a]];
    [this.node[a], this.node[b]] = [this.node[b], this.node[a]];
  }
}

/** Nearest graph node to a clicked point, or null if nothing is near enough. */
function snapToNode(
  graph: RoutableGraph,
  at: [number, number]
): number | null {
  // Widen a ring of cells at a time rather than scanning all 16k nodes. One
  // cell is ~200m, so the snap radius is covered by ring 1 in the worst case.
  const cx = Math.floor(at[0] / CELL_DEG);
  const cy = Math.floor(at[1] / CELL_DEG);

  let best: number | null = null;
  let bestDist = GRAPH_SNAP_RADIUS_M;

  for (let ring = 0; ring <= 2; ring++) {
    for (let x = cx - ring; x <= cx + ring; x++) {
      for (let y = cy - ring; y <= cy + ring; y++) {
        // Only the newly added perimeter on each widening.
        if (ring > 0 && Math.abs(x - cx) !== ring && Math.abs(y - cy) !== ring) {
          continue;
        }
        for (const id of graph.cells.get(`${x}:${y}`) ?? []) {
          const d = metres(at, graph.nodes[id]);
          if (d < bestDist) {
            bestDist = d;
            best = id;
          }
        }
      }
    }
    if (best !== null) return best;
  }

  return best;
}

/** Plain Dijkstra. A* would want an admissible heuristic, and the LTS
 * multipliers mean straight-line distance is not one unless it is divided by
 * the cheapest possible factor — which for `relaxed` is 1.0, making the
 * heuristic useless anyway. At this network size it does not matter. */
function shortestPath(
  graph: RoutableGraph,
  from: number,
  to: number,
  routeType: RouteType
): Position[] | null {
  const best = new Float64Array(graph.nodes.length).fill(Infinity);
  const previous = new Int32Array(graph.nodes.length).fill(-1);
  const settled = new Uint8Array(graph.nodes.length);

  best[from] = 0;
  const queue = new MinHeap();
  queue.push(from, 0);

  while (queue.size > 0) {
    const top = queue.pop();
    if (!top) break;
    if (settled[top.node]) continue;
    settled[top.node] = 1;
    if (top.node === to) break;

    for (const edge of graph.adjacency[top.node]) {
      if (settled[edge.to]) continue;
      const cost = top.cost + edgeCost(edge, routeType);
      if (cost < best[edge.to]) {
        best[edge.to] = cost;
        previous[edge.to] = top.node;
        queue.push(edge.to, cost);
      }
    }
  }

  if (!settled[to]) return null;

  const path: Position[] = [];
  for (let at = to; at !== -1; at = previous[at]) {
    path.push(graph.nodes[at]);
    if (at === from) break;
  }
  return path.reverse();
}

// --- Provider ------------------------------------------------------------

export const graphProvider: RouteProvider = {
  id: "graph",
  label: "Norimichi graph",
  /** The route types are cost functions over our own data — see LTS_COST_FACTOR. */
  supportsRouteTypes: true,
  /**
   * False. Dijkstra returns *the* optimum, and a second-best path is a
   * different algorithm — k-shortest-paths (Yen's) or a plateau method — not a
   * parameter. Worth adding if the comparison turns out to be useful, but
   * claiming it here and returning the same line three times would be worse
   * than not offering it.
   */
  supportsAlternatives: false,

  async route(req: RouteRequest): Promise<ProviderResult> {
    const graph = await loadGraph();

    const from = snapToNode(graph, req.origin);
    const to = snapToNode(graph, req.destination);
    if (from === null || to === null) {
      return {
        ok: false,
        kind: "no_route",
        detail: `no network node within ${GRAPH_SNAP_RADIUS_M}m of ${
          from === null ? "origin" : "destination"
        }`,
      };
    }
    if (from === to) {
      return { ok: false, kind: "no_route", detail: "origin and destination snap to one node" };
    }

    const path = shortestPath(graph, from, to, req.routeType);
    // 3% of nodes sit in small components cut off from the main network; two
    // points in different components is a genuine "no route", not a fault.
    if (!path || path.length < 2) {
      return { ok: false, kind: "no_route", detail: "disconnected components" };
    }

    return {
      ok: true,
      route: {
        line: lineString(path) as Feature<LineString>,
        /**
         * Null on purpose. The side-by-side panel exists to show an external
         * provider's generic guess against our signal-aware estimate; here the
         * two would be the same numbers computed twice, and printing them
         * twice would imply a corroboration that is not there.
         */
        reported: null,
      },
    };
  },
};
