# Chits Anywhere

Implemented for Expo 57.0.26 / React Native 0.86.3, with `expo-widgets` 57.0.26 and a single deduplicated `@expo/ui` 57.0.25. The implementation was checked against https://docs.expo.dev/versions/v57.0.0/ and its Widgets reference before coding.

## Audit and implementation

- Notes already have two identities: `messages` (thoughts) and `cards` (organized notes). There is no new note database or capture inbox. Template-created notes use those same records. Space placements and Board relationships are untouched.
- A recent note is an active, visible thought or an active card on an active Board. An organized thought appears through its card, once. Existing behavior treats thoughts whose owning card/Board is archived as unorganized; the widget follows that rule. Cards containing hidden thoughts are omitted, matching the existing covered-card rule. Archived/deleted thoughts do not hide an otherwise active card, and their text is excluded from widget title fallbacks and previews.
- The latest five are selected from indexed candidate queries. A linked thought's existing update timestamp contributes to the displayed card's recency without changing the card's stored timestamp. Results have a deterministic tie order. Migration 30 adds two partial indexes and does not rewrite notes.
- Quick Note opens the existing Chat composer with its existing `focusInput=1` behavior. Existing drafts are retained. Opening the widget does not create an empty record.
- Each recent row links through `/anywhere` with only kind and stable ID. That route rechecks eligibility, then uses `dismissTo` to reuse an existing editor/detail destination. Missing or hidden notes show the existing unavailable message. Editor/detail routes have stable note identities; a widget cold launch with no back stack returns to Chat on close. Reusing an existing editor does not reload its unsaved draft when autofocus parameters change. Thought links open the existing content editor without automatically raising the keyboard; cards open existing Card Details.
- Privacy lives in existing SQLite `app_settings`: `anywhere_privacy`. Default: no identifiers, titles, timestamps, or previews in the shared snapshot. Titles and previews require separate opt-ins under Settings → Widget privacy. Titles are bounded to 100 characters and previews to 160; full note documents, attachment paths, and media never enter the snapshot.
- `AnywhereCoordinator` observes SQLite changes and foreground/background transitions. It debounces changes and deduplicates identical snapshots. Snapshot reads wait for explicit transactions to settle and retry if a transaction crosses the read; rollback data is never published. Native publishing is serialized across coordinator remounts so an older write cannot replace a newer privacy setting. Draft/settings-only changes do not requery notes unless privacy changed. Backup restore already remounts the database tree; the new coordinator rebuilds the restored projection. Failures do not log note contents.
- Theme colors come directly from the resolved app theme, including a manually selected light/dark appearance. The unmodified approved `assets/images/app_icon.png` is used on both platforms (Android uses `drawable-nodpi` to prevent resource-density upscaling). The widget uses native rounded typography and note/compose icons.
- All 14 bundled languages include widget labels, empty/privacy states and settings. Android gallery strings use native resources; the iOS config plugin adds a localized string catalog to the generated extension. Widget text follows the app language; gallery localization follows the platform's chosen language.

The widget package requires Expo UI `~57.0.25`. An older locked root UI copy (`57.0.21`) caused native autolinking to miss `WidgetKitModifiers`; aligning the root dependency removes the duplicate and preserves the existing SDK version.

## Native integration

**iOS:** SDK-compatible `expo-widgets` / WidgetKit with App Group `group.com.larajulious.chitsapp` and extension `com.larajulious.chitsapp.ExpoWidgetsTarget`. Small, medium and large families are registered. Expo generates the extension and CocoaPods wiring; `plugins/with-chits-anywhere.js` adds its gallery translations. The approved icon is copied to the App Group, and only the display snapshot is shared. Note rows are marked privacy sensitive. SwiftUI relative date text updates through the system.

**Android:** the existing local `chits-attachments` Expo module registers `ChitsAnywhereModule` and `ChitsAnywhereProvider`. RemoteViews uses dedicated small, medium and expanded layouts, five independently linked rows when expanded, immutable explicit PendingIntents, and app-private SharedPreferences. Resize and reinstall refresh from the saved snapshot. There are no new permissions or network requirements. A platform-managed 30-minute widget refresh updates relative labels while the app is closed; Android may defer it. No JavaScript polling or background worker is installed.

Android switches to the medium layout below 260dp height and shows two recent rows; below 200dp width it shows Quick Note only. Preview lines require at least 340dp height. Medium and large widgets use a single compact header with branding and Quick Note, followed by full-width recent rows. Dates sit below titles rather than competing for title width; expanded preview lines share the metadata line. Rows divide the available list height evenly, with subtle separators. Small widgets retain the mascot and full-width capture action. The approved icon is displayed in a rounded tile without modifying its source image.

Native folders are ignored in this repository. The committed sources of native integration are `app.json`, the config plugin, dependency lockfile and local module. Run:

```sh
npx expo prebuild --platform ios --no-install --no-clean
cd ios && pod install
```

A new native binary is required; Expo Go and an OTA update cannot install the widget extension. Distribution signing must include the new extension and App Group in the provisioning profiles. Neither a simulator build nor an unsigned build verifies that provisioning.

## Manual acceptance checklist — both platforms

Use an installed production-compatible build. Keep checks outstanding until actually performed on each physical platform.

- [ ] Add small, medium and large/expanded widgets; verify mascot proportions, readable titles, two medium rows and five expanded rows. Resize Android in portrait and landscape; check long translations and increased text size.
- [ ] Tap Quick Note from a terminated app, background app and active app. Keyboard becomes ready in the existing composer. Cancel without sending; verify no empty note was created and existing drafts were preserved.
- [ ] Create at least six notes, including a Template note and a Board card containing multiple thoughts. Verify the newest five unique identities and deterministic ordering. Edit the oldest thought, then a thought linked to a card; verify that each becomes recent.
- [ ] Tap all five rows. Check the correct original editor/Card Details and retained Board/Space placement. Tap rapidly and repeatedly; verify no duplicate editor stack.
- [ ] Delete, archive, restore and hide notes. Tap a stale widget row while refresh is delayed; verify unavailable handling. Archive a Board and check the existing unorganized-thought rule.
- [ ] Test no notes and fewer than five notes. Hidden information must not be mistaken for an empty database.
- [ ] Default privacy: Quick Note only and the hidden-information explanation. Enable titles: titles appear, no previews. Enable previews: short lines appear only where space permits. Disable titles: all note fields disappear from widget storage as well as the layout after synchronization.
- [ ] Toggle every supported app theme, system light/dark, and manual appearance. Check contrast in normal and tinted iOS widget modes.
- [ ] Select every supported language, especially Arabic RTL, German, Hindi and Japanese. Check labels, relative times, gallery descriptions and accessible actions.
- [ ] Restore a backup with different notes and privacy preferences, then verify the rebuilt widget. Test a failed restore and subsequent reopening.
- [ ] Test offline, terminate/reopen, reboot, remove/re-add the widget, and multiple widget instances. No network connection should be required.
- [ ] Verify signed iOS Archive/TestFlight and Android release installation, including App Group entitlement and widget extension embedding.

Refresh requests are best effort: WidgetKit and Android launchers decide when to redraw. Disabling visibility cannot retract screenshots or content already viewed on the home screen. Physical-device launcher interactions and signed distribution acceptance must be recorded separately from automated checks.

## Validation

- TypeScript (`npx tsc --noEmit`): passed after Expo UI alignment.
- ESLint (`npm run lint`): passed.
- Localization audit: passed for all 14 bundled languages, with no missing keys or placeholder mismatches.
- Node suite: 436 passed, 0 failed (includes nine focused widget tests and the existing backup/restore suites).
- A host SQLite fixture with 1,000 thoughts on one card returned one unique note in approximately 11 ms. This is a fixture measurement, not a device performance guarantee.
- Android Release app build: passed for arm64-v8a and x86_64. Native module Release build also passed.
- Physical Android: the native RemoteViews test passed on Samsung SM-S911B / Android 16. It covers four size configurations × three privacy modes × light/dark palettes, verifies row identity/count and measures that rows fit. A standalone rerun passed, captured fixture renderings, and removed its temporary test application afterward. The installed Chits application and its notes were not replaced by that fixture test.
- Native fixture renderings were visually reviewed: [dark](artifacts/chits-anywhere-android-dark.png), [light](artifacts/chits-anywhere-android-light.png). These show native layouts with synthetic fixture labels; they are not screenshots of an installed home-screen widget or private notes.
- iOS Release simulator build (arm64, signing disabled): passed after Expo UI alignment. The WidgetKit extension is embedded; app and extension versions match (1.0.7 / build 19), and all 14 gallery localizations are present. Fresh iOS prebuild from an empty native folder also passed; the generated Xcode project parses with one widget target and one correctly typed string catalog. The catalog plugin is registered before `expo-widgets` so reverse mod execution creates the target before attaching resources.
- Physical iOS: the signed Release app and widget extension built successfully and installed on the paired iPhone 14. The Quick Note launch was blocked by the locked device (CoreDevice error 10002 / FBS Locked). Launch, keyboard, and home-screen interaction QA remain pending.
- Live Expo dependency check reports ten pre-existing SDK 57 patch updates (Expo, Asset, Constants, Image Manipulator, Linking, Notifications, Router, Sharing, Splash Screen and SQLite). The widget and aligned Expo UI versions are not flagged. Those existing packages were kept at their current versions for this feature.
- `git diff --check`: passed.

Widget placement, real launcher taps, cold-start keyboard behavior, full localization on screen, and store distribution are still manual acceptance checks. No TestFlight/Play submission or signed iOS Archive was performed. Native build logs are retained under `/tmp/chits-anywhere-*.log` for this workstation session.

Local Android Release APK: `android/app/build/outputs/apk/release/app-release.apk`. Signed iPhone build: `/tmp/chits-anywhere-device-derived/Build/Products/Release-iphoneos/Chits.app`.

## Layout correction after manual review

The medium sidebar and large full-width compose banner were replaced with a compact shared header. Notes use the full list width; title, preview and timestamp have a consistent hierarchy, and rows fill the available space evenly. Hidden/empty copy occupies the list area. No storage, privacy, eligibility or navigation behavior changed.

Android fixture captures: [small](artifacts/chits-anywhere-android-small.png), [medium](artifacts/chits-anywhere-android-medium.png), [large light](artifacts/chits-anywhere-android-light.png), [large dark](artifacts/chits-anywhere-android-dark.png). These are native renders of synthetic notes, not Home Screen screenshots. The physical-device test covers 24 size/privacy/palette combinations and checks title and metadata bounds within every row, using synthetic long titles and different relative dates. TypeScript, ESLint and the nine widget behavior tests pass. The revised signed iOS Release build passes and is installed on the paired iPhone 14. iPhone Home Screen visual review and launch/keyboard interaction remain pending for the user.

## iOS 1.0.7 build 20 pre-Archive

The requested iOS version/build is synchronized in `app.json`, both native target build configurations, and the app/extension Info.plists: **1.0.7 (20)**. The resolved Expo config agrees. CocoaPods lockfiles match and the Chits scheme uses Release for Archive.

The generic-device production Release build passed. The final app and embedded `ExpoWidgetsTarget.appex` both report 1.0.7 (20). The app includes an 8,165,629-byte `main.jsbundle` and the widget bundle. Strict deep code-sign verification passed with Apple Development signing for team `9JQLWTZ683`.

Build artifact: `/tmp/chits-anywhere-device-derived/Build/Products/Release-iphoneos/Chits.app`. Build log: `/tmp/chits-ios-1.0.7-20-prearchive.log`.

Open `ios/Chits.xcworkspace`, select scheme **Chits** and **Any iOS Device (arm64)**, then choose **Product → Archive** and validate in Organizer. Archive creation, distribution validation and upload remain user-owned. The build-20 preflight did not install or launch the app on a device; the earlier Home Screen and tap checks remain pending.

## Changed files

- `app.json`
- `docs/localization-report.json`
- `modules/chits-attachments/android/src/main/AndroidManifest.xml`
- `modules/chits-attachments/expo-module.config.json`
- `package-lock.json`
- `package.json`
- `src/app/_layout.tsx`
- `src/app/card/[id].native.tsx`
- `src/app/card/edit-content.native.tsx`
- `src/app/settings.tsx`
- `src/db/migrations.ts`
- `src/db/provider.native.tsx`
- `src/db/repositories.ts`
- `src/localization/locales/ar.json`
- `src/localization/locales/de.json`
- `src/localization/locales/en.json`
- `src/localization/locales/es.json`
- `src/localization/locales/fil.json`
- `src/localization/locales/fr.json`
- `src/localization/locales/hi.json`
- `src/localization/locales/id.json`
- `src/localization/locales/it.json`
- `src/localization/locales/ja.json`
- `src/localization/locales/ko.json`
- `src/localization/locales/pt-BR.json`
- `src/localization/locales/tr.json`
- `src/localization/locales/vi.json`
- `docs/artifacts/chits-anywhere-android-dark.png`
- `docs/artifacts/chits-anywhere-android-light.png`
- `docs/artifacts/chits-anywhere-android-medium.png`
- `docs/artifacts/chits-anywhere-android-small.png`
- `docs/chits-anywhere.md`
- `modules/chits-attachments/android/src/androidTest/java/expo/modules/chitsattachments/ChitsAnywhereTest.kt`
- `modules/chits-attachments/android/src/main/java/expo/modules/chitsattachments/ChitsAnywhereModule.kt`
- `modules/chits-attachments/android/src/main/java/expo/modules/chitsattachments/ChitsAnywhereProvider.kt`
- `modules/chits-attachments/android/src/main/res/drawable-nodpi/chits_anywhere_icon.png`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_action.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_background.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_compose.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_compose_light.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_divider.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_icon_frame.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_note.xml`
- `modules/chits-attachments/android/src/main/res/drawable/chits_anywhere_note_light.xml`
- `modules/chits-attachments/android/src/main/res/layout/chits_anywhere.xml`
- `modules/chits-attachments/android/src/main/res/layout/chits_anywhere_medium.xml`
- `modules/chits-attachments/android/src/main/res/layout/chits_anywhere_row.xml`
- `modules/chits-attachments/android/src/main/res/layout/chits_anywhere_small.xml`
- `modules/chits-attachments/android/src/main/res/values-ar/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-de/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-es/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-fil/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-fr/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-hi/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-id/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-it/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-ja/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-ko/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-pt-rBR/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-tr/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values-vi/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/values/anywhere_strings.xml`
- `modules/chits-attachments/android/src/main/res/xml/chits_anywhere_info.xml`
- `plugins/with-chits-anywhere.js`
- `src/app/anywhere.tsx`
- `src/features/anywhere/coordinator.native.tsx`
- `src/features/anywhere/coordinator.tsx`
- `src/features/anywhere/privacy-settings.tsx`
- `src/features/anywhere/publish-queue.ts`
- `src/features/anywhere/publish.android.ts`
- `src/features/anywhere/publish.ios.ts`
- `src/features/anywhere/publish.ts`
- `src/features/anywhere/snapshot.ts`
- `src/features/anywhere/widget.tsx`
- `src/services/database-transactions.ts`
- `tests/anywhere.test.mjs`
