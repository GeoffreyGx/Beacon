// Alerts shown at the top of the home screen, published by the maintainer as content files on the
// Beacon server (`content.ts`): every manifest file named `alert-<anything>.json` is one alert.
//
//   {
//     "style": "major" | "blockade" | "maintenance" | "normal" | "test",
//     "title": "…" or { "fr": "…", "en": "…" },     // localized: app language → fr → en → first
//     "content": "…" or { "fr": "…", "en": "…" },
//     "startsAt": "2026-12-01T08:00:00+01:00",      // optional: hidden before
//     "endsAt": "2026-12-01T18:00:00+01:00",        // optional: hidden after
//     "dismissible": true,                           // optional (default true): close button
//     "unverified": true                             // optional (default false): small grey note "not
//                                                    //   verified, not from Avignon Université"
//   }
//
// Invalid files are ignored. `test` alerts only show in development builds with the switch in
// Réglages → Développement. A dismissed alert stays hidden until its file changes (sha256).
// Synced on launch and when the app returns to the foreground, at most every 15 minutes.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { beaconApiAvailable } from './beaconApi';
import { readContentJson, syncContent, type Manifest } from './content';
import { useDebug } from './debugOverride';
import { getLang } from './i18n';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

export const ALERT_STYLES = ['major', 'blockade', 'maintenance', 'normal', 'test'] as const;
export type AlertStyle = (typeof ALERT_STYLES)[number];

/** Text in one language, or per language code ("fr", "en"…). */
type Localized = string | Record<string, string>;

export type Alert = {
  /** File name + sha256: changes when the maintainer edits the file. */
  key: string;
  style: AlertStyle;
  title: Localized;
  content: Localized;
  startsAt: number | null;
  endsAt: number | null;
  dismissible: boolean;
  /** Shows the "not verified, not from the university" note. */
  unverified: boolean;
};

const FILE_RE = /^alert-.+\.json$/;
const SYNC_EVERY_MS = 15 * 60_000;
const DISMISSED_PREF = 'dismissed_alerts';

const store = createStore<{ alerts: Alert[]; dismissed: string[]; now: number }>({
  alerts: [],
  dismissed: [],
  now: Date.now(),
});

const isLocalized = (v: unknown): v is Localized =>
  (typeof v === 'string' && v.trim() !== '') ||
  (typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length > 0 &&
    Object.values(v).every((s) => typeof s === 'string'));

function parseDate(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : ms;
}

function parseAlert(key: string, raw: unknown): Alert | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!ALERT_STYLES.includes(r.style as AlertStyle)) return null;
  if (!isLocalized(r.title) || !isLocalized(r.content)) return null;
  const startsAt = parseDate(r.startsAt);
  const endsAt = parseDate(r.endsAt);
  if (startsAt === undefined || endsAt === undefined) return null;
  if (r.dismissible !== undefined && typeof r.dismissible !== 'boolean') return null;
  if (r.unverified !== undefined && typeof r.unverified !== 'boolean') return null;
  return {
    key,
    style: r.style as AlertStyle,
    title: r.title,
    content: r.content,
    startsAt,
    endsAt,
    dismissible: r.dismissible !== false,
    unverified: r.unverified === true,
  };
}

async function readAlerts(manifest: Manifest | null): Promise<Alert[]> {
  if (!manifest) return [];
  const names = Object.keys(manifest.files).filter((n) => FILE_RE.test(n)).sort();
  const alerts = await Promise.all(
    names.map(async (name) => parseAlert(`${name}@${manifest.files[name].sha256}`, await readContentJson<unknown>(name))),
  );
  return alerts.filter((a): a is Alert => a !== null);
}

let dismissedLoaded = false;

async function loadDismissed() {
  if (dismissedLoaded) return;
  dismissedLoaded = true;
  try {
    const v = JSON.parse((await getPref(DISMISSED_PREF)) ?? '[]') as unknown;
    if (Array.isArray(v)) store.set({ dismissed: v.filter((k): k is string => typeof k === 'string') });
  } catch {
    // Corrupt pref: start over.
  }
}

let lastSync = 0;
let running = false;

/** `force` (pull to refresh): ignores SYNC_EVERY_MS. */
async function refresh(force = false) {
  store.set({ now: Date.now() }); // re-evaluates startsAt / endsAt even when the sync is skipped
  if (running || (!force && Date.now() - lastSync < SYNC_EVERY_MS)) return;
  running = true;
  try {
    await loadDismissed();
    const alerts = await readAlerts(await syncContent());
    lastSync = Date.now();
    // Forget dismissals of alerts the server no longer has (keeps the pref small).
    const keys = new Set(alerts.map((a) => a.key));
    const dismissed = store.get().dismissed.filter((k) => keys.has(k));
    store.set({ alerts, dismissed, now: Date.now() });
    await setPref(DISMISSED_PREF, JSON.stringify(dismissed));
  } catch {
    // Retried on the next foreground.
  } finally {
    running = false;
  }
}

/** Root-layout hook: syncs on launch and whenever the app returns to the foreground. */
export function useAlertsSync() {
  useEffect(() => {
    if (!beaconApiAvailable) return;
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, []);
}

/** Pull to refresh: syncs now, whatever the last sync. */
export const refreshAlerts = () => (beaconApiAvailable ? refresh(true) : undefined);

export async function dismissAlert(key: string) {
  const dismissed = [...store.get().dismissed.filter((k) => k !== key), key];
  store.set({ dismissed });
  await setPref(DISMISSED_PREF, JSON.stringify(dismissed));
}

/** Alerts to show now, most severe first (file name order within a style). */
export function useVisibleAlerts(): Alert[] {
  const { alerts, dismissed, now } = store.use();
  const { testAlerts } = useDebug();
  return alerts
    .filter(
      (a) =>
        (a.style !== 'test' || (__DEV__ && testAlerts)) &&
        !dismissed.includes(a.key) &&
        (a.startsAt === null || a.startsAt <= now) &&
        (a.endsAt === null || now < a.endsAt),
    )
    .sort((a, b) => ALERT_STYLES.indexOf(a.style) - ALERT_STYLES.indexOf(b.style));
}

/** A localized field in the app language, falling back to French, English, then any language. */
export function localized(v: Localized): string {
  if (typeof v === 'string') return v;
  return v[getLang()] ?? v.fr ?? v.en ?? Object.values(v)[0] ?? '';
}
