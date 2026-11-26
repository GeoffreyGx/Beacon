// GTFS helpers shared by the ORIZO timetable (bus.ts) and the ZOU! regional
// timetable (zou.ts): a minimal CSV reader, GTFS dates and times, service
// calendars and distances. No React Native imports.
import { parisParts, weekday } from './time';

/** Minimal CSV line parser (quoted fields, "" escapes). */
function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Calls `row(get)` for each data line; `get(column)` reads a field of the current line. */
export function eachRow(text: string, row: (get: (col: string) => string, firstField: string) => void) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = splitCsv(lines[0]);
  const index = new Map(header.map((h, i) => [h.trim(), i]));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let fields: string[] | null = null;
    const get = (col: string) => {
      fields ??= splitCsv(line);
      return fields[index.get(col) ?? -1] ?? '';
    };
    row(get, line.slice(0, line.indexOf(',')).replace(/"/g, ''));
  }
}

/** "20261124" → "2026-11-24". */
const gtfsDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/** "25:10:00" → seconds since the start of the service day (may exceed 24 h). */
export const gtfsTime = (s: string) => {
  const [h, m, sec] = s.split(':').map(Number);
  return h * 3600 + m * 60 + (sec || 0);
};

/** Services of a feed: weekdays (Mon..Sun) and validity range, dates added / removed (YYYY-MM-DD). */
export type ServiceCalendar = {
  calendar: Record<string, { days: boolean[]; start: string; end: string }>;
  added: Record<string, string[]>;
  removed: Record<string, string[]>;
};

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * Reads calendar.txt and calendar_dates.txt, keeping the services whose
 * `prefix + service_id` is in `keep` (stored under that prefixed id).
 */
export function parseCalendar(calendarTxt: string, datesTxt: string, keep: Set<string>, prefix = ''): ServiceCalendar {
  const calendar: ServiceCalendar['calendar'] = {};
  eachRow(calendarTxt, (get) => {
    const id = prefix + get('service_id');
    if (!keep.has(id)) return;
    calendar[id] = { days: WEEKDAYS.map((d) => get(d) === '1'), start: gtfsDate(get('start_date')), end: gtfsDate(get('end_date')) };
  });
  const added: ServiceCalendar['added'] = {};
  const removed: ServiceCalendar['removed'] = {};
  eachRow(datesTxt, (get) => {
    const id = prefix + get('service_id');
    if (!keep.has(id)) return;
    const target = get('exception_type') === '1' ? added : removed;
    (target[id] ??= []).push(gtfsDate(get('date')));
  });
  return { calendar, added, removed };
}

/** Whether `service` runs on the Paris day `day` (YYYY-MM-DD). */
export function serviceRuns(c: ServiceCalendar, service: string, day: string) {
  if (c.removed[service]?.includes(day)) return false;
  if (c.added[service]?.includes(day)) return true;
  const cal = c.calendar[service];
  return !!cal && cal.start <= day && day <= cal.end && cal.days[(weekday(day) + 6) % 7];
}

/** GTFS service-day origin (ms): noon (Paris) minus 12 h, so DST days work. */
export function serviceDayStart(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const utcNoon = Date.UTC(y, m - 1, d, 12);
  const offsetMin = parisParts(new Date(utcNoon)).minutes - 12 * 60; // Paris is ahead of UTC by this
  return utcNoon - offsetMin * 60_000 - 12 * 3600_000;
}

/** Distance in metres between two [lat, lon] points (haversine). */
export function distanceM([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

const M_PER_DEG_LAT = 111_320;
/** Metres per degree of longitude around 44° N (Provence): cells are only a bucketing, the distances stay exact. */
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((44 * Math.PI) / 180);

/** Points bucketed in square cells, for "which points are within r metres" queries. */
export class PointGrid {
  private readonly cellM: number;
  private readonly cells = new Map<string, number[]>();

  constructor(cellM: number) {
    this.cellM = cellM;
  }

  private key(row: number, col: number) {
    return `${row},${col}`;
  }

  add(id: number, lat: number, lon: number) {
    const k = this.key(Math.floor((lat * M_PER_DEG_LAT) / this.cellM), Math.floor((lon * M_PER_DEG_LON) / this.cellM));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(id, lat, lon);
  }

  /** Calls `visit(id, distance)` for each point within `radius` metres of [lat, lon]; stops when it returns true. */
  private scan(lat: number, lon: number, radius: number, visit: (id: number, distance: number) => boolean | void) {
    const row = Math.floor((lat * M_PER_DEG_LAT) / this.cellM);
    const col = Math.floor((lon * M_PER_DEG_LON) / this.cellM);
    const span = Math.ceil(radius / this.cellM);
    for (let r = row - span; r <= row + span; r++)
      for (let c = col - span; c <= col + span; c++) {
        const cell = this.cells.get(this.key(r, c));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i += 3) {
          const d = distanceM([lat, lon], [cell[i + 1], cell[i + 2]]);
          if (d <= radius && visit(cell[i], d)) return;
        }
      }
  }

  /** [id, distance in metres] of the points within `radius` metres of [lat, lon], nearest first. */
  near(lat: number, lon: number, radius: number): [number, number][] {
    const out: [number, number][] = [];
    this.scan(lat, lon, radius, (id, d) => {
      out.push([id, d]);
    });
    return out.sort((a, b) => a[1] - b[1]);
  }

  /** Whether a point lies within `radius` metres of [lat, lon]. */
  any(lat: number, lon: number, radius: number): boolean {
    let found = false;
    this.scan(lat, lon, radius, () => (found = true));
    return found;
  }
}
