// Digital student card. The data comes from the ENT, fetched headlessly with the
// saved CAS credentials (entCard.ts) or, without them, through the ENT login
// WebView (EntCardFetcher). It is cached on the device so the card shows offline:
// text fields in SecureStore, the photo as a file in the app's document directory.
// The card is saved and shown as soon as its data arrives; the photo is downloaded
// in the background afterwards (its server is slow or sometimes down).
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { InvalidCredentialsError } from './casLogin';
import { getCredentials } from './credentials';
import { fetchEntInfo } from './entCard';
import { getJson, removeItem, setJson } from './storage';
import { createStore } from './store';

/** Raw response of https://ent.univ-avignon.fr/EtiquetteUserUapv/getInfoUser */
export type EntInfoUser = {
  uid: string;
  nom: string;
  prenom: string;
  ine?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  mel?: string;
  diplomes?: { inscription?: { libelle: string; annee: string }[] };
  supannAffectation?: string;
  supannCodePopulation?: string;
  photo_visible?: boolean;
  photo_path?: string;
};

export type StudentCard = {
  lastName: string;
  firstName: string;
  /** Student number ("n° AU"), e.g. 2701460. */
  number: string;
  ine: string;
  /** ISO date (YYYY-MM-DD) or empty. */
  birthDate: string;
  /** Academic year as given by the ENT, e.g. "2026-2027". */
  year: string;
  /** file:// URI of the cached photo, or null. */
  photoUri: string | null;
  /** The ENT has a photo but it couldn't be downloaded (photo server down) and none was cached before. */
  photoMissing?: boolean;
  fetchedAt: number;
};

const KEY = 'student_card';
/** Background download: generous, but the photo server sometimes doesn't answer at all. */
const PHOTO_TIMEOUT_MS = 20_000;
const photoFile = () => new File(Paths.document, 'student-photo.jpg');

/** Barcode content: "90" followed by the student number. */
export const barcodeValue = (card: StudentCard) => `90${card.number}`;

/** "2026-2027" → "2026 - 2027"; falls back to the current academic year. */
export function yearLabel(card: StudentCard) {
  if (card.year) return card.year.replace(/\s*-\s*/, ' - ');
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start} - ${start + 1}`;
}

type CardState = {
  /** undefined until the cache has been read. */
  card: StudentCard | null | undefined;
  /** Fetching the card data. */
  refreshing: boolean;
  /** Downloading the photo (after the data). */
  photoLoading: boolean;
  error: string | null;
  /** No usable saved credentials: the card can only be fetched through the ENT login page. */
  needsLogin: boolean;
};

const store = createStore<CardState>({ card: undefined, refreshing: false, photoLoading: false, error: null, needsLogin: false });

/** Card, refresh state and errors, shared by every screen. */
export const useStudentCard = store.use;
export const studentCardState = store.get;

/** Bumped on logout so in-flight fetches don't bring the card back. */
let generation = 0;
let loading: Promise<void> | null = null;
let refreshing: Promise<void> | null = null;

/** Card with its photo URI resolved for display (`v` busts the image cache when the photo changes). */
function forDisplay(card: StudentCard, version = card.fetchedAt): StudentCard {
  // The document directory path can change between app updates on iOS: resolve it again.
  const file = photoFile();
  return { ...card, photoUri: card.photoUri && file.exists ? `${file.uri}?v=${version}` : null };
}

/** Reads the cached card into the store (once). */
export function loadStudentCard(): Promise<void> {
  loading ??= getJson<StudentCard>(KEY)
    .then((card) => {
      if (store.get().card === undefined) store.set({ card: card ? forDisplay(card) : null });
    })
    .catch(() => {
      if (store.get().card === undefined) store.set({ card: null });
    });
  return loading;
}

/** Saves the ENT response and shows it at once; the photo follows in the background. */
export async function saveStudentCard(info: EntInfoUser): Promise<void> {
  if (typeof info?.uid !== 'string' || !info.uid) throw new Error('getInfoUser: unexpected response');
  const gen = generation;
  const fetchedAt = Date.now();
  const inscriptions = info.diplomes?.inscription ?? [];
  const years = inscriptions.map((i) => i.annee?.trim()).filter(Boolean).sort();
  const file = photoFile();
  const photoUrl = info.photo_visible !== false ? info.photo_path : undefined;

  const card: StudentCard = {
    lastName: info.nom?.trim() ?? '',
    firstName: info.prenom?.trim() ?? '',
    number: info.uid.replace(/^\D+/, ''),
    ine: info.ine?.trim() ?? '',
    birthDate: info.dateNaissance?.trim() ?? '',
    year: years.at(-1) ?? '',
    // Until the new photo arrives, keep showing the previous one.
    photoUri: photoUrl && file.exists ? file.uri : null,
    photoMissing: false,
    fetchedAt,
  };
  await setJson(KEY, card);
  if (gen !== generation) return;
  store.set({ card: forDisplay(card) });
  if (photoUrl) void downloadPhoto(photoUrl, card, gen);
}

let photoRequest = 0;

/** The ENT may give the photo as http:// or as a path; always fetch it over https from a university host. */
function photoHttpsUrl(raw: string): string {
  const url = new URL(raw.trim(), 'https://ent.univ-avignon.fr/');
  url.protocol = 'https:';
  if (url.hostname !== 'univ-avignon.fr' && !url.hostname.endsWith('.univ-avignon.fr')) {
    throw new Error(`photo host not allowed: ${url.hostname}`);
  }
  return url.toString();
}

/** JPEG, PNG, GIF or WebP signature. */
function isImage(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // GIF
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}

async function downloadPhoto(url: string, card: StudentCard, gen: number) {
  const request = ++photoRequest;
  store.set({ photoLoading: true });
  const file = photoFile();
  let ok = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PHOTO_TIMEOUT_MS);
    try {
      const res = await fetch(photoHttpsUrl(url), { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.bytes();
      // An error page served with 200 must not replace a good cached photo. Check the bytes,
      // not the Content-Type: the photo server doesn't always label its images as image/*.
      if (!isImage(bytes)) throw new Error(`not an image (${res.headers.get('content-type') ?? 'no content-type'})`);
      // Logged out meanwhile: never write the previous user's photo back to disk.
      if (gen !== generation) return;
      await file.write(bytes);
      ok = true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Photo server down: keep the previously cached photo, if any.
    if (__DEV__) console.warn('[studentCard] photo download failed:', e instanceof Error ? e.message : e);
  }
  if (request !== photoRequest || gen !== generation) return; // superseded, or logged out
  const updated: StudentCard = { ...card, photoUri: file.exists ? file.uri : null, photoMissing: !ok && !file.exists };
  await setJson(KEY, updated);
  if (request !== photoRequest || gen !== generation) return;
  store.set({ card: forDisplay(updated, Date.now()), photoLoading: false });
}

/**
 * Fetches the card in the background with the saved CAS credentials. Without
 * usable credentials it sets `needsLogin` (the card screen then offers the ENT
 * login page). Concurrent calls share one fetch.
 */
export function refreshStudentCard(): Promise<void> {
  refreshing ??= (async () => {
    const gen = generation;
    store.set({ refreshing: true, error: null });
    try {
      const creds = await getCredentials();
      if (!creds) {
        store.set({ needsLogin: true });
        return;
      }
      const info = await fetchEntInfo(creds);
      if (gen !== generation) return;
      await saveStudentCard(info);
      store.set({ needsLogin: false });
    } catch (e) {
      if (gen !== generation) return;
      if (e instanceof InvalidCredentialsError) store.set({ needsLogin: true });
      else store.set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      refreshing = null;
      if (gen === generation) store.set({ refreshing: false });
    }
  })();
  return refreshing;
}

/** Removes the cached card (on logout). */
export async function clearStudentCard() {
  generation++;
  loading = Promise.resolve();
  store.set({ card: null, refreshing: false, photoLoading: false, error: null, needsLogin: false });
  await removeItem(KEY);
  try {
    const file = photoFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing cached, or storage unavailable.
  }
}
