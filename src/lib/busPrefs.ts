// Bus preferences shared by the settings, the bus widget and the now bar:
// the user's home stop (any stop of the kept lines), which Centre-ville stop
// (St Lazare / Université) and Agroparc stop (Grand Avignon / Montaigne / Agrosciences) they
// use, the stop shown by the bus widget (null = the Agroparc stop; an ORIZO stop name or a
// ZOU! stop key, lib/stopCatalog) and the campus its trips go to.
import { useEffect } from 'react';
import { CAMPUS_STOPS, CENTRE_STOPS, LEGACY_CENTRE_STOP, type CampusStop, type CentreStop } from './bus';
import { campusById, type CampusId } from './campuses';
import { getPref, setPref } from './prefs';
import { createStore } from './store';

export type BusPrefs = {
  homeStop: string | null;
  centreStop: CentreStop;
  campusStop: CampusStop;
  widgetStop: string | null;
  destination: CampusId;
};

const HOME_KEY = 'bus_home_stop';
const CENTRE_KEY = 'bus_centre_stop';
const CAMPUS_KEY = 'bus_campus_stop';
const WIDGET_KEY = 'bus_widget_stop';
const DESTINATION_KEY = 'bus_destination';
// v1 of the bus widget stored ids instead of names.
const LEGACY: Record<string, CampusStop> = { grandAvignon: 'Grand Avignon', montaigne: 'Montaigne' };

const store = createStore<BusPrefs>({
  homeStop: null,
  centreStop: 'St Lazare',
  campusStop: 'Grand Avignon',
  widgetStop: null,
  destination: 'sainteMarthe',
});
const set = store.set;
let loaded: Promise<void> | null = null;

const oneOf = <T extends string>(list: readonly T[], value: string | null | undefined): T | null =>
  (list as readonly string[]).includes(value ?? '') ? (value as T) : null;

function load() {
  loaded ??= Promise.all([getPref(HOME_KEY), getPref(CENTRE_KEY), getPref(CAMPUS_KEY), getPref(WIDGET_KEY), getPref(DESTINATION_KEY)]).then(
    ([home, centre, campus, widget, destination]) => {
      const centreStop = oneOf(CENTRE_STOPS, centre) ?? store.get().centreStop;
      // Saved while St Lazare and Université were merged: use the chosen Centre-ville stop.
      const stop = (name: string | null) => (!name ? null : name === LEGACY_CENTRE_STOP ? centreStop : name);
      set({
        homeStop: stop(home),
        widgetStop: stop(widget),
        centreStop,
        campusStop: oneOf(CAMPUS_STOPS, campus && (LEGACY[campus] ?? campus)) ?? store.get().campusStop,
        destination: campusById(destination)?.id ?? store.get().destination,
      });
    },
  );
  return loaded;
}

export function setHomeStop(name: string | null) {
  set({ homeStop: name });
  setPref(HOME_KEY, name ?? '');
}

export function setWidgetStop(name: string | null) {
  set({ widgetStop: name });
  setPref(WIDGET_KEY, name ?? '');
}

export function setCentreStop(stop: CentreStop) {
  set({ centreStop: stop });
  setPref(CENTRE_KEY, stop);
}

export function setCampusStop(stop: CampusStop) {
  set({ campusStop: stop });
  setPref(CAMPUS_KEY, stop);
}

export function setDestination(destination: CampusId) {
  set({ destination });
  setPref(DESTINATION_KEY, destination);
}

export function useBusPrefs(): BusPrefs {
  useEffect(() => {
    load();
  }, []);
  return store.use();
}
