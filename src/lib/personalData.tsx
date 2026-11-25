// The user's personal timetables, shared by "Mon EDT" and the home widgets.
// The user picks one of their favoris (saved per device; default = the
// favori marked `defaut`); events are loaded per favori and cached.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { edt, UnauthorizedError, type Favori, type RoomEvent } from './edt';
import { isHoliday, isTravelTime } from './events';
import { getPref, setPref } from './prefs';
import { useOnRefresh } from './refresh';
import { useSession } from './sessionContext';
import { t } from './i18n';

type PersonalData = {
  favoris: Favori[] | null;
  /** The favori currently displayed (null until favoris are loaded, or if the user has none). */
  selected: Favori | null;
  selectFavori: (id: number) => void;
  /** Classes of the selected timetable ("Temps de déplacement" slots and "Férié" markers removed). */
  events: RoomEvent[] | null;
  /** The "Temps de déplacement" slots, kept apart for the now bar. */
  travel: RoomEvent[] | null;
  /** The "Férié" (public holiday) markers, kept apart for the now bar. */
  holidays: RoomEvent[] | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

const PersonalDataContext = createContext<PersonalData | null>(null);

const PREF_KEY = 'favori_id';
/** Cache key used when the user has no favoris: fall back to events_perso. */
const NO_FAVORI = -1;

/** The default favori (the one marked `defaut`, else the first). */
export const defaultFavori = (favoris: Favori[] | null) => favoris?.find((f) => f.defaut) ?? favoris?.[0];

export function PersonalDataProvider({ children }: { children: ReactNode }) {
  const { token, expire } = useSession();
  const [favoris, setFavoris] = useState<Favori[] | null>(null);
  // undefined = preference not read yet (wait for it, to avoid loading the default first).
  const [storedId, setStoredId] = useState<number | null | undefined>(undefined);
  const [cache, setCache] = useState<Record<number, RoomEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const fail = useCallback(
    async (e: unknown) => {
      if (token && e instanceof UnauthorizedError && !(await edt.isTokenValid(token))) {
        // Renews the token (effects re-run with it) or logs out; false = couldn't reach CAS.
        if (!(await expire())) setError(t('session.renewFailed'));
      } else setError(e instanceof Error ? e.message : String(e));
    },
    [token, expire],
  );

  useEffect(() => {
    getPref(PREF_KEY).then((v) => setStoredId(v && /^\d+$/.test(v) ? Number(v) : null));
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    edt
      .getFavoris(token)
      .then((f) => !cancelled && setFavoris(f))
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloads, fail]);

  const selected = useMemo(
    () => (favoris ? (favoris.find((f) => f.id === storedId) ?? defaultFavori(favoris) ?? null) : null),
    [favoris, storedId],
  );
  const key = favoris === null || storedId === undefined ? null : (selected?.id ?? NO_FAVORI);

  useEffect(() => {
    if (!token || key === null || cache[key]) return;
    let cancelled = false;
    (key === NO_FAVORI ? edt.getPersonalEvents(token) : edt.getFavoriEvents(token, key))
      .then((ev) => !cancelled && setCache((c) => ({ ...c, [key]: ev })))
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [token, key, cache, fail]);

  const selectFavori = useCallback((id: number) => {
    setStoredId(id);
    setError(null);
    setPref(PREF_KEY, String(id));
  }, []);

  // Pull to refresh (home): replaces the data once it has arrived; other favoris are fetched again when picked.
  useOnRefresh(async () => {
    if (!token || key === null) return;
    try {
      const [f, ev] = await Promise.all([
        edt.getFavoris(token),
        key === NO_FAVORI ? edt.getPersonalEvents(token) : edt.getFavoriEvents(token, key),
      ]);
      setFavoris(f);
      setCache({ [key]: ev });
      setError(null);
    } catch (e) {
      await fail(e);
    }
  });

  const reload = useCallback(() => {
    setFavoris(null);
    setCache({});
    setError(null);
    setReloads((n) => n + 1);
  }, []);

  const raw = key === null ? null : (cache[key] ?? null);
  const { events, travel, holidays } = useMemo(
    () =>
      raw
        ? {
            events: raw.filter((e) => !isTravelTime(e) && !isHoliday(e)),
            travel: raw.filter(isTravelTime),
            holidays: raw.filter(isHoliday),
          }
        : { events: null, travel: null, holidays: null },
    [raw],
  );
  const value = useMemo(
    () => ({ favoris, selected, selectFavori, events, travel, holidays, error, loading: !events && !error, reload }),
    [favoris, selected, selectFavori, events, travel, holidays, error, reload],
  );
  return <PersonalDataContext.Provider value={value}>{children}</PersonalDataContext.Provider>;
}

export function usePersonalData(): PersonalData {
  const v = useContext(PersonalDataContext);
  if (!v) throw new Error('usePersonalData must be used inside <PersonalDataProvider>');
  return v;
}
