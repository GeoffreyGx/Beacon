// Android auto-update from GitHub releases (the APKs built by .github/workflows/android-release.yml).
//
// Android only: iOS builds go through TestFlight / the App Store. At most once a day (on launch / when
// the app comes back to the foreground) the app asks GitHub for the latest release
// (GET api.github.com/repos/<repo>/releases/latest: no account, no identifier, nothing about the user)
// and compares its versionCode, read from the release notes ("Android versionCode N"), with this
// build's. A newer one → a banner at the top of the home screen (`UpdateBanner`) offers to download
// the APK; once downloaded and checked against the
// SHA-256 digest GitHub publishes for the asset, it's handed to the Android package installer
// (ACTION_VIEW through expo-file-system's FileProvider), which also checks that the APK is signed with
// the same key as the installed app. The first time, Android asks the user to allow "Install unknown
// apps" for Beacon (permission REQUEST_INSTALL_PACKAGES in app.json).
//
// Turned off in Réglages → Mises à jour (the manual "check" button still works). The automatic check
// is off in development builds and in local release builds without a versionCode from CI.
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { getPref, setPref } from './prefs';
import { getItem, setItem } from './storage';
import { createStore } from './store';
import { todayKey } from './time';

const REPO = 'GeoffreyGx/Beacon';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const APK_MIME = 'application/vnd.android.package-archive';
const LAST_CHECK_KEY = 'update_last_check';
const ENABLED_PREF = 'auto_update';

/** Whether this platform can update itself (sideloaded Android APKs). */
export const updatesSupported = Platform.OS === 'android';

/** versionCode of this build: set by CI (BEACON_VERSION_CODE), undefined in local builds. */
const currentCode = Constants.expoConfig?.android?.versionCode;
export const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

/** Automatic checks only make sense in CI-built releases (dev builds have another signature). */
const autoCheckPossible = updatesSupported && !__DEV__ && currentCode !== undefined;

export type Release = {
  version: string; // tag without the leading "v"
  code: number;
  url: string; // APK download URL
  size: number; // bytes
  sha256?: string;
  name: string; // APK file name
};

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; release: Release }
  | { kind: 'downloading'; release: Release; progress: number }
  | { kind: 'ready'; release: Release } // downloaded, installer not opened yet (app was in background)
  | { kind: 'error'; release?: Release };

/** `banner`: the home-screen banner is shown (found by the automatic check, hidden by "Later"). */
const store = createStore<{ status: UpdateStatus; enabled: boolean | undefined; banner: boolean }>({
  status: { kind: 'idle' },
  enabled: undefined,
  banner: false,
});
const setStatus = (status: UpdateStatus) => store.set({ status });

let loaded: Promise<void> | null = null;
const load = () =>
  (loaded ??= getPref(ENABLED_PREF)
    .then((v) => store.set({ enabled: v !== '0' }))
    .catch(() => store.set({ enabled: true })));

const updatesDir = () => new Directory(Paths.cache, 'updates');

/** Drops downloaded APKs (after an update, or when there's nothing to install). */
function clearDownloads() {
  try {
    const dir = updatesDir();
    if (dir.exists) dir.delete();
  } catch {
    // Cache folder: the system can clean it anyway.
  }
}

type GithubRelease = {
  tag_name?: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; size?: number; browser_download_url?: string; digest?: string | null }[];
};

/** Latest published release, or null when it has no APK / no versionCode. Throws on network errors. */
async function fetchLatest(): Promise<Release | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const rel = (await res.json()) as GithubRelease;
    if (rel.draft || rel.prerelease) return null;
    // Written by the release workflow: "Beacon 1.1.0 (Android versionCode 2)".
    const code = Number(/versionCode (\d+)/.exec(rel.body ?? '')?.[1]);
    const apk = rel.assets?.find((a) => a.name?.endsWith('.apk') && a.browser_download_url);
    if (!code || !apk?.browser_download_url || !apk.name) return null;
    // Only download from GitHub over HTTPS (the URL comes from the API response).
    if (!apk.browser_download_url.startsWith(`https://github.com/${REPO}/releases/download/`)) return null;
    const sha256 = apk.digest?.startsWith('sha256:') ? apk.digest.slice(7).toLowerCase() : undefined;
    return {
      version: (rel.tag_name ?? '').replace(/^v/, ''),
      code,
      url: apk.browser_download_url,
      size: apk.size ?? 0,
      sha256,
      name: apk.name.replace(/[^\w.-]/g, '_'),
    };
  } finally {
    clearTimeout(timer);
  }
}

let checking: Promise<Release | null> | null = null;

/**
 * Asks GitHub for the latest release and updates the status. Resolves to the newer release, or null
 * (up to date, or error: see the status). Never throws.
 */
export function checkForUpdate(): Promise<Release | null> {
  const s = store.get().status.kind;
  if (s === 'downloading') return Promise.resolve(null);
  return (checking ??= (async () => {
    setStatus({ kind: 'checking' });
    try {
      const latest = await fetchLatest();
      if (latest && latest.code > (currentCode ?? 0)) {
        setStatus({ kind: 'available', release: latest });
        return latest;
      }
      clearDownloads();
      setStatus({ kind: 'upToDate' });
      return null;
    } catch {
      setStatus({ kind: 'error' });
      return null;
    } finally {
      checking = null;
    }
  })());
}

/** Opens the Android installer for a downloaded APK. */
async function openInstaller(file: File, release: Release) {
  if (AppState.currentState !== 'active') {
    // Android blocks activities started from the background: retried when the app comes back.
    setStatus({ kind: 'ready', release });
    return;
  }
  try {
    await file.preview({ mimeType: APK_MIME });
    setStatus({ kind: 'available', release }); // the user can cancel the installer and retry
  } catch {
    setStatus({ kind: 'error', release });
  }
}

const apkFile = (release: Release) => new File(updatesDir(), release.name);

/** Downloads the release's APK (progress in the status), verifies it, then opens the installer. */
export async function installUpdate(release: Release) {
  const s = store.get().status.kind;
  if (s === 'downloading') return;
  setStatus({ kind: 'downloading', release, progress: 0 });
  try {
    const file = apkFile(release);
    const valid = async () =>
      file.exists && (!release.size || file.size === release.size) && (!release.sha256 || (await file.digest('SHA-256')) === release.sha256);
    if (!(await valid())) {
      clearDownloads(); // older APKs and partial downloads
      updatesDir().create({ intermediates: true, idempotent: true });
      let last = 0;
      await File.downloadFileAsync(release.url, file, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => {
          const total = totalBytes > 0 ? totalBytes : release.size;
          const progress = total ? Math.min(1, bytesWritten / total) : 0;
          // Don't re-render on every chunk.
          if (progress - last >= 0.01 || progress === 1) {
            last = progress;
            setStatus({ kind: 'downloading', release, progress });
          }
        },
      });
      if (!(await valid())) {
        clearDownloads();
        throw new Error('APK size or digest mismatch');
      }
    }
    await openInstaller(file, release);
  } catch {
    setStatus({ kind: 'error', release }); // shown by the banner / Réglages
  }
}

/** Pull to refresh (home): checks GitHub now and shows the banner if there is an update. */
export async function refreshUpdate() {
  if (!autoCheckPossible) return;
  await load();
  if (!store.get().enabled) return;
  if (await checkForUpdate()) store.set({ banner: true });
}

/** "Later" on the banner: hidden until the next day's check finds the update again. */
export const dismissUpdateBanner = () => store.set({ banner: false });

/**
 * Dev only (Réglages → Développement): shows the update banner whatever the versions are. Uses the real
 * latest release so "Update" really downloads it (the installer then refuses it if this build has
 * another signature); falls back to a fake release when GitHub can't be reached.
 */
export async function debugShowUpdatePrompt() {
  if (!__DEV__) return;
  let release: Release | null = null;
  try {
    release = await fetchLatest();
  } catch {
    // Offline: fake release below.
  }
  release ??= { version: '99.0.0', code: 999_999, url: '', size: 50e6, name: 'Beacon-debug.apk' };
  store.set({ status: { kind: 'available', release }, banner: true });
}

let autoRunning = false;

async function autoCheck() {
  if (autoRunning) return;
  autoRunning = true;
  try {
    const { status } = store.get();
    // Downloaded while in the background: open the installer now.
    if (status.kind === 'ready') {
      await openInstaller(apkFile(status.release), status.release);
      return;
    }
    await load();
    if (!store.get().enabled) return;
    const day = todayKey();
    if ((await getItem(LAST_CHECK_KEY)) === day) return;
    const release = await checkForUpdate();
    if (store.get().status.kind === 'error') return; // offline: retried on the next foreground
    await setItem(LAST_CHECK_KEY, day);
    if (release) store.set({ banner: true });
  } catch {
    // Retried on the next launch / foreground.
  } finally {
    autoRunning = false;
  }
}

/** Root-layout hook: checks on launch and whenever the app returns to the foreground. */
export function useAutoUpdate() {
  useEffect(() => {
    if (!autoCheckPossible) return;
    autoCheck();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') autoCheck();
    });
    return () => sub.remove();
  }, []);
}

export function useUpdateStatus(): UpdateStatus {
  return store.use().status;
}

/** What the home banner shows, or null when it's hidden or there's nothing to offer. */
export function useUpdateBanner(): { status: UpdateStatus; release: Release } | null {
  const { status, banner } = store.use();
  const release = 'release' in status ? status.release : undefined;
  return banner && release ? { status, release } : null;
}

export function useAutoUpdateEnabled(): boolean | undefined {
  useEffect(() => {
    load();
  }, []);
  return store.use().enabled;
}

export async function setAutoUpdateEnabled(enabled: boolean) {
  store.set({ enabled });
  await setPref(ENABLED_PREF, enabled ? '1' : '0');
}
