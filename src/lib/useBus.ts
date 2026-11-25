// Hooks for the bus timetable (cached on disk, refreshed every few days) and
// the realtime feed (polled every 30 s while `active`).
import { useEffect, useState } from 'react';
import { loadTimetable, type Timetable } from './bus';
import { fetchRealtime, type RealtimeFeed } from './gtfsRt';
import { useOnRefresh } from './refresh';
import { useNow } from './useLive';

const RT_REFRESH_MS = 30_000;

export function useTimetable(active: boolean) {
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadTimetable()
      .then((tt) => !cancelled && setTimetable(tt))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [active]);
  // Pull to refresh: only retry when it failed (the timetable is cached and changes every few days).
  useOnRefresh(() => {
    if (!active || !error) return;
    return loadTimetable().then((tt) => {
      setTimetable(tt);
      setError(null);
    }, () => {});
  });
  return { timetable, error };
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
