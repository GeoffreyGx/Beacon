// Pull to refresh on the home screen. Anything showing data there registers a handler with
// `useOnRefresh(fn)`; `refreshAll()` runs them all at once and resolves when they have all settled
// (or after REFRESH_TIMEOUT_MS, so a hung request can't keep the spinner turning). Handlers update
// their own state when their data arrives: each part of the screen refreshes on its own.
import { useEffect, useRef } from 'react';

const REFRESH_TIMEOUT_MS = 15_000;

const handlers = new Set<() => unknown>();

/**
 * Registers `fn` (sync or async) for pull to refresh while the component is mounted. Uses the latest
 * `fn` passed, so it can read current props / state.
 */
export function useOnRefresh(fn: () => unknown) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const h = () => latest.current();
    handlers.add(h);
    return () => {
      handlers.delete(h);
    };
  }, []);
}

/** Runs every registered handler in parallel. Never throws. */
export async function refreshAll(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, REFRESH_TIMEOUT_MS);
  });
  const all = Promise.allSettled([...handlers].map((h) => Promise.resolve().then(h)));
  try {
    await Promise.race([all, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
