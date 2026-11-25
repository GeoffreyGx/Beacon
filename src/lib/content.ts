// Static content from the Beacon server (`beaconApi.ts`): files the maintainer edits in the server's
// dashboard (news, announcements, config…), listed in a manifest. Synced by `alerts.ts` (home alerts).
//
//   GET /v1/content/manifest.json → { schema, revision, generatedAt, meta, files: { name: { url, sha256, size, contentType, updatedAt } } }
//   GET <file.url>                → the file (`?v=<sha256>`, cacheable forever)
//
// `syncContent()` polls the manifest with If-None-Match (304 when nothing changed), downloads only
// the files whose sha256 differs from the cached copy and deletes the ones removed from the
// manifest. Files live in Paths.document/content/, the cached manifest is written last, so an
// interrupted sync is simply redone next time. Server unreachable, erroring, slow (timeouts) or
// answering garbage: the sync gives up and the previous files and manifest stay in use. `meta` is free-form JSON (min app version,
// announcement, feature flags…): read it with `useContentMeta()`.
//
// The onboarding text says Beacon downloads announcements without sending anything about the user:
// keep it true.
import { useEffect } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { beaconApiAvailable, beaconRequest } from './beaconApi';
import { createStore } from './store';

/** Highest manifest `schema` this app understands. Newer manifests are ignored. */
const SCHEMA = 1;
/** Same rule as the server: also guarantees a file name can't escape the content folder. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export type ManifestFile = { url: string; sha256: string; size: number; contentType: string; updatedAt: string };
export type Manifest = {
  schema: number;
  revision: string;
  generatedAt: string;
  meta: Record<string, unknown>;
  files: Record<string, ManifestFile>;
};
type Cached = { etag: string | null; manifest: Manifest };

const dir = () => new Directory(Paths.document, 'content');
const manifestFile = () => new File(Paths.document, 'content-manifest.json');
const contentFile = (name: string) => new File(dir(), name);

/** Manifest currently on disk (undefined until read, null if none). */
const store = createStore<{ manifest: Manifest | null | undefined }>({ manifest: undefined });

function isManifest(v: unknown): v is Manifest {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Partial<Manifest>;
  return (
    typeof m.schema === 'number' &&
    typeof m.revision === 'string' &&
    typeof m.meta === 'object' &&
    m.meta !== null &&
    typeof m.files === 'object' &&
    m.files !== null
  );
}

async function readCached(): Promise<Cached | null> {
  try {
    const f = manifestFile();
    if (!f.exists) return null;
    const c = JSON.parse(await f.text()) as Cached;
    return isManifest(c.manifest) ? c : null;
  } catch {
    return null;
  }
}

let loaded: Promise<void> | null = null;
const load = () => (loaded ??= readCached().then((c) => store.set({ manifest: c?.manifest ?? null })));

let syncing: Promise<Manifest | null> | null = null;

/**
 * Brings the local content up to date with the server. Resolves to the current manifest (the
 * cached one when offline / unchanged), or null if there is none. Never throws.
 */
export function syncContent(): Promise<Manifest | null> {
  return (syncing ??= doSync().finally(() => {
    syncing = null;
  }));
}

async function doSync(): Promise<Manifest | null> {
  const cached = await readCached();
  if (!beaconApiAvailable) return cached?.manifest ?? null;
  try {
    const fetched = await beaconRequest(
      '/v1/content/manifest.json',
      { headers: cached?.etag ? { 'If-None-Match': cached.etag } : {} },
      {
        // 304 = unchanged; other errors: keep the cache. A non-JSON body (captive portal page) throws.
        read: async (res) => (res.ok ? { etag: res.headers.get('etag'), manifest: (await res.json()) as unknown } : null),
      },
    );
    if (!fetched) return publish(cached?.manifest ?? null);
    const { etag, manifest } = fetched;
    if (!isManifest(manifest) || manifest.schema > SCHEMA) return publish(cached?.manifest ?? null);

    const folder = dir();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const names = Object.keys(manifest.files).filter((n) => NAME_RE.test(n));

    for (const name of names) {
      const entry = manifest.files[name];
      const local = contentFile(name);
      if (local.exists && cached?.manifest.files[name]?.sha256 === entry.sha256) continue;
      const bytes = await beaconRequest(entry.url, {}, {
        timeoutMs: 30_000,
        read: async (res) => {
          if (!res.ok) throw new Error(`content ${name}: HTTP ${res.status}`);
          return res.bytes();
        },
      });
      // Not the file the manifest describes (captive portal / proxy page, truncated body): never cache it.
      if (bytes.byteLength !== entry.size) throw new Error(`content ${name}: size mismatch`);
      // Write next to it, then rename: a reader never sees a half-written file.
      const part = new File(folder, `.${name}.part`);
      await part.write(bytes);
      await part.move(local, { overwrite: true });
    }
    // Drop files the server removed (and leftovers: `.part` files of an interrupted sync).
    const keep = new Set(names);
    for (const item of folder.list()) if (item instanceof File && !keep.has(item.name)) item.delete();

    await manifestFile().write(JSON.stringify({ etag, manifest } satisfies Cached));
    return publish(manifest);
  } catch {
    // Offline, server down or a download failed: keep what we have, retry next time.
    return publish(cached?.manifest ?? null);
  }
}

function publish(manifest: Manifest | null) {
  store.set({ manifest });
  return manifest;
}

/** Text of a downloaded content file, or null if it isn't in the local cache. */
export async function readContentText(name: string): Promise<string | null> {
  if (!NAME_RE.test(name)) return null;
  const f = contentFile(name);
  try {
    return f.exists ? await f.text() : null;
  } catch {
    return null;
  }
}

/** Parsed JSON content file, or null if missing / invalid. */
export async function readContentJson<T>(name: string): Promise<T | null> {
  const text = await readContentText(name);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Local URI of a downloaded content file (images, PDFs…), or null. */
export function contentUri(name: string): string | null {
  if (!NAME_RE.test(name)) return null;
  const f = contentFile(name);
  return f.exists ? f.uri : null;
}

/** The manifest's free-form `meta` from the local cache ({} until loaded / when there is none). */
export function useContentMeta(): Record<string, unknown> {
  useEffect(() => {
    load();
  }, []);
  return store.use().manifest?.meta ?? EMPTY;
}
const EMPTY: Record<string, unknown> = {};

/** Removes every downloaded content file and the cached manifest. */
export function clearContent() {
  try {
    const folder = dir();
    if (folder.exists) folder.delete();
    const f = manifestFile();
    if (f.exists) f.delete();
  } catch {
    // Nothing to clean.
  }
  store.set({ manifest: null });
}
