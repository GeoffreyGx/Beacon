// Live-updating hooks: a ticking clock, Crous attendance and library occupancy
// polling, all paused while inactive (screen not focused, app in background).
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchAttendance } from './crous';
import { fetchLibrary } from './libraries';
import { useOnRefresh } from './refresh';

const CROUS_REFRESH_MS = 5_000;
const LIBRARY_REFRESH_MS = 5_000;

/** Re-renders every `ms` while `active` and the app is in the foreground. */
export function useNow(ms: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setNow(Date.now());
      id ??= setInterval(() => setNow(Date.now()), ms);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = undefined;
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [ms, active]);
  return now;
}

/** `fetcher(key)` every `ms` while `active`: the latest value for `key` (null until it arrives) and the last error. */
function usePolled<T>(key: string | null, fetcher: (key: string) => Promise<T>, ms: number, active: boolean) {
  const [data, setData] = useState<{ key: string; value: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useNow(ms, active && !!key);
  useEffect(() => {
    if (!active || !key) return;
    let cancelled = false;
    fetcher(key)
      .then((value) => {
        if (cancelled) return;
        setData({ key, value });
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e instanceof Error ? e.message : e)));
    return () => {
      cancelled = true;
    };
  }, [key, fetcher, active, tick]);
  useOnRefresh(() => {
    if (!active || !key) return;
    return fetcher(key).then(
      (value) => {
        setData({ key, value });
        setError(null);
      },
      (e) => setError(String(e instanceof Error ? e.message : e)),
    );
  });
  return { value: data?.key === key ? data.value : null, error };
}

/** Crous attendance for `restoId`, polled every 5 s while `active`. */
export function useAttendance(restoId: string | null, active: boolean) {
  const { value, error } = usePolled(restoId, fetchAttendance, CROUS_REFRESH_MS, active);
  return { attendance: value, error };
}

/** Opening status and occupancy of library `id` (Affluences), polled every 5 s while `active`. */
export function useLibrary(id: string, active: boolean) {
  const { value, error } = usePolled(id, fetchLibrary, LIBRARY_REFRESH_MS, active);
  return { status: value, error };
}
