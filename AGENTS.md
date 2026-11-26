This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

---

# Beacon — project guide

Beacon is a student app for **Université d'Avignon**: personal timetable, free rooms, buses, Crous
restaurant attendance, digital student card and Izly payments. **Expo SDK 58 / React Native 0.88 /
Expo Router**, iOS and Android (a web build is still configured but paused: new features are native-only).
The project uses **npm** (`package-lock.json`), so use `npx`.

Private maintainer notes (how the university services were integrated, personal setup) live in a
gitignored `PRIVATE_AGENTS.md` on the maintainer's machine. Don't recreate it or commit it.

## Working rules

- **Git**: `main` = released code, `dev` = integration branch. Work on `dev` or on a feature branch
  off `dev`; pull requests target **`dev`**. Never commit to or merge into `main` unless the
  maintainer says so: **every push to `main` publishes a GitHub release** (see CI below).
- Run `npx tsc --noEmit` and `npx expo lint` before declaring a task done. Lint includes the React
  Compiler rules (no ref reads during render, no synchronous setState in effects).
- **Never commit credentials, tokens, session tickets, personal data or signing keys** (`.env*.local`,
  `*.jks`, `*.p12`… are gitignored). Test with your own account, keep tokens in memory only.
- **Don't hammer university servers** (`*.univ-avignon.fr`): no scripted probing or load. Ask the
  maintainer before adding a new endpoint.
- **Privacy promises are user-facing text** (onboarding): credentials are typed on the official pages,
  stored in the device keychain and only sent to the official services; location is never stored or
  sent; the only thing sent to the Beacon server is the daily anonymous statistics ping (opt-out in
  Réglages). Keep the text true if you change what the app sends.
- Don't start or kill the dev server unless asked: the maintainer usually has one running.
- **Never start `expo start` with `CI=1`**: it disables file watching and edits silently don't reload.

## CI / releases

`.github/workflows/android-release.yml` runs on every push to `main` (and manually): `npm ci` →
`expo prebuild -p android --clean` → `./gradlew assembleRelease` (arm64-v8a + armeabi-v7a for phones, x86_64 +
x86 for PC emulators such as BlueStacks) → signed with
the release keystore from repo secrets → GitHub release with `Beacon-<tag>.apk`.
- Tag = `v<expo.version in app.json>` (or `v<version>-build.<run>` if the tag already exists): **bump
  `expo.version` before merging a new version into `main`**.
- Changelog = commit subjects since the previous `v*` tag → write clear, imperative commit subjects
  (`feat: …`, `fix: …`, `ci: …`).
- Android `versionCode` = workflow run number (env `BEACON_VERSION_CODE`, read in `app.config.ts`).
- Beacon server URL: repo variable `BEACON_API_URL` → `EXPO_PUBLIC_BEACON_API_URL` at bundle time
  (unset → no statistics, and the onboarding says Beacon has no server).
- Pushes to `dev` don't build anything.
- **Android auto-update** (`src/lib/appUpdate.ts`): once a day the app reads GitHub's latest release
  (`api.github.com/repos/GeoffreyGx/Beacon/releases/latest`), compares the `versionCode N` in the notes
  with its own, downloads the `.apk` asset, checks GitHub's SHA-256 digest and opens the Android installer
  (`REQUEST_INSTALL_PACKAGES` in `app.json`). Keep that notes line and the APK asset; don't mark
  releases as prerelease. Off in dev builds; switch + manual check in Réglages → Mises à jour.

## Features

| Tab / screen | Route | |
|---|---|---|
| Accueil | `src/app/(tabs)/index.tsx` | Contextual "now bar" header (class in progress, next class, lunch, bus home…), alerts (server alerts + app update), student card button, editable widgets (Aujourd'hui, Resto U, Bus, Salles favorites). The Bus widget: from any ORIZO or ZOU! stop around Avignon (Châteaurenard, Saint-Rémy…), the next trips to Sainte-Marthe or Agroparc (ZOU! + ORIZO, with transfers, computed on the device), each opening the full trip. |
| Mon EDT | `(tabs)/perso.tsx` | Timetable of the selected favourite: one day with swipe on phones, week grid on wide screens. |
| Salles | `(tabs)/salles.tsx` | Room availability grid (rooms × 30-min slots) with a draggable time cursor, search, campus filter, pinned rooms. |
| Payer | `(tabs)/pay.tsx` | Izly balance, QR payment, history. Tab hidden unless an Izly account is linked. |
| Carte étudiant | `src/app/card.tsx` | Digital student card with barcode (cached offline). |
| Trajet | `src/app/trip.tsx` | Full trip opened from a Bus widget summary (`src/lib/tripStore.ts`): every vehicle with its boarding / alighting stops and times, walks, transfers and waits. |
| Réglages | `src/app/settings.tsx` | Theme, language, bus stops, Izly, logout; "Développement" section in dev builds only. |

First launch shows the onboarding (`src/components/Onboarding.tsx`): university login → optional Izly
login → preferences.

## Code map

```
src/app/                 routes only (Expo Router). _layout.tsx: I18nProvider > AppThemeProvider > SessionProvider > Stack
src/app/(tabs)/          tab screens; (tabs)/_layout.tsx gates on login + onboarding
src/app/api/             web-only API routes (paused web build)
src/components/          UI components (AgendaGrid, DayPager, RoomTimeline, NowBar, sheets, pickers, Buttons…)
src/components/izly/     Payer tab components
src/widgets/             home widgets + registry.ts
src/debug/DebugPanel.tsx dev-only now-bar scenarios (fake clock / events)
src/lib/                 logic: storage (keychain), store (createStore), prefs, session, edt*, events, time,
                         theme, i18n/, izly/, bus + gtfsRt (buses), crous, studentCard, code128, webview, http,
                         beaconApi + analytics + content (Beacon server, see below), appUpdate (Android),
                         Bus widget trips: gtfs (shared GTFS helpers), zou (ZOU! timetable), stopCatalog +
                         communes (ORIZO + ZOU! stops), journey (trip planner), campuses
scripts/gen-icons.py     regenerates src/components/Icon.tsx
assets/icon-src/         app icon generator (Pillow)
app.json / app.config.ts config; BEACON_PERSONAL_BUILD=1 → iOS bundle id with `.dev` suffix
```

## Beacon server

`GeoffreyGx/BeaconServer` (usually checked out at `../BeaconServer`) hosts what the university can't:
anonymous statistics and static content. The app finds it through `EXPO_PUBLIC_BEACON_API_URL`
(`.env.local`, see `.env.example`); unset → every server feature is off and nothing is sent.
- `src/lib/beaconApi.ts`: base URL + `beaconRequest()` (timeout).
- `src/lib/analytics.ts`: one ping a day (`POST /v1/analytics/ping`: random install ID, app
  version/build, platform, OS version); opt-out in Réglages → Confidentialité calls
  `DELETE /v1/analytics/installs/:id`. Changing the payload means changing `onboarding.privacyAnalytics`
  and `settings.analyticsHint` in every language.
- `src/lib/content.ts`: manifest + file cache (`/v1/content/manifest.json`), synced by `alerts.ts`.
  The onboarding privacy text says Beacon downloads announcements and sends nothing about the user:
  keep it true if content ever sends more than the request itself.
- `src/lib/alerts.ts`: every manifest file named `alert-*.json` is a home-screen alert
  (`style`: major / blockade / maintenance / normal / test, localized `title` / `content`, optional
  `startsAt` / `endsAt` / `dismissible` / `unverified` (grey "not from the university" note)), shown by `src/components/AlertStack.tsx` with the Android
  update banner. `test` alerts only show in dev builds (Réglages → Développement switch).
- The server's `/v1` API is a contract with released apps: changes there must stay backward compatible.

## Conventions

- **i18n** (`src/lib/i18n/`): 18 languages (16 follow the OS; Ancient Greek and Latin are a user choice in Réglages). `fr.ts` is the reference
  (`as const`); every other file is `Record<TranslationKey, string>`, so a missing key fails `tsc`.
  **Add every new string to all language files**, with the same `{placeholders}` as French. Use
  `t('key', { param })` / `tn('key', n)`. Module-level strings must be lazy (functions), because the
  language can change at runtime. University/Izly/Crous data, stop names and the debug panel aren't
  translated. Dates go through the formatters in `src/lib/time.ts`.
- **Times**: API times are UTC; always convert to **Europe/Paris** with `src/lib/time.ts` (DST-safe,
  days as `YYYY-MM-DD` keys).
- **Storage**: only `src/lib/storage.ts` imports `expo-secure-store` (keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
  Keep values small; larger caches go to files in `Paths.document`. Preferences: `src/lib/prefs.ts`.
  `setItem` records every key in an index so the dev "Effacer toutes les données" button
  (`src/debug/wipe.ts`: keychain, files, cookies, server statistics, then reload → onboarding) finds them all.
- **Shared state outside React**: `createStore(initial)` from `src/lib/store.ts` (`useSyncExternalStore`).
- **Theme**: `makeStyles((c) => ({…}))` from `src/lib/theme.tsx` → `useStyles()`; colours come from the
  palette (light / OLED dark), never hard-coded per screen.
- **WebViews** (login, student card, Izly) must use `allowOnly(req, HOSTS)` in `onShouldStartLoadWithRequest`
  and `trustedMessage(e, [host])` for messages (`src/lib/webview.ts`).
- **Widgets**: add a component in `src/widgets/`, register it in `registry.ts` (`title()` /
  `description()` are functions returning `t(...)`).
- **Icons**: Remix Icon (license allows UI use, **forbids use as app icon/logo**). `Icon.tsx` is generated:
  edit `NAMES` in `scripts/gen-icons.py` and rerun it, don't edit `Icon.tsx` by hand. The app icon is
  original artwork from `assets/icon-src/generate.py`.
- **Debug code** stays behind `__DEV__` (Metro strips it from release bundles).
- Tabs: `import { Tabs } from 'expo-router/js-tabs'` (JS tabs, so SVG icons work everywhere).
- RN 0.88 typing: refs are `useRef<ComponentRef<typeof View>>`; `WebView` is typed as a function
  component, so use the `injectedJavaScript` prop rather than a ref.

## Gotchas

- Expo Go doesn't work (native modules like `expo-file-system`, `expo-localization`, `expo-location`):
  use a development build. After adding a native module or changing a config plugin, run
  `npx expo prebuild --clean` and rebuild. If prebuild fails with ENOTEMPTY, delete `ios/` / `android/` first.
- **Android dev builds reload when you type "r" twice quickly in a WebView** (e.g. the Izly email field):
  React Native's double-R reload shortcut only ignores native text fields. Dev-only, not an app bug.
- Phone can't reach Metro (hotspot / IPv6-only network): `npx expo start --tunnel`.
- iOS stack headers are translucent: ScrollViews in stack screens need
  `contentInsetAdjustmentBehavior="automatic"`. Header height: `useHeaderHeight` from `expo-router/react-navigation`.
- iOS sticky ScrollView headers: RN replaces the sticky child's style, so wrap the header row in an extra `<View>`.
- `react-native-svg`: don't put `accessible` on `<Svg>` (breaks on web).
- `expo-location` adds "Always" permission strings by default; `app.json` disables them.
- Bus timetable cache (`src/lib/bus.ts`): bump `CACHE_VERSION` whenever the cached shape changes. Same for
  the ZOU! cache (`src/lib/zou.ts`, its own `CACHE_VERSION`).
- ZOU! data (Bus widget): GTFS "Proximité" and "Express + trains" from transport.data.gouv.fr (resources
  82137 / 82285, ≈ 15 MB, re-downloaded weekly, reduced on the device to the trips serving the Avignon area).
  Only loaded when needed (a ZOU! stop selected, the stop list open, or already cached): don't load it
  elsewhere without reason. ZOU! stop ids end with the commune's INSEE code (`src/lib/communes.ts`, a
  generated table). The planner (`src/lib/journey.ts`) and the catalog are pure logic: test them in Node with
  the real feeds (stub `expo/fetch`, `expo-file-system` and `i18n`).
- Native Android builds need ~5–10 GB of free disk space.
- Windows: native builds fail with "Filename longer than 260 characters" (CMake object paths repeat the full
  source path, and the ninja 1.10 of the SDK's CMake 3.22.1 can't use long paths). Keep the project in a short
  folder (e.g. `C:\dev\Beacon`), enable Windows long paths, install `cmake;3.31.6` with the SDK manager (ninja
  1.12) and set `cmake.dir` to it in `android/local.properties` (machine-specific, gitignored with `android/`).
- PC emulators (BlueStacks…) are x86_64: the APK needs that ABI (the default `reactNativeArchitectures` has it).
  BlueStacks: enable ADB in its settings, then `HD-Adb connect 127.0.0.1:<port>` (the port HD-Player listens on).
- No test runner: pure logic (`time.ts`, `events.ts`…) can be checked by copying it to a scratch folder and
  running it with `node --experimental-strip-types` (stub Expo imports).
