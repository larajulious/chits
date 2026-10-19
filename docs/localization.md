# Chits localization — 14 languages

Implementation status: bundled coverage and automated checks pass. The ten new
catalogs are translation drafts, with curated primary labels and repairs to
untranslated sentences. They require native-speaker review before production
linguistic sign-off. Matching keys does not establish translation quality.

## Architecture and preserved behavior

The existing i18next/react-i18next runtime remains the sole translation system.
Locales: `en`, `fil`, `pt-BR`, `es`, `id`, `fr`, `de`, `ja`, `ko`, `it`, `vi`,
`hi`, `tr`, `ar`. All UI catalogs, plural rules, native permission descriptions,
and mascot greetings are bundled offline. No new package was added for this
expansion. Automated drafts used Google Translate for app-owned English resources. Only app-owned English copy was used to generate translation drafts;
no user notes were transmitted. Runtime translation makes no network requests.

Language preference still uses the existing `app_settings.app_language` value.
The provider reads it in a layout effect before exposing the main app; a failed save
keeps the prior preference. System Default considers supported device languages
in order, keeps region-specific formatting, and refreshes on foreground. English
is the final fallback. `tl` maps to Filipino and Portuguese variants to `pt-BR`.
The bootstrap loading/recovery surface uses the device language before SQLite is
available; it can differ from a saved override during database opening.

All 1,549 pre-existing values in each original catalog were preserved. Four
language-search strings, two column count forms, two shortcut descriptions and a
custom-reminder label were appended, giving 1,558 canonical English keys.
New catalogs cover the existing screens, onboarding, messages, notifications,
permissions and editor labels. Mascot libraries add three local lines per period
for each new language; the original larger libraries are preserved.

No SQLite schema, note text, filenames, rich-content structure, timestamps,
backup format, editor selection/composition handler, or language-based React key
was changed. Stored reminder instants and existing fallback notification bodies
remain stable across interface changes. Language-list search folds accents only
in its own metadata; it does not change note-search semantics or stored Unicode.

## Files and coverage

- `src/localization/runtime.ts`, `provider.tsx`, `bootstrap.ts`, `plurals.ts`: resolution, persistence, bundled resources and regional formatting.
- `src/localization/languages.json`: native names, English search names, IDs and direction.
- `src/localization/locales/*.json`: 14 complete catalogs, retaining canonical one/other keys and adding CLDR categories where required.
- `src/localization/native/*.json`, `app.json`: all native language declarations and iOS permission descriptions.
- `src/localization/glossary.json`: terminology across all 14 languages; new-language terms are editorial choices pending review.
- `src/localization/text-layout.ts`, `language-search.ts`: pure bidi, font and language search helpers.
- `src/components/settings/language-picker.tsx`: native-name search, pinned System Default, radio accessibility state, selected checkmark, 52-point minimum rows, wrapping labels, no automatic keyboard focus.
- Shared text, search, headers, dialogs, drawer, bottom navigation, note block/list rendering and paper previews: targeted direction/font behavior.
- `src/constants/mascot-greetings`: bundled new greeting libraries.
- `scripts/check-localization.mjs`, localization tests and editor harnesses: validation and regressions.

Run `npm run check:localization`. `docs/localization-report.json` is the generated
machine-readable report: coverage, actual plural categories, missing/errors,
identical English values and unresolved review requirements. Missing-key and
placeholder error lists are empty in the accepted run. Identical values are
explicitly listed, including loanwords, homographs, brands and composition-only
templates; reviewers must confirm them rather than silently assuming correctness.

The audit checks JSON loading, empty values, missing/unknown keys, placeholders,
all CLDR categories, locale/native registry consistency, static translation
references, raw JSX, selected literal UI attributes and display branches/templates in those attributes. It does not prove every
dynamic string is covered or every screen is linguistically correct.

## Arabic and writing systems

The SDK 57 expo-localization plugin declares `supportsRTL: true` and all fourteen
native locales, with dynamic Android locale changes enabled. Expo config
introspection passes. A new native build/prebuild is required to ship these
updated native declarations; an existing development client is not evidence of
release native configuration.

RTL changes live through Expo Router's installed `LocaleProvider`, with stable
component identities. No `forceRTL`, app reload, or language-keyed remount is
used. The root drawing surface stays physically LTR; automatic native left/right
swapping is disabled so Spaces coordinates, crop/media controls and board drag
geometry retain their meaning. Evaluated header, search, dialog option, settings,
drawer navigation and bottom navigation rows opt into Arabic row direction.
Navigation back/forward icons mirror, while media icons do not. The drawer opens
from the right edge in Arabic with matching edge-swipe direction. Spatial boards
and paper/canvas decorations keep their original coordinates.

Text uses first-strong-letter direction, so English URLs stay LTR inside Arabic
UI and Arabic notes align right in English UI. String substitutions in Arabic
UI are isolated with FSI/PDI, display-only. Numeric count labels in Arabic use
explicit neutral “number of …” phrasing across the six CLDR categories. Native
review must assess these and the expanded backup/attachment plural phrases.

Arabic, Devanagari and CJK text use system font fallback rather than a bundled
Latin handwriting face. Vietnamese UI also uses system fonts. Shared AppText
allows extra line height/font padding for complex scripts. Note inputs retain
the same value, refs, selection, change/Enter/Backspace and native paste handlers;
only display direction/font styles change. Device IME behavior is not established
by pure rendering tests. Fixed-height paper thumbnails still need visual checks
for clipping at larger accessibility sizes.

## Validation and performance

Commands: `npm run check:localization`, `npx tsc --noEmit`, `npm run lint`,
`npm test`, and `npx expo export --platform ios --platform android`.
See `docs/localization-performance.json` for catalog sizes, Node initialization
measurements and actual before/after Hermes bundle bytes. Reproduce resource
timings with `node scripts/measure-localization.mjs [catalog-directory]`. The baseline is the
four-language export from this working session. Node timings measure synchronous
resource parsing/initialization, not mobile cold launch, scrolling or keyboard
latency. No device startup/keyboard performance acceptance is claimed.

Locale-subscribed UI functions opt out of React Compiler memoization using
`"use no memo"`: the existing global `tr()` reads mutable i18next state, which
compiler caching otherwise kept stale after a live language switch. A test runs
the actual appearance component through the installed compiler and renders it
across language changes. This boundary is deliberate while the existing global
translator API remains; a future hook-bound translator could narrow it. Manual
`useMemo`/callbacks and arbitrary dynamic strings still need screen-level review.
A provider regression test verifies saved-language initialization runs outside
render and exposes the main tree only after external i18next synchronization.

The manual test matrix below is required before calling the feature production
ready. Existing source changes from the preceding four-language implementation
remain in the worktree; the file inventory includes those inherited changes.

## Recorded validation

The recorded run is also available in `docs/localization-validation.json`.

- Full regression suite: 370 tests passed, including translation coverage for all 14 locales, SQLite preference/content preservation, reminders, rich-list/editor behavior, backup/restore, compiler reactivity and provider initialization.
- TypeScript, Expo lint and localization audit pass. The bundled plural polyfill was also exercised with `Intl.PluralRules` removed across all 14 locales.
- iOS and Android Hermes exports pass; these are JavaScript artifacts, not fresh native release builds.
- Samsung SM-S911B, Android 16, existing development client: visually inspected native-name picker, current selection, search with Samsung keyboard visible, Arabic Settings/header/navigation/list counts and right-side drawer; switched to Japanese and confirmed its preference survived force-stop/relaunch. The original Filipino selection was restored afterward. No user note text was entered or edited during this check.
- Device evidence was captured locally under `/tmp/chits14-*`: picker, search-keyboard, Arabic drawer/settings, Japanese Settings/relaunch and restored Filipino Settings. This is limited smoke testing; the complete per-language/device/IME/accessibility matrix remains pending.
- iOS simulator is booted, but the new picker/RTL/IME acceptance was not exercised there. No Gboard, Japanese/Korean/Hindi/Arabic composition, selection/cursor, VoiceOver/TalkBack, maximum-font, or full offline startup/performance acceptance was completed.

## Native-speaker review

Each new locale needs a native reviewer for **all keys**, permission descriptions,
mascot lines, plural forms, terminology, polite/informal tone and screen context.
Pay special attention to ambiguous source words (board/card/column/space/chit),
sentences whose variables represent nouns, backup recovery errors, onboarding,
accessibility labels, truncated theme names and Arabic mixed text. Automated
drafts were not approved by professional translators. Existing four languages
also retain their previous review status; adding search labels does not certify
their linguistic quality.

## Manual acceptance matrix (pending unless recorded below)

For **each of 14 languages**, on iOS and Android, in light/dark and Classic/Sticky:

- [ ] Select language, confirm checkmark and translated Settings; kill/relaunch and verify persistence. Check System Default, unsupported-device fallback, regional dates/timezone, 12/24-hour preference and no English flash on the first main screen.
- [ ] Browse Notes, Chat, Boards/Cards/columns, Calendar, Attachments, Spaces, Settings, themes/photo headers, reminders, backup/restore, onboarding, Revisit and Connected Notes. Verify every empty/error/permission and confirmation state.
- [ ] On a small screen and maximum font size, check German/French long labels, dialogs, bottom tabs, scroll targets and truncation. Test VoiceOver/TalkBack focus order, radio state, language pronunciation, keyboard dismissal and touch targets.
- [ ] Arabic: left/right navigation, drawer edge gestures, search, buttons/dialogs, card lists, per-content checkboxes, punctuation, dates/numbers, Latin URLs, filenames, mixed paragraphs and rich lists. Confirm spatial board/Spaces dragging remains physical and no unexpected restart occurs.
- [ ] Fullscreen Chat and Add/Edit Note: type, compose, Enter, Backspace across list/image boundaries, select/copy/paste, bullet/number/checklists, undo/redo, save/reopen. Change UI language with an unsaved editor retained; confirm content/selection and no lost input.
- [ ] Gboard, Samsung Keyboard, iOS Japanese Kana/Romaji, Korean, Hindi and Arabic keyboards: hold unfinished composition, convert candidates, move cursor and delete combining glyphs. Verify no composition reset or cursor jump.
- [ ] Round-trip mixed Unicode through SQLite and backup/restore, including `日本語 한국어 हिन्दी Tiếng Việt العربية Türkçe é 👩🏽‍💻`, filenames and multi-block checklists. Verify note search retains its existing semantics.
- [ ] Airplane mode: launch, switch all languages, format dates/plurals and edit/save. Verify no locale downloads. Compare release cold-launch, navigation, typing and memory with four-language baseline on the same hardware.
- [ ] Build fresh iOS/Android clients and verify OS per-app language settings, permission language, Android locale configuration and iOS InfoPlist.strings in final artifacts.

## Store readiness (no store changes made)

Store locale IDs and territory availability are separate from this app's locale
IDs. Confirm the current language list and exact IDs in each console before
creating any listing; no one-to-one store support for all 14 is assumed.

- [ ] Confirm supported metadata locale mapping for every target locale and choose a primary fallback; decide distribution countries/regions separately.
- [ ] Prepare native-reviewed app names/subtitles, descriptions and release notes. Prepare App Store keywords/promotional text only where the console supports those fields.
- [ ] Produce screenshots and captions from the reviewed release app for each locale; check RTL framing, glyphs, device sizes, sample-note privacy and text expansion.
- [ ] Review privacy/support URLs and local support expectations; do not promise unsupported features or guaranteed linguistic quality.
- [ ] Review localized previews and fallback behavior in App Store Connect and Play Console, then publish through the usual explicit release workflow.

References: [Apple localization workflow](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information),
[Apple metadata locales](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/),
[Google Play localization workflow](https://support.google.com/googleplay/android-developer/answer/9844778).
Expo implementation reference: [SDK 57 localization](https://docs.expo.dev/versions/v57.0.0/sdk/localization/).
