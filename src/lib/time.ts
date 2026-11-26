// Date helpers pinned to Europe/Paris, whatever the device's time zone.
// Days are handled as "YYYY-MM-DD" keys to avoid DST pitfalls.
// Labels follow the app language (lib/i18n).
import { getLang, intlLocale, t } from './i18n';

const TZ = 'Europe/Paris';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// formatToParts is slow on Hermes and called on every tick (now bar, buses, widgets).
// Paris is a whole number of hours ahead of UTC, so the result only changes on UTC
// minute boundaries: cache it per epoch minute.
const partsCache = new Map<number, { day: string; minutes: number }>();
const PARTS_CACHE_MAX = 4096;

/** Paris calendar day and minutes since midnight for an instant. */
export function parisParts(date: Date): { day: string; minutes: number } {
  const minute = Math.floor(date.getTime() / 60_000);
  const hit = partsCache.get(minute);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) p[type] = value;
  const parts = { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  if (Number.isFinite(minute)) {
    if (partsCache.size >= PARTS_CACHE_MAX) partsCache.clear();
    partsCache.set(minute, parts);
  }
  return parts;
}

export const todayKey = () => parisParts(new Date()).day;

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Intl formatter for the current language (built once per language: slow on mobile). */
function localized(options: Intl.DateTimeFormatOptions) {
  const cache = new Map<string, Intl.DateTimeFormat>();
  return () => {
    const lang = getLang();
    let f = cache.get(lang);
    if (!f) cache.set(lang, (f = new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', ...options })));
    return f;
  };
}

// Latin and Ancient Greek have no Intl data: their labels are built by hand.
type Classical = { weekdays: string[]; weekdaysShort: string[]; months: string[]; monthsOf: string[]; monthsShort: string[] };
const CLASSICAL: Partial<Record<ReturnType<typeof getLang>, Classical>> = {
  la: {
    weekdays: ['Dies Solis', 'Dies Lunae', 'Dies Martis', 'Dies Mercurii', 'Dies Iovis', 'Dies Veneris', 'Dies Saturni'],
    weekdaysShort: ['Sol.', 'Lun.', 'Mart.', 'Merc.', 'Iov.', 'Ven.', 'Sat.'],
    months: ['Ianuarius', 'Februarius', 'Martius', 'Aprilis', 'Maius', 'Iunius', 'Iulius', 'Augustus', 'September', 'October', 'November', 'December'],
    monthsOf: ['Ianuarii', 'Februarii', 'Martii', 'Aprilis', 'Maii', 'Iunii', 'Iulii', 'Augusti', 'Septembris', 'Octobris', 'Novembris', 'Decembris'],
    monthsShort: ['Ian.', 'Feb.', 'Mart.', 'Apr.', 'Mai.', 'Iun.', 'Iul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'],
  },
  grc: {
    weekdays: ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατον'],
    weekdaysShort: ['Κυρ.', 'Δευτ.', 'Τρ.', 'Τετ.', 'Πέμ.', 'Παρ.', 'Σάβ.'],
    months: ['Ἰανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Ἀπρίλιος', 'Μάιος', 'Ἰούνιος', 'Ἰούλιος', 'Αὔγουστος', 'Σεπτέμβριος', 'Ὀκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'],
    monthsOf: ['Ἰανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Ἀπριλίου', 'Μαΐου', 'Ἰουνίου', 'Ἰουλίου', 'Αὐγούστου', 'Σεπτεμβρίου', 'Ὀκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'],
    monthsShort: ['Ἰαν.', 'Φεβ.', 'Μαρ.', 'Ἀπρ.', 'Μαΐ.', 'Ἰουν.', 'Ἰουλ.', 'Αὐγ.', 'Σεπ.', 'Ὀκτ.', 'Νοε.', 'Δεκ.'],
  },
};
const classical = () => CLASSICAL[getLang()];
const ymd = (day: string) => day.split('-').map(Number) as [number, number, number];

/** Upper-cases the first letter (French labels are lower case). */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Keys are calendar dates: formatters use UTC to render them as-is.
const labelFormatter = localized({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function dayLabel(day: string): string {
  const [y, m, d] = ymd(day);
  const c = classical();
  if (c) return `${c.weekdays[weekday(day)]}, ${d} ${c.monthsOf[m - 1]} ${y}`;
  return capitalize(labelFormatter().format(new Date(Date.UTC(y, m - 1, d))));
}

export const formatMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "07:42": Paris time of an instant (ms). */
export const formatTime = (ms: number) => formatMinutes(parisParts(new Date(ms)).minutes);

/** "35 min" / "1 h 05" for a duration in ms. */
export function formatDuration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 60 ? t('duration.min', { m }) : t('duration.hours', { h: Math.floor(m / 60), mm: String(m % 60).padStart(2, '0') });
}

const shortLabelFormatter = localized({ weekday: 'short', day: 'numeric', month: 'short' });

/** "Lun. 9 nov." / "Mon 9 Nov" */
export function shortDayLabel(day: string): string {
  const [y, m, d] = ymd(day);
  const c = classical();
  if (c) return `${c.weekdaysShort[weekday(day)]} ${d} ${c.monthsShort[m - 1]}`;
  return capitalize(shortLabelFormatter().format(new Date(Date.UTC(y, m - 1, d))));
}

const monthFormatter = localized({ month: 'long', year: 'numeric' });

/** "Novembre 2026" / "November 2026" for a "YYYY-MM" key. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const c = classical();
  if (c) return `${c.months[m - 1]} ${y}`;
  return capitalize(monthFormatter().format(new Date(Date.UTC(y, m - 1, 1))));
}

/** Shift a "YYYY-MM" key by `delta` months. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Day keys of a month grid, weeks starting Monday; null for padding cells. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7; // Monday = 0
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= count; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Monday of the week containing `day`. */
export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7));

/** Epoch ms of `minutes` past midnight on Paris calendar day `day` (DST-safe). */
export function parisEpoch(day: string, minutes: number): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const p = parisParts(new Date(guess));
  const shown = p.minutes + (p.day === day ? 0 : p.day > day ? 1440 : -1440);
  return guess - (shown - minutes) * 60_000;
}

const dateFormatter = localized({ weekday: 'long', day: 'numeric', month: 'long' });

/** "Lundi 16 novembre" / "Monday 16 November" */
export function dateLabel(day: string): string {
  const [y, m, d] = ymd(day);
  const c = classical();
  if (c) return `${c.weekdays[weekday(day)]}, ${d} ${c.monthsOf[m - 1]}`;
  return capitalize(dateFormatter().format(new Date(Date.UTC(y, m - 1, d))));
}
