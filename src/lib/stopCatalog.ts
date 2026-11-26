// Stops offered by the Bus widget: every ORIZO stop (by name, as before) and every
// ZOU! stop of the Avignon area, by name and commune ("Gare Routière · Châteaurenard",
// lib/communes). A ZOU! stop with the same name as an ORIZO stop close by
// ("Université", "Lycée Agricole"…) is merged into it: one entry, trips from the
// platforms of both networks.
import { busStops, type Timetable } from './bus';
import { communeName } from './communes';
import { normalizeSearch } from './events';
import { distanceM } from './gtfs';
import type { ZouTimetable } from './zou';

/** ZOU! platforms this close to an ORIZO stop of the same name are the same place. */
const MERGE_RADIUS_M = 400;
/** ZOU! stops farther from Avignon are left out (the trains' far ends: Lyon, Annecy, Agde…); Marseille and Aix stay. */
const AVIGNON: [number, number] = [43.9493, 4.8055];
const CATALOG_RADIUS_M = 100_000;
const ZOU_PREFIX = 'zou:';

export type CatalogLine = { network: 'orizo' | 'zou'; line: string };
export type CatalogStop = {
  /** Saved in the prefs: the ORIZO stop name (as before), or "zou:<name>|<INSEE code>" for a ZOU!-only stop. */
  key: string;
  name: string;
  /** Commune of a ZOU!-only stop ("Châteaurenard"), null for ORIZO stops. */
  town: string | null;
  lat: number;
  lon: number;
  /** ORIZO stop name (null for a ZOU!-only stop) and ZOU! platforms (indexes in ZouTimetable.stops). */
  orizo: string | null;
  zou: number[];
  /** Lines calling there, ORIZO first. */
  lines: CatalogLine[];
};

export const isZouStopKey = (key: string | null | undefined) => !!key?.startsWith(ZOU_PREFIX);

/** Name and commune of a saved stop, before the ZOU! timetable is loaded: "zou:Gare Routière|13027" → Châteaurenard. */
export function stopLabel(key: string): { name: string; town: string | null } {
  if (!isZouStopKey(key)) return { name: key, town: null };
  const [name, insee] = key.slice(ZOU_PREFIX.length).split('|');
  return { name, town: communeName(insee) };
}

const byLine = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

/** ORIZO stops (if loaded) and ZOU! stops (if loaded), sorted by name then commune. */
export function stopCatalog(orizo: Timetable | null, zou: ZouTimetable | null): CatalogStop[] {
  const out: CatalogStop[] = [];
  const orizoByName = new Map<string, CatalogStop[]>();
  if (orizo)
    for (const s of busStops(orizo)) {
      const [lat, lon] = orizo.stopCoords[s.name] ?? [0, 0];
      const entry: CatalogStop = {
        key: s.name,
        name: s.name,
        town: null,
        lat,
        lon,
        orizo: s.name,
        zou: [],
        lines: s.lines.map((line) => ({ network: 'orizo', line })),
      };
      out.push(entry);
      const norm = normalizeSearch(s.name);
      orizoByName.set(norm, [...(orizoByName.get(norm) ?? []), entry]);
    }

  if (zou) {
    // Lines calling at each platform.
    const routesAt = zou.stops.map(() => new Set<number>());
    for (const trip of zou.trips) for (let k = 0; k < trip.calls.length; k += 4) routesAt[trip.calls[k]].add(trip.route);
    // Platforms of one stop: same name, same commune.
    const groups = new Map<string, number[]>();
    zou.stops.forEach((s, i) => {
      const key = `${normalizeSearch(s.name)}|${s.insee ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    for (const platforms of groups.values()) {
      const first = zou.stops[platforms[0]];
      const lat = platforms.reduce((sum, p) => sum + zou.stops[p].lat, 0) / platforms.length;
      const lon = platforms.reduce((sum, p) => sum + zou.stops[p].lon, 0) / platforms.length;
      const lines = [...new Set(platforms.flatMap((p) => [...routesAt[p]].map((r) => zou.routes[r].short)))].sort(byLine);
      const twin = orizoByName.get(normalizeSearch(first.name))?.find((o) => distanceM([o.lat, o.lon], [lat, lon]) < MERGE_RADIUS_M);
      if (twin) {
        twin.zou.push(...platforms);
        for (const line of lines) if (!twin.lines.some((l) => l.network === 'zou' && l.line === line)) twin.lines.push({ network: 'zou', line });
        continue;
      }
      if (distanceM(AVIGNON, [lat, lon]) > CATALOG_RADIUS_M) continue;
      out.push({
        key: `${ZOU_PREFIX}${first.name}|${first.insee ?? ''}`,
        name: first.name,
        town: communeName(first.insee),
        lat,
        lon,
        orizo: null,
        zou: platforms,
        lines: lines.map((line) => ({ network: 'zou', line })),
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'fr') || (a.town ?? '').localeCompare(b.town ?? '', 'fr'));
}
