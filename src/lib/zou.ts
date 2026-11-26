// ZOU! regional timetable (Région Sud): the coaches and trains serving the
// Avignon area, for the journey planner (lib/journey). Open data published by
// the Région on transport.data.gouv.fr:
//  - "Proximité": coach lines numbered 100–9999 (902 Orange, 905 Carpentras,
//    906 L'Isle-sur-la-Sorgue, 907 Cavaillon, 920 Carpentras – Agroparc…);
//  - "Express": coach lines 1–99 (63 Aix-en-Provence) and the ZOU! trains (TER).
// School services (a separate "Scolaire" feed) are left out.
//
// Each feed covers the whole region (≈ 8 MB zipped): both are downloaded on the
// device, reduced to the trips calling within AREA_RADIUS_M of Avignon plus the
// "feeder" trips meeting one of them at a stop (≤ FEEDER_RADIUS_M) closer than
// HUB_RADIUS_M to Avignon (a village line into Carpentras…), and cached as JSON
// (a few hundred kB). Times stay in GTFS form: seconds since the start of the
// service day (lib/gtfs).
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';
import { distanceM, eachRow, gtfsTime, parseCalendar, PointGrid, type ServiceCalendar } from './gtfs';
import { t } from './i18n';

/** Stable links to the feeds' GTFS resources (transport.data.gouv.fr redirects to the current file). */
const FEEDS = [
  { key: 'p', url: 'https://transport.data.gouv.fr/resources/82137/download' }, // ZOU! Proximité
  { key: 'e', url: 'https://transport.data.gouv.fr/resources/82285/download' }, // ZOU! Express and trains
] as const;

/** Centre of Avignon. */
const AVIGNON: [number, number] = [43.9493, 4.8055];
/** Trips calling this close to Avignon are kept (Grand Avignon, Avignon TGV, Agroparc…). */
const AREA_RADIUS_M = 12_000;
/** Feeder trips are kept when they meet a kept trip at a stop this close to Avignon… */
const HUB_RADIUS_M = 60_000;
/** …within this walking distance. */
const FEEDER_RADIUS_M = 300;

/** Re-download after this long (the feeds are valid for months and updated a few times a year). */
const MAX_AGE_MS = 7 * 24 * 3600_000;
const CACHE_VERSION = 2;
/** With a (stale) copy to use, don't retry a failed download (≈ 15 MB) on every search: wait this long. */
const RETRY_AFTER_MS = 10 * 60_000;

/** Call flags: no boarding / no alighting there, boarding / alighting to book by phone (on-demand services). */
export const NO_PICKUP = 1;
export const NO_DROP_OFF = 2;
export const BOOK_PICKUP = 4;
export const BOOK_DROP_OFF = 8;

/** A line: short name ("905", "C7"), GTFS route_type (2 = train, 3 = coach), colours. */
export type ZouRoute = { short: string; type: number; bg: string; text: string };
export type ZouTrip = {
  route: number;
  service: string;
  headsign: string;
  /** Calls in order, flattened: stop index, arrival, departure (s since the service day start), flags. */
  calls: number[];
};
/** A platform; `insee`: code of its commune (lib/communes), null for stations named after their town. */
export type ZouStop = { name: string; lat: number; lon: number; insee: string | null };
export type ZouTimetable = {
  version: number;
  fetchedAt: number;
  stops: ZouStop[];
  routes: ZouRoute[];
  trips: ZouTrip[];
} & ServiceCalendar;

/** Commune INSEE code at the end of a ZOU! stop_id: "ZOP:00245-8400700" → "84007" (train stations have none). */
const inseeOf = (stopId: string) => /-(\d{2}[\dAB]\d{2})\d{2}[A-Z]*$/.exec(stopId)?.[1] ?? null;

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

// ---------- GTFS parsing ----------

/** Merges the feeds (`key` prefixes their service ids) and keeps the trips serving the Avignon area. */
export function parseZou(feeds: { key: string; zip: Uint8Array }[]): ZouTimetable {
  const stops: ZouTimetable['stops'] = [];
  const routes: ZouRoute[] = [];
  const trips: ZouTrip[] = [];
  const calendars: { key: string; calendar: string; dates: string }[] = [];

  for (const { key, zip } of feeds) {
    const files = unzipSync(zip, { filter: (f) => /^(routes|stops|trips|stop_times|calendar|calendar_dates)\.txt$/.test(f.name) });
    const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');

    const stopIndex = new Map<string, number>();
    eachRow(text('stops.txt'), (get) => {
      if ((get('location_type') || '0') !== '0') return; // stations and entrances: trips call at their platforms
      const lat = Number(get('stop_lat'));
      const lon = Number(get('stop_lon'));
      if (!lat || !lon) return;
      stopIndex.set(get('stop_id'), stops.length);
      stops.push({ name: get('stop_name').trim(), lat: round5(lat), lon: round5(lon), insee: inseeOf(get('stop_id')) });
    });

    const routeIndex = new Map<string, number>();
    eachRow(text('routes.txt'), (get) => {
      const type = get('route_type');
      const color = get('route_color');
      const textColor = get('route_text_color');
      routeIndex.set(get('route_id'), routes.length);
      routes.push({
        short: get('route_short_name').trim(),
        type: type === '' ? 3 : Number(type),
        bg: color ? `#${color}` : '#1C4F9C',
        text: textColor ? `#${textColor}` : '#FFFFFF',
      });
    });

    const local: { trip: ZouTrip; seqs: number[] }[] = [];
    const tripIndex = new Map<string, number>();
    eachRow(text('trips.txt'), (get) => {
      const route = routeIndex.get(get('route_id'));
      if (route === undefined) return;
      tripIndex.set(get('trip_id'), local.length);
      local.push({ trip: { route, service: `${key}:${get('service_id')}`, headsign: get('trip_headsign').trim(), calls: [] }, seqs: [] });
    });

    eachRow(text('stop_times.txt'), (get) => {
      const ti = tripIndex.get(get('trip_id'));
      const stop = stopIndex.get(get('stop_id'));
      if (ti === undefined || stop === undefined) return;
      const arrival = get('arrival_time');
      const departure = get('departure_time');
      if (!arrival && !departure) return; // untimed call (on-demand zone)
      const pickup = get('pickup_type');
      const dropOff = get('drop_off_type');
      const flags =
        (pickup === '1' ? NO_PICKUP : 0) |
        (dropOff === '1' ? NO_DROP_OFF : 0) |
        (pickup === '2' ? BOOK_PICKUP : 0) |
        (dropOff === '2' ? BOOK_DROP_OFF : 0);
      const { trip, seqs } = local[ti];
      trip.calls.push(stop, gtfsTime(arrival || departure), gtfsTime(departure || arrival), flags);
      seqs.push(Number(get('stop_sequence')));
    });

    for (const { trip, seqs } of local) {
      if (seqs.length < 2) continue;
      const calls = trip.calls;
      const order = seqs.map((_, i) => i).sort((a, b) => seqs[a] - seqs[b]);
      trip.calls = order.flatMap((i) => calls.slice(i * 4, i * 4 + 4));
      // No headsign: the terminus.
      trip.headsign ||= stops[trip.calls[trip.calls.length - 4]].name;
      trips.push(trip);
    }
    calendars.push({ key, calendar: text('calendar.txt'), dates: text('calendar_dates.txt') });
  }

  // Trips serving the Avignon area, then the feeders meeting them at a nearby hub.
  const fromAvignon = stops.map((s) => distanceM(AVIGNON, [s.lat, s.lon]));
  const kept = new Set<ZouTrip>();
  const hubs = new PointGrid(FEEDER_RADIUS_M);
  for (const trip of trips) {
    let inArea = false;
    for (let i = 0; i < trip.calls.length && !inArea; i += 4) inArea = fromAvignon[trip.calls[i]] < AREA_RADIUS_M;
    if (!inArea) continue;
    kept.add(trip);
    for (let i = 0; i < trip.calls.length; i += 4) {
      const s = trip.calls[i];
      if (fromAvignon[s] < HUB_RADIUS_M) hubs.add(s, stops[s].lat, stops[s].lon);
    }
  }
  for (const trip of trips) {
    if (kept.has(trip)) continue;
    for (let i = 0; i < trip.calls.length; i += 4) {
      const s = trip.calls[i];
      if (fromAvignon[s] < HUB_RADIUS_M + FEEDER_RADIUS_M && hubs.any(stops[s].lat, stops[s].lon, FEEDER_RADIUS_M)) {
        kept.add(trip);
        break;
      }
    }
  }

  // Renumber the stops and lines still used.
  const stopMap = new Map<number, number>();
  const routeMap = new Map<number, number>();
  const out: ZouTimetable = { version: CACHE_VERSION, fetchedAt: Date.now(), stops: [], routes: [], trips: [], calendar: {}, added: {}, removed: {} };
  const services = new Set<string>();
  for (const trip of trips) {
    if (!kept.has(trip)) continue;
    const calls = trip.calls.slice();
    for (let i = 0; i < calls.length; i += 4) {
      let s = stopMap.get(calls[i]);
      if (s === undefined) {
        stopMap.set(calls[i], (s = out.stops.length));
        out.stops.push(stops[calls[i]]);
      }
      calls[i] = s;
    }
    let route = routeMap.get(trip.route);
    if (route === undefined) {
      routeMap.set(trip.route, (route = out.routes.length));
      out.routes.push(routes[trip.route]);
    }
    out.trips.push({ route, service: trip.service, headsign: trip.headsign, calls });
    services.add(trip.service);
  }
  for (const c of calendars) {
    const part = parseCalendar(c.calendar, c.dates, services, `${c.key}:`);
    Object.assign(out.calendar, part.calendar);
    Object.assign(out.added, part.added);
    Object.assign(out.removed, part.removed);
  }
  if (!out.trips.length) throw new Error(t('err.zouNoTrips'));
  return out;
}

// ---------- download + cache ----------

const cacheFile = () => new File(Paths.document, 'zou-timetable.json');
let memory: ZouTimetable | null = null;
let loading: Promise<ZouTimetable> | null = null;
let lastFailure = 0;

async function download(): Promise<ZouTimetable> {
  const feeds = await Promise.all(
    FEEDS.map(async ({ key, url }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(t('err.zouHttp', { status: res.status }));
      return { key, zip: await res.bytes() };
    }),
  );
  const tt = parseZou(feeds);
  try {
    await cacheFile().write(JSON.stringify(tt));
  } catch {
    // Not cached (disk full…): still usable until the app restarts.
  }
  return tt;
}

/** Whether a copy is cached (otherwise loading it downloads ≈ 15 MB). */
export function zouCached(): boolean {
  try {
    return !!memory || cacheFile().exists;
  } catch {
    return false;
  }
}

/** Cached ZOU! timetable, re-downloaded when older than MAX_AGE_MS (falls back to the stale copy offline). */
export function loadZouTimetable(): Promise<ZouTimetable> {
  loading ??= (async () => {
    if (!memory) {
      try {
        const file = cacheFile();
        if (file.exists) {
          const tt = JSON.parse(await file.text()) as ZouTimetable;
          if (tt.version === CACHE_VERSION) memory = tt;
        }
      } catch {
        // corrupted cache: download again
      }
    }
    const stale = !!memory && Date.now() - memory.fetchedAt > MAX_AGE_MS;
    if (!memory || (stale && Date.now() - lastFailure > RETRY_AFTER_MS)) {
      try {
        memory = await download();
      } catch (e) {
        lastFailure = Date.now();
        if (!memory) throw e;
      }
    }
    return memory;
  })().finally(() => {
    loading = null;
  });
  return loading;
}
