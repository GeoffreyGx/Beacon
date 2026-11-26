// Hooks for the bus timetables (ORIZO and ZOU!, cached on disk and refreshed
// every few days) and the ORIZO realtime feed (polled every 30 s while `active`).
import { useEffect, useState } from 'react';
import { loadTimetable, type Timetable } from './bus';
import { fetchRealtime, type RealtimeFeed } from './gtfsRt';
import { useOnRefresh } from './refresh';
import { useNow } from './useLive';
import { loadZouTimetable, type ZouTimetable } from './zou';

const RT_REFRESH_MS = 30_000;

/** Result of `load()` once `active` (null until then), or its error message. */
function useLoaded<T>(load: () => Promise<T>, active: boolean) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    load()
      .then((v) => !cancelled && setValue(v))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [load, active]);
  // Pull to refresh: only retry when it failed (the timetables are cached and change every few days).
  useOnRefresh(() => {
    if (!active || !error) return;
    return load().then((v) => {
      setValue(v);
      setError(null);
    }, () => {});
  });
  return { value, error };
}

/** ORIZO timetable. */
export function useTimetable(active: boolean) {
  const { value, error } = useLoaded<Timetable>(loadTimetable, active);
  return { timetable: value, error };
}

/** ZOU! regional timetable (≈ 15 MB downloaded the first time, then weekly). */
export function useZouTimetable(active: boolean) {
  const { value, error } = useLoaded<ZouTimetable>(loadZouTimetable, active);
  return { timetable: value, error };
}

/** Latest realtime feed, or null if unavailable (then show the timetable). */
export function useRealtime(active: boolean): RealtimeFeed | null {
  const [rt, setRt] = useState<RealtimeFeed | null>(null);
  const [failed, setFailed] = useState(false);
  const tick = useNow(RT_REFRESH_MS, active);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchRealtime()
      .then((feed) => {
        if (cancelled) return;
        setRt(feed);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [active, tick]);
  useOnRefresh(() => {
    if (!active) return;
    return fetchRealtime().then(
      (feed) => {
        setRt(feed);
        setFailed(false);
      },
      () => setFailed(true),
    );
  });
  return failed ? null : rt;
}
