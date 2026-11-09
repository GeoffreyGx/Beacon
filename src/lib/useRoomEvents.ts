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

  useEffect(() => {
    let cancelled = false;
    const queue = key.split('\n').filter((c) => c && !cache.current.has(c) && !inflight.current.has(c));
    let next = 0;

    const worker = async () => {
      while (!cancelled && next < queue.length) {
        const code = queue[next++];
        inflight.current.add(code);
        try {
          cache.current.set(code, await edt.getRoomEvents(token, code));
        } catch (e) {
          if (e instanceof UnauthorizedError) {
            cancelled = true;
            onUnauthorized();
            return;
          }
          cache.current.set(code, 'error');
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

  return { get, version, refresh };
}
