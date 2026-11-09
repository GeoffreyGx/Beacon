// Date helpers pinned to Europe/Paris, whatever the device's time zone.
// Days are handled as "YYYY-MM-DD" keys to avoid DST pitfalls.

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

/** Paris calendar day and minutes since midnight for an instant. */
export function parisParts(date: Date): { day: string; minutes: number } {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) p[type] = value;
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
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

const labelFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC', // keys are calendar dates, render them as-is
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const label = labelFormatter.format(new Date(Date.UTC(y, m - 1, d)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const formatMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const shortLabelFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "Lun. 9 nov." */
export function shortDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const label = shortLabelFormatter.format(new Date(Date.UTC(y, m - 1, d)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** "Novembre 2026" for a "YYYY-MM" key. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const label = monthFormatter.format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
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
