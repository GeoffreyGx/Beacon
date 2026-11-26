// Trips from a stop to a campus (Bus widget), combining the ORIZO buses and tram
// (lib/bus) with the ZOU! regional coaches and trains (lib/zou). Computed on the
// device from the cached timetables (scheduled times, no realtime).
//
// Both networks are merged into one graph whose nodes are stop platforms. Each
// platform is linked on foot to every platform within TRANSFER_RADIUS_M, which
// is how the two networks connect (ZOU! "PEM Gare Routière" ↔ ORIZO "Gare
// Routière", trains at "Avignon Centre" ↔ tram "Gare Centre", ZOU! and ORIZO
// "Université"…). Walking time: straight-line distance × WALK_DETOUR at WALK_SPEED.
//
// Routing: Connection Scan Algorithm over the day's connections (two
// consecutive calls of a trip) sorted by departure, minimising the arrival time
// plus RIDE_PENALTY_S per vehicle (so an extra change must save real time). It
// is run again from just after each trip's departure to find the next options.
// An option that leaves earlier without arriving earlier is dropped (the result
// is the departure / arrival Pareto front), and so is one that only leaves a few
// minutes later at the cost of an extra vehicle. The first options with a change
// also get a variant changing elsewhere (the search run again from the same time,
// avoiding their change stops): ZOU! 707 to Duffaut then C2, or to the Gare
// Routière then the 04.
import type { Timetable } from './bus';
import { distanceM, PointGrid, serviceDayStart, serviceRuns, type ServiceCalendar } from './gtfs';
import { addDays, parisParts } from './time';
import { BOOK_DROP_OFF, BOOK_PICKUP, NO_DROP_OFF, NO_PICKUP, type ZouTimetable } from './zou';

/** Walking speed (m/s, ≈ 4.5 km/h) and detour applied to straight-line distances. */
const WALK_SPEED = 1.25;
const WALK_DETOUR = 1.3;
/** Platforms this close are linked on foot (changes between lines and networks). */
const TRANSFER_RADIUS_M = 400;
/** Stops considered around the campus. */
const EGRESS_RADIUS_M = 1000;
/** Changing vehicles takes at least this long, and walking between platforms WALK_BUFFER_S more than the walk. */
const MIN_TRANSFER_S = 120;
const WALK_BUFFER_S = 60;
/** Each vehicle counts as this much extra travel time when choosing between trips. */
const RIDE_PENALTY_S = 180;
/** A later option with one more vehicle is only listed if it leaves at least this much later. */
const EXTRA_RIDE_MIN_GAIN_MS = 10 * 60_000;
/** Platforms closer than this are the same place: no walking step. */
const SAME_PLACE_M = 25;
/** Departures considered after the requested time (late in the evening: the first trips of the next morning). */
const HORIZON_S = 12 * 3600;
/** The next day's trips are added up to this time (s since today's start): tomorrow 14:00 covers any query + HORIZON_S. */
const TOMORROW_UNTIL_S = 86_400 + 14 * 3600;
/** Walking all the way to the campus is offered up to this long. */
const WALK_ONLY_MAX_S = 20 * 60;
/** Variants (other lines after the first vehicle) are looked for on the first VARIANT_OF options. */
const VARIANT_OF = 2;
/** A variant is listed if it leaves at most VARIANT_MAX_LATER_MS after the option and arrives at most VARIANT_MAX_DELAY_MS after it. */
const VARIANT_MAX_LATER_MS = 10 * 60_000;
const VARIANT_MAX_DELAY_MS = 30 * 60_000;

export type Network = 'orizo' | 'zou';
export type Mode = 'bus' | 'tram' | 'train';
export type Point = { lat: number; lon: number };
export type JourneyStop = Point & { name: string };

/** `from` / `to` null: the starting stop / the campus. Times in ms, distance in metres. */
export type WalkLeg = { kind: 'walk'; from: JourneyStop | null; to: JourneyStop | null; start: number; end: number; distance: number };
export type RideLeg = {
  kind: 'ride';
  network: Network;
  /** Line number ("C3", "905", "K7"). */
  line: string;
  mode: Mode;
  color: { bg: string; text: string };
  headsign: string;
  from: JourneyStop;
  to: JourneyStop;
  start: number;
  end: number;
  /** Stops travelled (the alighting stop included). */
  stops: number;
  /** Boarding or alighting must be booked by phone (on-demand service). */
  booking: boolean;
};
export type Leg = WalkLeg | RideLeg;
export type Journey = { departure: number; arrival: number; legs: Leg[]; rides: number };

/** Where trips start: an ORIZO stop (all its platforms) and / or ZOU! platforms (lib/stopCatalog). */
export type Origin = Point & { orizo: string | null; zou: number[] };

const walkSeconds = (metres: number) => Math.round((metres * WALK_DETOUR) / WALK_SPEED);
const walkMetres = (metres: number) => Math.round((metres * WALK_DETOUR) / 10) * 10;
const ll = (p: Point): [number, number] => [p.lat, p.lon];

// ---------- merged graph ----------

type Route = { network: Network; line: string; mode: Mode; color: { bg: string; text: string } };
/** `calls`: node, arrival, departure (s since the service day start), flags (lib/zou), flattened. `calendar`: 0 ORIZO, 1 ZOU!. */
type Trip = { route: number; service: string; calendar: 0 | 1; headsign: string; calls: number[] };
type Graph = {
  names: string[];
  lat: number[];
  lon: number[];
  routes: Route[];
  trips: Trip[];
  calendars: [ServiceCalendar, ServiceCalendar];
  /** node → [neighbour, walking seconds, …] (platforms within TRANSFER_RADIUS_M). */
  walks: number[][];
  grid: PointGrid;
  /** ORIZO stop name → its platforms' nodes; ZOU! platform index → node. */
  orizoByName: Map<string, number[]>;
  zouNodes: number[];
};

const ORIZO_DEFAULT_COLOR = { bg: '#00787A', text: '#ffffff' };

function buildGraph(orizo: Timetable, zou: ZouTimetable): Graph {
  const g: Graph = {
    names: [],
    lat: [],
    lon: [],
    routes: [],
    trips: [],
    calendars: [orizo, zou],
    walks: [],
    grid: new PointGrid(TRANSFER_RADIUS_M),
    orizoByName: new Map(),
    zouNodes: [],
  };
  const addNode = (name: string, lat: number, lon: number) => {
    const id = g.names.length;
    g.names.push(name);
    g.lat.push(lat);
    g.lon.push(lon);
    g.grid.add(id, lat, lon);
    return id;
  };

  // ORIZO: one node per platform, lines by number.
  const orizoNodes = new Map<string, number>();
  for (const [id, [lat, lon]] of Object.entries(orizo.stopPos)) {
    const name = orizo.stopNames[id] ?? id;
    const node = addNode(name, lat, lon);
    orizoNodes.set(id, node);
    g.orizoByName.set(name, [...(g.orizoByName.get(name) ?? []), node]);
  }
  const orizoRoutes = new Map<string, number>();
  for (const trip of orizo.trips) {
    let route = orizoRoutes.get(trip.line);
    if (route === undefined) {
      orizoRoutes.set(trip.line, (route = g.routes.length));
      g.routes.push({
        network: 'orizo',
        line: trip.line,
        mode: /^T\d/i.test(trip.line) ? 'tram' : 'bus',
        color: orizo.lineColors[trip.line] ?? ORIZO_DEFAULT_COLOR,
      });
    }
    const calls: number[] = [];
    for (const [stopId, time] of trip.stops) {
      const node = orizoNodes.get(stopId);
      if (node !== undefined) calls.push(node, time, time, 0);
    }
    if (calls.length >= 8) g.trips.push({ route, service: trip.service, calendar: 0, headsign: trip.headsign, calls });
  }

  // ZOU!
  g.zouNodes = zou.stops.map((s) => addNode(s.name, s.lat, s.lon));
  const zouRoutes = zou.routes.map((r) => {
    g.routes.push({ network: 'zou', line: r.short, mode: r.type === 2 ? 'train' : r.type === 0 ? 'tram' : 'bus', color: { bg: r.bg, text: r.text } });
    return g.routes.length - 1;
  });
  for (const trip of zou.trips) {
    const calls = trip.calls.slice();
    for (let i = 0; i < calls.length; i += 4) calls[i] = g.zouNodes[calls[i]];
    g.trips.push({ route: zouRoutes[trip.route], service: trip.service, calendar: 1, headsign: trip.headsign, calls });
  }

  // Footpaths between platforms.
  for (let i = 0; i < g.names.length; i++) {
    const w: number[] = [];
    for (const [j, d] of g.grid.near(g.lat[i], g.lon[i], TRANSFER_RADIUS_M)) if (j !== i) w.push(j, walkSeconds(d));
    g.walks.push(w);
  }
  return g;
}

const graphs = new WeakMap<Timetable, WeakMap<ZouTimetable, Graph>>();
function graphOf(orizo: Timetable, zou: ZouTimetable): Graph {
  let byZou = graphs.get(orizo);
  if (!byZou) graphs.set(orizo, (byZou = new WeakMap()));
  let g = byZou.get(zou);
  if (!g) byZou.set(zou, (g = buildGraph(orizo, zou)));
  return g;
}

// ---------- the day's connections ----------

/** Connections sorted by departure (s since `base`, the service day start in ms); a "run" is a trip on a given day. */
type Day = {
  base: number;
  count: number;
  dep: Int32Array;
  arr: Int32Array;
  from: Int32Array;
  to: Int32Array;
  run: Int32Array;
  /** Index in the trip's `calls` of the departure call. */
  call: Int32Array;
  runTrip: Int32Array;
  /** Start of the trip's service day relative to `base` (s): 0, about −86 400 (yesterday's trips past midnight) or +86 400 (tomorrow morning). */
  runOffset: Int32Array;
};

const days = new WeakMap<Graph, Map<string, Day>>();

function dayConnections(g: Graph, day: string): Day {
  let byDay = days.get(g);
  if (!byDay) days.set(g, (byDay = new Map()));
  const hit = byDay.get(day);
  if (hit) return hit;

  const dep: number[] = [];
  const arr: number[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const run: number[] = [];
  const call: number[] = [];
  const runTrip: number[] = [];
  const runOffset: number[] = [];
  const base = serviceDayStart(day);
  // Exact offsets (in s), so DST change nights stay right.
  const services = [addDays(day, -1), day, addDays(day, 1)].map((d) => [d, Math.round((serviceDayStart(d) - base) / 1000)] as const);
  for (let ti = 0; ti < g.trips.length; ti++) {
    const trip = g.trips[ti];
    const c = trip.calls;
    for (const [d, offset] of services) {
      // Yesterday's trips only matter for their calls after midnight, tomorrow's for the morning.
      if (offset < 0 && c[c.length - 3] + offset <= 0) continue;
      if (offset > 0 && c[2] + offset > TOMORROW_UNTIL_S) continue;
      if (!serviceRuns(g.calendars[trip.calendar], trip.service, d)) continue;
      const r = runTrip.length;
      runTrip.push(ti);
      runOffset.push(offset);
      for (let k = 0; k + 4 < c.length; k += 4) {
        const depT = c[k + 2] + offset;
        const arrT = c[k + 5] + offset;
        if (depT < 0 || arrT < depT) continue;
        dep.push(depT);
        arr.push(arrT);
        from.push(c[k]);
        to.push(c[k + 4]);
        run.push(r);
        call.push(k);
      }
    }
  }

  const order = Array.from(dep.keys()).sort((a, b) => dep[a] - dep[b] || arr[a] - arr[b]);
  const sorted = (src: number[]) => Int32Array.from(order, (i) => src[i]);
  const result: Day = {
    base,
    count: order.length,
    dep: sorted(dep),
    arr: sorted(arr),
    from: sorted(from),
    to: sorted(to),
    run: sorted(run),
    call: sorted(call),
    runTrip: Int32Array.from(runTrip),
    runOffset: Int32Array.from(runOffset),
  };
  if (byDay.size >= 2) byDay.clear();
  byDay.set(day, result);
  return result;
}

/** First index of the sorted `values` that is ≥ `x`. */
function lowerBound(values: Int32Array, count: number, x: number) {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------- search ----------

/** A ride: run, and the indexes in its trip's `calls` of the boarding and alighting calls. */
type Ride = { run: number; board: number; alight: number };
type Scan = { rides: Ride[]; egressNode: number };

/**
 * Best trip (arrival + RIDE_PENALTY_S per vehicle) leaving the `origin` platforms at `t` (s since the day's base) or later,
 * never boarding the `avoid` routes.
 */
function scan(g: Graph, D: Day, origin: Set<number>, egress: Map<number, number>, t: number, avoid?: Set<number>): Scan | null {
  const n = g.names.length;
  const ready = new Float64Array(n).fill(Infinity);
  const rides = new Uint8Array(n);
  /** How a node was reached: the connection alighted from (−1: it's a starting platform) and that ride's boarding connection. */
  const viaAlight = new Int32Array(n).fill(-1);
  const viaBoard = new Int32Array(n).fill(-1);
  for (const node of origin) ready[node] = t;
  const boarded = new Int32Array(D.runTrip.length).fill(-1);
  const boardRides = new Uint8Array(D.runTrip.length);
  let bestCost = Infinity;
  let bestAlight = -1;
  let bestBoard = -1;

  const relax = (node: number, time: number, r: number, alight: number, board: number) => {
    if (time < ready[node] || (time === ready[node] && r < rides[node])) {
      ready[node] = time;
      rides[node] = r;
      viaAlight[node] = alight;
      viaBoard[node] = board;
    }
  };

  const end = t + HORIZON_S;
  for (let i = lowerBound(D.dep, D.count, t); i < D.count; i++) {
    const dep = D.dep[i];
    // Any trip using a later connection costs at least its departure plus one vehicle.
    if (dep + RIDE_PENALTY_S > bestCost || dep > end) break;
    const r = D.run[i];
    const trip = g.trips[D.runTrip[r]];
    const calls = trip.calls;
    const k = D.call[i];
    if (boarded[r] < 0) {
      const from = D.from[i];
      if (ready[from] > dep || calls[k + 3] & NO_PICKUP || avoid?.has(trip.route)) continue;
      boarded[r] = i;
      boardRides[r] = rides[from] + 1;
    }
    if (calls[k + 7] & NO_DROP_OFF) continue;
    const to = D.to[i];
    const arr = D.arr[i];
    const nr = boardRides[r];
    const e = egress.get(to);
    if (e !== undefined && arr + e + nr * RIDE_PENALTY_S < bestCost) {
      bestCost = arr + e + nr * RIDE_PENALTY_S;
      bestAlight = i;
      bestBoard = boarded[r];
    }
    relax(to, arr + MIN_TRANSFER_S, nr, i, boarded[r]);
    const w = g.walks[to];
    for (let j = 0; j < w.length; j += 2) relax(w[j], arr + Math.max(MIN_TRANSFER_S, w[j + 1] + WALK_BUFFER_S), nr, i, boarded[r]);
  }
  if (bestAlight < 0) return null;

  // Back from the campus: each ride, then how its boarding stop was reached.
  const out: Ride[] = [];
  let alight = bestAlight;
  let board = bestBoard;
  for (let guard = 0; guard < 16; guard++) {
    out.unshift({ run: D.run[board], board: D.call[board], alight: D.call[alight] + 4 });
    const node = D.from[board];
    if (viaAlight[node] < 0) break;
    alight = viaAlight[node];
    board = viaBoard[node];
  }
  return { rides: out, egressNode: D.to[bestAlight] };
}

/** Builds the legs of a scan (the first vehicle is boarded at the starting stop). */
function toJourney(g: Graph, D: Day, s: Scan, to: Point): Journey {
  const ms = (sec: number) => D.base + sec * 1000;
  const stop = (node: number): JourneyStop => ({ name: g.names[node], lat: g.lat[node], lon: g.lon[node] });
  const callsOf = (r: Ride) => g.trips[D.runTrip[r.run]].calls;
  const offset = (r: Ride) => D.runOffset[r.run];

  const legs: Leg[] = [];
  s.rides.forEach((r, i) => {
    const c = callsOf(r);
    if (i > 0) {
      const prev = s.rides[i - 1];
      const prevNode = callsOf(prev)[prev.alight];
      const prevArr = callsOf(prev)[prev.alight + 1] + offset(prev);
      const d = distanceM(ll(stop(prevNode)), ll(stop(c[r.board])));
      if (d >= SAME_PLACE_M) {
        legs.push({ kind: 'walk', from: stop(prevNode), to: stop(c[r.board]), start: ms(prevArr), end: ms(prevArr + walkSeconds(d)), distance: walkMetres(d) });
      }
    }
    const trip = g.trips[D.runTrip[r.run]];
    const route = g.routes[trip.route];
    legs.push({
      kind: 'ride',
      network: route.network,
      line: route.line,
      mode: route.mode,
      color: route.color,
      headsign: trip.headsign,
      from: stop(c[r.board]),
      to: stop(c[r.alight]),
      start: ms(c[r.board + 2] + offset(r)),
      end: ms(c[r.alight + 1] + offset(r)),
      stops: (r.alight - r.board) / 4,
      booking: !!(c[r.board + 3] & BOOK_PICKUP) || !!(c[r.alight + 3] & BOOK_DROP_OFF),
    });
  });

  const last = s.rides[s.rides.length - 1];
  const lastArr = callsOf(last)[last.alight + 1] + offset(last);
  const egressD = distanceM(ll(stop(s.egressNode)), ll(to));
  legs.push({ kind: 'walk', from: stop(s.egressNode), to: null, start: ms(lastArr), end: ms(lastArr + walkSeconds(egressD)), distance: walkMetres(egressD) });
  return { departure: legs[0].start, arrival: legs[legs.length - 1].end, legs, rides: s.rides.length };
}

const EMPTY_ORIZO: Timetable = { version: 0, fetchedAt: 0, lineColors: {}, stopNames: {}, stopCoords: {}, stopPos: {}, trips: [], calendar: {}, added: {}, removed: {} };
const EMPTY_ZOU: ZouTimetable = { version: 0, fetchedAt: 0, stops: [], routes: [], trips: [], calendar: {}, added: {}, removed: {} };

/**
 * Up to `max` trips from the stop `origin` to `to` (a campus) leaving at `departAt` (ms) or later,
 * soonest first; walking first when the campus is that close. A missing timetable (still loading,
 * download failed) leaves that network out.
 */
export function planFromStop(orizo: Timetable | null, zou: ZouTimetable | null, origin: Origin, to: Point, departAt: number, max: number): Journey[] {
  const g = graphOf(orizo ?? EMPTY_ORIZO, zou ?? EMPTY_ZOU);
  const journeys: Journey[] = [];

  const direct = distanceM(ll(origin), ll(to));
  if (walkSeconds(direct) <= WALK_ONLY_MAX_S) {
    const end = departAt + walkSeconds(direct) * 1000;
    journeys.push({ departure: departAt, arrival: end, rides: 0, legs: [{ kind: 'walk', from: null, to: null, start: departAt, end, distance: walkMetres(direct) }] });
  }

  const start = new Set<number>(origin.orizo ? (g.orizoByName.get(origin.orizo) ?? []) : []);
  for (const i of origin.zou) {
    const node = g.zouNodes[i];
    if (node !== undefined) start.add(node);
  }
  const egress = new Map(g.grid.near(to.lat, to.lon, EGRESS_RADIUS_M).map(([node, d]) => [node, walkSeconds(d)]));
  if (!start.size || !egress.size) return journeys;

  const D = dayConnections(g, parisParts(new Date(departAt)).day);
  const want = max - journeys.length;
  const options: { journey: Journey; scan: Scan }[] = [];
  let t = Math.floor((departAt - D.base) / 1000);
  for (let iter = 0; iter < 16 && want > 0; iter++) {
    const s = scan(g, D, start, egress, t);
    if (!s) break;
    const journey = toJourney(g, D, s, to);
    t = Math.max(t, Math.floor((journey.departure - D.base) / 1000)) + 60;
    const last = options[options.length - 1]?.journey;
    // Full, and this one arrives later: a genuinely later option, not needed.
    if (options.length >= want && journey.arrival > last.arrival) break;
    // Leaving a few minutes later at the cost of one more vehicle: not worth listing.
    if (last && journey.rides > last.rides && journey.arrival >= last.arrival - 60_000 && journey.departure - last.departure < EXTRA_RIDE_MIN_GAIN_MS)
      continue;
    // Options leaving earlier without arriving earlier (and with no fewer vehicles) are dominated.
    while (options.length && options[options.length - 1].journey.arrival >= journey.arrival && options[options.length - 1].journey.rides >= journey.rides)
      options.pop();
    options.push({ journey, scan: s });
  }

  // The first options with a change: the same search from the same time without the lines taken after the first vehicle.
  const variants: Journey[] = [];
  for (const { journey, scan: s } of options.slice(0, VARIANT_OF)) {
    if (s.rides.length < 2) continue;
    const first = g.trips[D.runTrip[s.rides[0].run]].route;
    const avoid = new Set(s.rides.slice(1).map((r) => g.trips[D.runTrip[r.run]].route).filter((route) => route !== first));
    if (!avoid.size) continue;
    const v = scan(g, D, start, egress, Math.floor((journey.departure - D.base) / 1000), avoid);
    const variant = v && toJourney(g, D, v, to);
    if (variant && variant.departure - journey.departure <= VARIANT_MAX_LATER_MS && variant.arrival - journey.arrival <= VARIANT_MAX_DELAY_MS)
      variants.push(variant);
  }

  // Soonest first, each sequence of vehicles once.
  const vehicles = (j: Journey) => j.legs.map((l) => (l.kind === 'ride' ? `${l.network} ${l.line} ${l.start} ${l.to.name}` : '')).join('|');
  const seen = new Set<string>();
  const transit = [...options.map((o) => o.journey), ...variants]
    .sort((a, b) => a.departure - b.departure || a.arrival - b.arrival)
    .filter((j) => {
      const k = vehicles(j);
      return !seen.has(k) && !!seen.add(k);
    });
  // Never offer a ride that takes longer than walking all the way.
  const walkOnly = journeys[0];
  const useful = walkOnly ? transit.filter((j) => j.arrival - j.departure < walkOnly.arrival - walkOnly.departure) : transit;
  return [...journeys, ...useful.slice(0, want)];
}
