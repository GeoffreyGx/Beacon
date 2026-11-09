// Platform-independent client for the Université d'Avignon timetable API.
// No react-native imports: this module is also used by the server routes.

export const CAS_SERVICE = 'https://edt.univ-avignon.fr/login';
export const CAS_LOGIN_URL = `https://cas.univ-avignon.fr/cas/login?service=${encodeURIComponent(CAS_SERVICE)}`;
export const API_BASE = 'https://edt-api.univ-avignon.fr/api';

// The official app sends the service without "/login" when exchanging the ticket.
const API_SERVICE = 'https://edt.univ-avignon.fr';

/**
 * edt-api rejects tokens (401) unless the request comes from the official
 * origin. Browsers can't set these headers, so web calls go through our proxy
 * (src/app/api/edt/[...path]+api.ts). Native and server code set them directly.
 */
export const OFFICIAL_ORIGIN_HEADERS = {
  Origin: 'https://edt.univ-avignon.fr',
  Referer: 'https://edt.univ-avignon.fr/',
};

export type LoginResponse = {
  token: string;
  user: { uid: string; name: string };
  [key: string]: unknown;
};

export type Salle = { name: string; code: string; searchString: string };
export type Campus = { letter: string; names: Salle[] };

export type RoomEvent = {
  start: string; // ISO 8601 with offset
  end: string;
  /** Multi-line "Key : value" text, e.g. "Matière : …\nEnseignant : …\nType : TD\n" */
  title: string;
  type: string; // CM, TD, TP, Evaluation, Annulation, or ''
  code: string | null;
  memo: string | null;
  favori: string;
};

export class UnauthorizedError extends Error {}

/** Pull the CAS service ticket out of a redirect URL, if present. */
export function extractTicket(url: string): string | null {
  if (!url.startsWith(CAS_SERVICE)) return null;
  const match = url.match(/[?&]ticket=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readJson(res: Response, what: string) {
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new UnauthorizedError(`${what}: unauthorized`);
  if (!res.ok) {
    // Symfony returns an HTML error page; its <title> is enough to diagnose.
    const detail = text.match(/<title>([^<]*)<\/title>/i)?.[1] ?? text.slice(0, 300);
    throw new Error(`${what} failed (${res.status}): ${detail}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} returned non-JSON: ${text.slice(0, 300)}`);
  }
}

/** Build a client against `base`, adding `extraHeaders` to every request. */
export function createEdtClient(base: string, extraHeaders: Record<string, string> = {}) {
  const headers = (more: Record<string, string>) => ({
    Accept: 'application/json, text/plain, */*',
    ...extraHeaders,
    ...more,
  });

  return {
    /** Exchange a one-time CAS ticket for an API token. */
    async exchangeTicket(ticket: string): Promise<LoginResponse> {
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        // The official client sends the literal token "undefined" before login.
        headers: headers({ 'Content-Type': 'application/json', token: 'undefined' }),
        body: JSON.stringify({ ticket, service: API_SERVICE, version: '' }),
      });
      const data = await readJson(res, 'Ticket exchange');
      if (!data?.token) throw new Error(`No token in login response: ${JSON.stringify(data)}`);
      return data;
    },

    async getFavoris(token: string): Promise<unknown> {
      const res = await fetch(`${base}/users/favoris`, { headers: headers({ token }) });
      return readJson(res, 'Favoris');
    },

    /** All rooms, grouped by campus. */
    async getSalles(token: string): Promise<Campus[]> {
      const res = await fetch(`${base}/salles`, { headers: headers({ token }) });
      return (await readJson(res, 'Salles')).results;
    },

    /** Every event of a room for the whole period the API exposes (≈ a semester). */
    async getRoomEvents(token: string, code: string): Promise<RoomEvent[]> {
      const res = await fetch(`${base}/events_salle/${encodeURIComponent(code)}`, { headers: headers({ token }) });
      return (await readJson(res, `Events ${code}`)).results;
    },
  };
}
