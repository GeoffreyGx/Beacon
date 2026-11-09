// Web-only proxy: /api/edt/<path> → https://edt-api.univ-avignon.fr/api/<path>.
// edt-api only accepts tokens from its official Origin, which browsers can't set.
// Requests go only to API_BASE, so this can't be used to reach other hosts.
import { API_BASE, OFFICIAL_ORIGIN_HEADERS } from '../../../lib/edt-core';

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'token'];

async function proxy(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/edt\/?/, '');
  if (path.includes('..')) return Response.json({ error: 'Invalid path' }, { status: 400 });

  const headers: Record<string, string> = { ...OFFICIAL_ORIGIN_HEADERS };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  const upstream = await fetch(`${API_BASE}/${path}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
  });

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
