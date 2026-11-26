# Beacon

A student app for **Université d'Avignon**, for iOS and Android.

- **Timetable**: today's classes at a glance, day and week views.
- **Rooms**: see which rooms are free right now or later.
- **Buses**: real-time Grand Avignon (ORIZO) departures, ZOU! regional coaches and trains from any stop
  around Avignon, and the next trips to the Sainte-Marthe or Agroparc campus.
- **Student card**: digital card with barcode, works offline.
- **Izly**: balance, history and QR code payment.
- Customisable home widgets, Crous restaurant attendance, 18 languages, light and dark themes.

Your credentials are typed on the official login pages and stay in your phone's keychain.
Beacon is not affiliated with the university, Crous or Izly.

**Download**: Android APKs are on the [Releases](../../releases) page.

## Release builds

**Android**

```sh
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
```

Official signed APKs are built automatically by GitHub Actions on every push to `main`.

**iOS**

```sh
npx expo prebuild -p ios --clean
open ios/Beacon.xcworkspace
```

Choose your signing team in Xcode, select the Release configuration and build. With a free Apple
account, prefix the prebuild command with `BEACON_PERSONAL_BUILD=1` (uses a separate `.dev` bundle ID).

## Contributing

1. **Open an issue** describing the bug or feature, and wait for it to be approved.
2. **Fork** the repository.
3. Create a **feature branch from `dev`** (`feat/…` or `fix/…`).
4. Open a **pull request against `dev`**, linking the issue and explaining how you tested it.

Please add new text to every language in `src/lib/i18n/`, keep commit messages short and clear
(they make up the release notes), and never commit credentials or personal data.
By contributing, you agree that your work is licensed under the project's license.

## Development

You need Node.js 22+, plus **Android Studio** and JDK 17 for Android, or **Xcode** and CocoaPods for iOS (macOS only).

```sh
git clone https://github.com/<you>/Beacon.git
cd Beacon && git switch dev
npm ci
npx expo run:android   # or: npx expo run:ios
```

The app uses native modules, so **Expo Go won't work**: `expo run` builds a development build.
Once it's installed, `npx expo start` is enough until you add a native dependency; then run
`npx expo prebuild --clean` and rebuild.

Before opening a pull request:

```sh
npx tsc --noEmit
npx expo lint
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE): free to use, modify and share for noncommercial purposes.
