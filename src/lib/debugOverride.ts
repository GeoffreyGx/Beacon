// Debug hooks for the now bar. This store is inert in release builds: only
// the debug panel (src/debug/, bundled in development only) ever writes to it.
import type { Departure } from './bus';
import type { RoomEvent } from './edt';
import { createStore } from './store';

export type NowOverride = {
  /** Fake "now" at the moment the scenario was picked; time keeps flowing from there. */
  now: number;
  setAt: number;
  events: RoomEvent[];
  travel: RoomEvent[];
  holidays: RoomEvent[];
  /** room → campus, so fake rooms resolve without the room list. */
  campuses: Record<string, string>;
  label: string;
};

/**
 * `limitedBuses`: mark every other departure as a limited-stop ("DIRECT") trip, to test its label.
 * `testAlerts`: show the server alerts whose style is "test" (`alerts.ts`), hidden otherwise.
 */
type DebugState = { panel: boolean; override: NowOverride | null; limitedBuses: boolean; testAlerts: boolean };

const store = createStore<DebugState>({ panel: false, override: null, limitedBuses: false, testAlerts: false });
const set = store.set;

export const setDebugPanel = (panel: boolean) => set({ panel, ...(panel ? {} : { override: null, limitedBuses: false }) });
export const setLimitedBuses = (limitedBuses: boolean) => set({ limitedBuses });
export const setTestAlerts = (testAlerts: boolean) => set({ testAlerts });

/** Departures as shown: with the debug switch on, the 1st, 3rd… are marked limited. */
export const withDebugLimited = (deps: Departure[], on: boolean): Departure[] =>
  __DEV__ && on ? deps.map((d, i) => (i % 2 === 0 ? { ...d, limited: true } : d)) : deps;
export const setNowOverride = (override: NowOverride | null) => set({ override });

export const useDebug = (): DebugState => store.use();
