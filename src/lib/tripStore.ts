// The trip opened from the Bus widget, shown by the trip screen (src/app/trip.tsx).
// In memory only: the screen is opened right after it is set.
import type { Journey } from './journey';
import { createStore } from './store';

export type OpenedTrip = { journey: Journey; /** Starting stop, as shown in the widget. */ from: string; /** Campus name. */ to: string };

const store = createStore<{ trip: OpenedTrip | null }>({ trip: null });

export const openTrip = (trip: OpenedTrip) => store.set({ trip });
export const useOpenedTrip = () => store.use().trip;
