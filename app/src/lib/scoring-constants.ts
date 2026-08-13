/**
 * The numbers the route scorer multiplies by, in one place.
 *
 * Two very different kinds of number live here, and the split is the same one
 * pipeline/R/score_roi.R's header draws — read that file before quoting any of
 * these at anyone. SOURCED constants come from MLIT's 費用便益分析マニュアル
 * (令和7年8月改訂 — 令和6年価格), the unit values Japanese road appraisals
 * actually use. ILLUSTRATIVE constants are reasoned starting values with no
 * measured local data behind them, exactly like `score_lts()`'s thresholds.
 *
 * The two sourced values are duplicated from R rather than derived from it,
 * because the R pipeline exports aggregates and this scores one trip. Keeping
 * them side by side in a file that says so is the only thing stopping the two
 * halves of the project from quietly disagreeing about what a minute is worth.
 */

// --- Sourced: MLIT 費用便益分析マニュアル, 令和6年価格 --------------------
// Mirrors TIME_VALUE_YEN_PER_CAR_MIN / RUNNING_COST_YEN_PER_CAR_KM in
// pipeline/R/score_roi.R. https://www.mlit.go.jp/road/ir/ir-hyouka/ben-eki_2.pdf

/** ¥/minute/passenger car. */
export const TIME_VALUE_YEN_PER_CAR_MIN = 43.74;

/** ¥/km/passenger car, urban road (市街地), 40km/h. */
export const RUNNING_COST_YEN_PER_CAR_KM = 24.43;

// --- Illustrative: replace with local data where you have it -------------

/** kg CO₂ per car km. Mirrors CO2_KG_PER_CAR_KM. Typical tailpipe figure. */
export const CO2_KG_PER_CAR_KM = 0.13;

/** ¥ per km cycled. Mirrors HEALTH_YEN_PER_KM_CYCLED — a proxy, not HEAT. */
export const HEALTH_YEN_PER_KM_CYCLED = 15;

/**
 * Effective door-to-door urban car speed, km/h. Not a new assumption: it is
 * score_roi.R's own AVG_SHORT_TRIP_KM (2.0) over its AVG_SHORT_TRIP_CAR_MINUTES
 * (8), i.e. the same 15km/h effective speed the hex-level ROI already assumes,
 * including traffic and parking search. Stated as a speed here because this
 * scores one route of arbitrary length rather than a fixed 2km trip.
 */
export const URBAN_CAR_SPEED_KMH = 15;

/**
 * Free-running cycling speed on a calm street, km/h. Mid-range for an ordinary
 * adult on an ordinary bike; not measured here.
 */
export const CYCLING_SPEED_KMH = 15;

/**
 * What traffic stress does to that speed.
 *
 * This is where this file departs from the route plan, deliberately. The plan
 * wrote the estimate as `distance / avg(speed_kmh along route)`, but
 * `speed_kmh` in segments.geojson is the road's *posted car speed limit* — an
 * input to `score_lts()`, not anybody's travel speed. Dividing a bike trip's
 * distance by it produces a 50km/h cyclist on exactly the roads that are worst
 * to ride on, which is backwards twice over.
 *
 * So the posted limit enters through `lts`, which is what it actually informs,
 * and the multiplier runs the right way: a hostile road is slower, because a
 * rider on it is negotiating parked cars, pulling onto the footway, and waiting
 * for gaps. Illustrative — the shape is defensible, the magnitudes are not
 * calibrated against anything.
 */
export const LTS_SPEED_FACTOR: Record<number, number> = {
  1: 1.0,
  2: 0.95,
  3: 0.85,
  4: 0.75,
};

/**
 * Seconds lost per signalised junction along the route. This is the payoff for
 * having fetched signals at all — ORS's own duration does not model them.
 * Illustrative: a rider meets some fraction of junctions on green, so this is
 * an expected value per junction, not a full cycle wait.
 */
export const SECONDS_PER_TRAFFIC_SIGNAL = 18;

/**
 * Signal nodes closer together than this are one junction.
 *
 * OSM tags `highway=traffic_signals` per approach, so a crossroads is several
 * nodes a few metres apart — 465 nodes across ~294 junctions in this study
 * area. A rider stops once per junction, not once per node, so the raw nodes
 * have to be clustered before any of this means anything as a delay.
 *
 * This is also why the route scorer counts junctions from the signal point
 * layer instead of summing `traffic_signals_count` along the matched segments:
 * that column counts nodes within 15m of a *way*, so every way meeting a
 * junction counts all of its nodes, and the same junction is then counted
 * again by the next segment the route uses. Across this study area those
 * per-segment counts sum to 1,661 for 294 real junctions.
 */
export const SIGNAL_JUNCTION_CLUSTER_M = 30;

/**
 * How near the route a junction has to be to count as ridden through. Tight
 * enough that a signal on a parallel street one block over does not count, wide
 * enough to absorb the offset between ORS's centreline and OSM's node.
 */
export const SIGNAL_ROUTE_TOLERANCE_M = 20;

/**
 * How far from the destination a bike parking or sharing dock still counts as
 * "at the destination", in metres. Same radius as BIKE_PARKING_RADIUS_M in
 * pipeline/scripts/08_join_poi.R, so the route tool and the hex counts agree
 * about what "nearby" means.
 */
export const DESTINATION_FACILITY_RADIUS_M = 300;

/**
 * Map-matching tolerance, metres: how far the ORS route may sit from one of our
 * segments and still be counted as running along it. Matches the buffer
 * distances used throughout the R pipeline's spatial joins, and is wide enough
 * to absorb the offset between ORS's graph and our own OSM extract without
 * being so wide that it grabs the parallel street.
 */
export const MATCH_TOLERANCE_M = 20;

/**
 * Length of the pieces the ORS route is cut into before matching, metres.
 * Small enough that a chunk belongs to one street, large enough that a 10km
 * route is hundreds of lookups rather than thousands.
 */
export const CHUNK_LENGTH_M = 15;

// --- Graph routing: what stress costs a rider ----------------------------

/**
 * The detour a rider is assumed willing to make to avoid one metre of a given
 * LTS class — the cost multiplier the `graph` provider's Dijkstra minimises.
 *
 * This is the one thing no external provider can do for us. ORS and BRouter
 * both route on generic profiles that have never seen `lts`; this table is
 * where the pipeline's own stress classification finally gets to *choose* the
 * road rather than merely describe it after the fact. See PROJECT_STATUS.md
 * C.3 — this is the answer to the V2 question.
 *
 * Read a multiplier as "1m here costs as much as Nm on a calm street", so
 * `relaxed`'s 8.0 on LTS 4 means a rider will ride up to 800m around to avoid
 * 100m of hostile road, and no further. Illustrative: the ordering and rough
 * magnitudes are defensible, the exact values are not calibrated against
 * observed route choice. They are the obvious thing to tune first.
 */
export const LTS_COST_FACTOR: Record<string, Record<number, number>> = {
  /** Safety first, detour accepted. */
  relaxed: { 1: 1.0, 2: 1.3, 3: 3.0, 4: 8.0 },
  /** The default: prefers calm, but will not treble the trip for it. */
  efficient: { 1: 1.0, 2: 1.1, 3: 1.6, 4: 2.6 },
  /** Nearly pure travel time; stress barely enters. */
  quick: { 1: 1.0, 2: 1.0, 3: 1.05, 4: 1.15 },
};

/**
 * How far from a clicked point the graph router will look for a node to start
 * from, metres. Beyond this the click is treated as unroutable rather than
 * silently teleported to a street several blocks away.
 */
export const GRAPH_SNAP_RADIUS_M = 250;
