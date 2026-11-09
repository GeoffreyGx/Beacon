// Web-only fallback. CAS refuses to redirect to any service except
// edt.univ-avignon.fr, so a browser can never see the ticket. This route runs
// the CAS form login on the server and returns the API login response. Credentials are
// used once and never stored or logged.
import { API_BASE, CAS_LOGIN_URL, CAS_SERVICE, createEdtClient, OFFICIAL_ORIGIN_HEADERS } from '../../lib/edt-core';

const UA = 'Mozilla/5.0 (Beacon timetable client)';

// Step-by-step diagnostics. Never logs credentials, tickets or tokens.
const log = (...args: unknown[]) => console.log('[cas-login]', ...args);

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

function decodeEntities(s: string) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

export async function POST(request: Request) {
  let username: string, password: string;
  try {
    ({ username, password } = await request.json());
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!username || !password) {
    return Response.json({ error: 'Username and password are required' }, { status: 400 });
  }

  // 1. Load the CAS login page to get the session cookies and the `execution` token.
  const page = await fetch(CAS_LOGIN_URL, { headers: { 'User-Agent': UA } });
  const html = await page.text();
  const input = html.match(/<input[^>]*name="execution"[^>]*>/)?.[0];
  const execution = input?.match(/value="([^"]*)"/)?.[1];
  log('1. CAS page', page.status, '| cookies:', page.headers.getSetCookie().map((c) => c.split('=')[0]), '| execution found:', !!execution);
  if (!execution) {
    return Response.json({ error: `Could not read CAS login form (HTTP ${page.status})` }, { status: 502 });
  }

  // 2. Submit the credentials without following the redirect. A successful
  //    login answers 302 to https://edt.univ-avignon.fr/login?ticket=ST-...
  const submit = await fetch(CAS_LOGIN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(page),
      Referer: CAS_LOGIN_URL,
    },
    body: new URLSearchParams({
      username,
      password,
      execution: decodeEntities(execution),
      _eventId: 'submit',
      geolocation: '',
    }).toString(),
  });

  const location = submit.headers.get('location') ?? '';
  const ticket = location.startsWith(CAS_SERVICE) ? new URL(location).searchParams.get('ticket') : null;
  log('2. CAS submit', submit.status, '| location:', location.split('?')[0] || '(none)', '| ticket:', ticket ? `${ticket.slice(0, 3)}… (${ticket.length} chars)` : 'none');
  if (!ticket) {
    const status = submit.status === 401 || submit.status === 200 ? 401 : 502;
    const error = status === 401 ? 'Invalid username or password' : `Unexpected CAS response (HTTP ${submit.status})`;
    return Response.json({ error }, { status });
  }

  // 3. Exchange the ticket here rather than in the browser, so the request
  //    carries the same Origin/Referer as the official app.
  try {
    const edt = createEdtClient(API_BASE, { ...OFFICIAL_ORIGIN_HEADERS, 'User-Agent': UA });
    const login = await edt.exchangeTicket(ticket);
    log('3. Ticket exchange OK | user:', login.user?.uid);
    return Response.json(login);
  } catch (e) {
    log('3. Ticket exchange FAILED:', e instanceof Error ? e.message : e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
