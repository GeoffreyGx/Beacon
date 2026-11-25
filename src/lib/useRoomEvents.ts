import { useCallback, useEffect, useReducer, useRef } from 'react';
import { edt, UnauthorizedError, type RoomEvent } from './edt';

const CONCURRENCY = 6;

export type RoomEventsState = RoomEvent[] | 'error' | undefined; // undefined = loading

/**
 * Loads (and caches for the session) the events of the given rooms, a few at a
 * time. Each room's response covers the whole semester, so switching days
 * needs no further requests.
 */
export function useRoomEvents(token: string, codes: string[], onUnauthorized: () => void) {
  const cache = useRef(new Map<string, RoomEvent[] | 'error'>());
  const inflight = useRef(new Set<string>());
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [reloads, reload] = useReducer((x: number) => x + 1, 0);
  const key = codes.join('\n');
  // One shared token check, so a burst of 401s triggers a single verification.
  const verifying = useRef<Promise<boolean> | null>(null);

  // Rooms that failed with the previous token (e.g. it had expired and was renewed): retry them.
  const lastToken = useRef(token);

  useEffect(() => {
    let cancelled = false;
    if (lastToken.current !== token) {
      lastToken.current = token;
      for (const [code, v] of cache.current) if (v === 'error') cache.current.delete(code);
    }
    const queue = key.split('\n').filter((c) => c && !cache.current.has(c) && !inflight.current.has(c));
    let next = 0;

    const worker = async () => {
      while (!cancelled && next < queue.length) {
        const code = queue[next++];
        inflight.current.add(code);
        try {
          cache.current.set(code, await edt.getRoomEvents(token, code));
        } catch (e) {
          cache.current.set(code, 'error');
          if (e instanceof UnauthorizedError) {
            if (__DEV__) console.warn(`[rooms] ${e.message}; checking whether the session is still valid`);
            verifying.current ??= edt.isTokenValid(token).finally(() => {
              verifying.current = null;
            });
            if (!(await verifying.current)) {
              cancelled = true;
              onUnauthorized();
              return;
            }
          }
        } finally {
          inflight.current.delete(code);
        }
        bump();
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) worker();

    return () => {
      cancelled = true;
    };
  }, [token, key, reloads, onUnauthorized]);

  const get = useCallback((code: string): RoomEventsState => cache.current.get(code), []);

  const refresh = useCallback(() => {
    cache.current.clear();
    bump();
    reload();
  }, []);

  /** Re-downloads every room, keeping the current data on screen (and on failure). For pull to refresh. */
  const revalidate = useCallback(async () => {
    const queue = key.split('\n').filter(Boolean);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const code = queue[next++];
        try {
          cache.current.set(code, await edt.getRoomEvents(token, code));
          bump();
        } catch {
          // Keep what we had; the normal loading path handles expired sessions.
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }, [token, key]);

  return { get, version, refresh, revalidate };
}
