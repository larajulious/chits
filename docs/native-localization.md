# Chits native language recognition — 2026-10-18

## Result and scope

Configured SDK 57 native language declarations for every language verified in the current bundled runtime, language picker registry, UI catalogs, native permission descriptions and mascot catalogs. No dependency installation was necessary: installed `expo-localization` 57.0.2 matches Expo's SDK 57 requirement `~57.0.2` (Expo itself is 57.0.26).

The existing plugin already declared all languages in a shared array, but the local generated native projects still declared only English, Filipino, Brazilian Portuguese and Spanish. The plugin now explicitly declares each platform. Local native language files were synchronized narrowly, using Expo's locale resource generator for Xcode references. All other iOS plist keys, Android permissions, identifiers, version/build settings and existing native source were preserved. Existing RTL flags in app configuration were propagated to the stale native resources.

## Detected languages and completeness

| Language | Exact BCP-47 code | Canonical keys present | Total keys including plural forms | Values identical to English | Translation status |
| --- | --- | --- | --- | --- | --- |
| English | `en` | 1558/1558 | 1558 | source | English source |
| Filipino | `fil` | 1558/1558 | 1558 | 69 | Existing translation; review not certified |
| Portuguese Brazil | `pt-BR` | 1558/1558 | 1581 | 17 | Existing translation; review not certified |
| Spanish | `es` | 1558/1558 | 1581 | 16 | Existing translation; review not certified |
| Indonesian | `id` | 1558/1558 | 1558 | 18 | Translation draft; native review required |
| French | `fr` | 1558/1558 | 1581 | 32 | Translation draft; native review required |
| German | `de` | 1558/1558 | 1558 | 30 | Translation draft; native review required |
| Japanese | `ja` | 1558/1558 | 1558 | 2 | Translation draft; native review required |
| Korean | `ko` | 1558/1558 | 1558 | 7 | Translation draft; native review required |
| Italian | `it` | 1558/1558 | 1581 | 19 | Translation draft; native review required |
| Vietnamese | `vi` | 1558/1558 | 1558 | 10 | Translation draft; native review required |
| Hindi | `hi` | 1558/1558 | 1558 | 6 | Translation draft; native review required |
| Turkish | `tr` | 1558/1558 | 1558 | 10 | Translation draft; native review required |
| Arabic | `ar` | 1558/1558 | 1650 | 7 | Translation draft; native review required |

Every catalog is structurally complete: no missing/empty canonical values, placeholder mismatches or missing CLDR plural forms in the executed audit. Identical English strings include brands, homographs and templates; their presence requires review and is not proof of an untranslated sentence. Full key lists remain in `docs/localization-report.json`. Key coverage does not certify linguistic accuracy. All existing languages remain available; no translation values were changed.

`fil` is the supported Filipino ID; the existing runtime maps device `tl` to `fil`. Brazilian Portuguese stays `pt-BR`; no saved IDs were renamed. All declared IDs pass canonical BCP-47 validation. The existing resolver maps other Portuguese device variants to the Brazilian catalog without advertising additional native locales.

## Final Expo localization entry

```json
[
  "expo-localization",
  {
    "supportedLocales": {
      "ios": [
        "en",
        "fil",
        "pt-BR",
        "es",
        "id",
        "fr",
        "de",
        "ja",
        "ko",
        "it",
        "vi",
        "hi",
        "tr",
        "ar"
      ],
      "android": [
        "en",
        "fil",
        "pt-BR",
        "es",
        "id",
        "fr",
        "de",
        "ja",
        "ko",
        "it",
        "vi",
        "hi",
        "tr",
        "ar"
      ]
    },
    "allowDynamicLocaleChangesAndroid": true,
    "supportsRTL": true
  }
]
```

`ios.infoPlist.CFBundleDevelopmentRegion` remains `en`. The plugin generates `CFBundleLocalizations`; there is no second hand-maintained locale list in `ios.infoPlist`. Existing `expo.locales` maps each language to `src/localization/native/<code>.json`, producing an actual `<code>.lproj/InfoPlist.strings` resource copied by Xcode. These directories matter for Apple's store language detection, alongside the declared bundle localizations.

## Files modified for this request

- `app.json`: changed the existing localization entry to explicit `supportedLocales.ios` and `.android`; retained every existing plugin and native locale mapping.
- `scripts/check-localization.mjs`: validate both platform lists, exactly one plugin, canonical locale IDs and registry uniqueness; removed a hardcoded language count.
- `scripts/check-native-localization.mjs`: new executable audit for generated iOS plist/Xcode resource membership and Android manifest/XML/Gradle/RTL resources. Accepts an optional isolated native project directory.
- `tests/localization.test.mjs`: added registry agreement and real file-backed SQLite close/reopen persistence tests across all languages and changed device locales.
- `docs/localization-report.json`: refreshed existing catalog audit output.
- `docs/native-localization.md`: this implementation report.
- Local generated files, ignored by Git: `ios/Chits/Info.plist`, `ios/Chits.xcodeproj/project.pbxproj`, all `ios/Chits/Supporting/*.lproj/InfoPlist.strings` (four regenerated, ten added), `android/app/build.gradle`, `android/app/src/main/res/xml/locales_config.xml`, `android/app/src/main/res/values/strings.xml`. The Android manifest already referenced the locale XML and already handled locale/layoutDirection changes, so it required no edits.

No app feature, translation runtime, language selector, storage schema, user content, fallback behavior, navigation or dependency version was changed for this request. Other pre-existing worktree changes remain in place.

## Executed validation

- `npm run check:localization`: passed for all detected languages, 1,558 canonical keys and 2,071 static translation references.
- `npx expo config --type public --json`: passed; resolved plugin lists match the catalog registry.
- `npx expo config --type introspect --json`: passed; iOS bundle locales match the registry.
- `CI=1 npx expo prebuild --no-install`: passed in an isolated temporary project using the current app config, package files, assets and installed dependencies. Existing native projects were not replaced by this prebuild.
- `node scripts/check-native-localization.mjs`: passed against both the isolated fresh prebuild and synchronized local projects. All 14 iOS language resources are linked into the Xcode resources phase. Android manifest points to `@xml/locales_config`; its language list and the single Gradle resourceConfigurations declaration match the registry, including `b+pt+BR`.
- `plutil -lint`: passed for the local iOS Info.plist, Xcode project and all 14 InfoPlist.strings files.
- `node --import ./tests/helpers/localization-loader.mjs --test tests/localization*.test.mjs`: 31 passed, zero failed. Includes all offline catalog switches, fallback, picker language search, persisted preference reads, file-backed SQLite close/reopen, manual override priority for changed device languages, plural selection and no navigator/editor remount or reminder replacement.
- `npx tsc --noEmit`: passed.
- `npx eslint scripts/check-native-localization.mjs scripts/check-localization.mjs tests/localization.test.mjs`: passed.

No production native compile/Archive, IPA/AAB inspection, EAS build, upload, publication or current-turn device restart/OS-settings acceptance was performed. Tests establish persistence and precedence at the code/SQLite level; they do not establish native device acceptance. Earlier device notes in `docs/localization.md` were not rerun here.

## Existing language preference behavior

The picker saves `app_language` in SQLite `app_settings`, then publishes the language after a successful save. Startup reads the existing preference before exposing the main tree. Foreground changes resolve from that saved preference; only System Default follows the OS-selected locale. English remains the final fallback. A manual in-app selection intentionally takes precedence over the OS per-app selection. The two selectors are not bidirectionally synchronized by this change. To test OS language selection, first choose System Default inside Chits.

## Production builds

From the Chits project, with EAS authentication and signing already configured:

```sh
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
```

These commands were provided, not executed. Existing `eas.json` uses remote versioning and production auto-increment. Native directories are ignored by Git and there is no `.easignore`; the normal EAS upload regenerates them from the Expo configuration. A custom archive that includes native directories must include the synchronized native resources. An OTA JavaScript update cannot ship these native language declarations.

## Final artifact and App Store verification

1. After the production build, inspect the exact IPA/Archive: confirm the app's `Info.plist` contains the declared `CFBundleLocalizations`, and all matching `.lproj/InfoPlist.strings` folders exist in the built app. Confirm permission strings are present and Chits remains the brand name.
2. Upload the new binary to App Store Connect and allow processing; select that build for the new app version. Install through TestFlight and verify iOS Settings → Apps → Chits → Language (wording depends on iOS), System Default inside Chits, manual override, and termination/relaunch persistence.
3. After approval and release, open the actual public Chits product page → Information → Languages. Check Apple's rendered language names against the submitted bundle. The current live page does not change from editing this repository, and Apple's eventual displayed names/grouping were not verified.
4. If a language is absent, inspect the submitted app bundle's resources first and confirm that the released version actually uses the new build. Apple's language display is derived from the binary; adding a translated store description alone does not establish app language support.

## Android 13+ verification

1. Inspect the production AAB/APK with Android Studio APK Analyzer or bundletool: confirm the merged manifest's `android:localeConfig`, referenced locale XML, and supported resource configuration entries survived packaging.
2. Install that build on Android 13 or newer. In Chits choose Settings → Language → System Default. In system Settings → Apps → Chits → Language (or System → Languages → App languages), verify all declared locales are available.
3. Select several OS locales, including `pt-BR`, Japanese and Arabic; foreground/relaunch Chits and verify translated UI. Select an explicit language inside Chits, change the OS language, and verify the saved in-app choice persists. Switch back to System Default to follow OS changes again.
4. Force-stop/reopen and reboot the device to verify persistence; confirm note content, reminders, attachments and backup remain intact. Android below 13 retains the existing in-app picker; it has no equivalent Android 13 per-app settings screen.

## Store listing requirements and references

App language resources and translated store listings are separate. In App Store Connect, manually add supported metadata localizations and reviewed descriptions, subtitle/keywords, screenshots and release notes as applicable. In Play Console, add translated listing text and localized assets through the listing's translation controls. Preserve Chits as the brand. Check each console's supported locale mappings; native `fil` or another app locale does not imply a matching Apple metadata localization is offered. Country distribution remains a separate setting. No listing text or console settings were changed.

- [Expo SDK 57 localization](https://docs.expo.dev/versions/v57.0.0/sdk/localization/) and the installed 57.0.2 plugin source govern generation.
- [Apple: language determination and App Store Languages](https://developer.apple.com/library/archive/qa/qa1828/_index.html).
- [Android: per-app language preferences](https://developer.android.com/guide/topics/resources/app-languages).
- [EAS build setup](https://docs.expo.dev/build/setup/).
- [Apple: localize app information](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information/) and [supported metadata localizations](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/).
- [Google Play: translate and localize your app](https://support.google.com/googleplay/android-developer/answer/9844778).
