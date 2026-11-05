# Indian-language expansion — 2026-11-05

Chits now bundles 21 interface languages. Tamil, Telugu, Bengali, Marathi,
Kannada, Malayalam and Gujarati each cover all 2,048 current English keys.
Hindi was audited and retained; nine existing strings were repaired to remove
English navigation terms. English and the other thirteen existing catalogs are
unchanged from the working tree at the start of this task.

**Linguistic status: translation drafts, native-speaker review required for every
key in all seven new languages, and for the existing Hindi catalog.** Drafts
were generated using Google Translate on app-owned English copy, then checked
for structure, stray English, token corruption and selected contextual wording.
No user notes, attachments, databases or personal content were sent for
translation. No translation service or network dependency was added to the app.
These checks do not certify native fluency, register, grammar or cultural fit.

| Requested locale | Bundled ID | Picker name | Canonical keys |
| --- | --- | --- | --- |
| hi-IN | hi | हिन्दी | 2,048 |
| ta-IN | ta | தமிழ் | 2,048 |
| te-IN | te | తెలుగు | 2,048 |
| bn-IN | bn | বাংলা | 2,048 |
| mr-IN | mr | मराठी | 2,048 |
| kn-IN | kn | ಕನ್ನಡ | 2,048 |
| ml-IN | ml | മലയാളം | 2,048 |
| gu-IN | gu | ગુજરાતી | 2,048 |

The existing short language IDs remain canonical, including Hindi's saved `hi`
value. Regional device tags such as `ta-IN` and `ta_IN` resolve to `ta`, and
`en-US` resolves to bundled English. No preference or schema migration is needed.

## Behavior and typography

The current i18next runtime, English fallback, System Default detection,
foreground device-language refresh and SQLite `app_language` preference remain
in use. Every saved manual override wins over device-language changes. Saving a
language publishes the change only after the existing local write succeeds.
There are no locale-based navigation keys, app reloads or editor remounts.

All seven catalogs, CLDR plural-rule fallbacks, permission descriptions and
mascot libraries are bundled. Each mascot library supplies three greetings for
every time period. The native-name picker is still searchable and scrollable;
its wrapping rows retain a 52-point minimum. Radio rows now declare their own
language for supported screen-reader pronunciation.

The shared script detector recognizes Tamil, Telugu, Bengali, Devanagari,
Kannada, Malayalam and Gujarati in any interface language. `AppText` already
uses this detector for system-font fallback, padding and line-height allowance.
`AppTextInput` now applies the same fallback after theme fonts, including typed
text, default values and placeholders. Refs, values, selection and editing/IME
handlers are forwarded unchanged. Latin custom faces remain available for text
they support. No font download or extra dependency was introduced.

A native 2x-font smoke check exposed clipping in the shared fixed-height chips.
Chip and ChipRow heights now grow together with the platform font scale; normal
font-scale geometry is retained. Long filter rows continue scrolling horizontally.
The shared Button also uses the existing React Compiler opt-out boundary after
native theme-switch checks reproduced disappearing cached labels; the same
light-to-dark check passes with label repainting enabled. These are targeted
compatibility adjustments, with no screen redesign.

## Widgets and local notifications

Existing Anywhere and Plan coordinators publish translated labels from the
selected in-app language. New Android `values-<language>` resources cover both
widget galleries and native fallback labels. The existing iOS widget plugin
collects the seven catalogs into the extension's `Localizable.xcstrings`.

Newly scheduled local reminders use the selected language. Existing notification
bodies keep their originally scheduled language under the current reconciliation
contract; switching the interface does not cancel or replace a user's reminder.
User-authored reminder bodies and task titles remain exact. OS-owned permission
prompts and widget-gallery labels follow the OS app language where supported;
the in-app override cannot change the language of OS-owned UI.

Both an isolated fresh prebuild and the existing ignored native projects were
verified for all 21 languages: iOS Info.plist, InfoPlist.strings/Xcode membership,
Android locale XML, manifest and Gradle resource configurations. Only language
resources/declarations were synchronized into the existing native projects.
A fresh release binary is still needed to ship these native resources.

## Changed-file inventory

- `app.json`: append seven languages to both native platform registries and native permission catalog paths.
- `src/localization/{runtime.ts,languages.json,plurals.ts,glossary.json,text-layout.ts}`: bundled registration, native names, plural fallbacks, terminology drafts and script recognition.
- `src/localization/locales/{ta,te,bn,mr,kn,ml,gu}.json`: seven complete catalogs; `hi.json`: nine targeted English-term repairs.
- `src/localization/native/{ta,te,bn,mr,kn,ml,gu}.json`: native permission descriptions.
- `src/constants/mascot-greetings/{ta,te,bn,mr,kn,ml,gu}.ts` and `index.ts`: offline greeting libraries and registration.
- `src/components/settings/language-picker.tsx`: pronunciation metadata on accessible radio rows; new options come from the registry.
- `src/components/ui/{app-text-input.tsx,controls.tsx}`: script-safe input font metrics, scaled chip height and compiler-safe themed button labels.
- `modules/chits-attachments/android/src/main/res/values-{ta,te,bn,mr,kn,ml,gu}/{anywhere_strings.xml,plan_strings.xml}`: fourteen native resource files.
- `tests/indian-localization.test.mjs`, `tests/localization-layout.test.mjs`: resolution, persistence precedence, bundled resources, plural fallback, intentional English, input forwarding and script regression checks.
- `tests/native/indian-localization{.fixture.tsx,-entry.js}`: standalone native smoke surface using only an in-memory settings database and note draft. This entry is never imported by the production router.
- `docs/localization-report.json`, `docs/indian-localization-review.json`, and this report: coverage, explicit English exceptions, results and remaining review gates.
- Ignored native files: added iOS `.lproj` resources/resource membership, locale lists, Android Gradle declarations and iOS widget string catalog.

## Validation and limitations

Recorded results are in `indian-localization-review.json`. `localization-report.json`
contains the full 21-language key/placeholder/plural audit.

- Localization tests: 44 passed; final combined localization/style-token tests: 51 passed.
- TypeScript and scoped ESLint: passed. Full lint has two existing warnings.
- Both final Hermes exports, both native locale verifications, Android aapt2 resource compilation and iOS widget string compilation: passed.
- Full suite: 732 passed, one unrelated header assertion failed.

Unchanged English
values in the new catalogs are explicitly limited to product names, PDF and
formatting-only composition templates. Intentional Latin terms include Chits,
NoteSpace, Chits Focus/Spin/Anywhere, platform/product names, SQLite, PDF, MB,
AM/PM and literal file paths/extensions such as Pictures/Chits and chitsbackup.
The regression check rejects other multi-letter Latin words; this heuristic is
not a substitute for linguistic review or a complete dynamic-UI audit.

Android emulator screenshots are under
`/tmp/chits-indian-localization/screenshots/android-<locale>-<light|dark>.png`.
They exercise the real shared AppText, AppTextInput, Button and Chip components,
selected onboarding/Plan/widget text and native names in an in-memory fixture.
They are a rendering smoke test, not screenshots of every production flow.
The iOS fixture rendered Tamil, but system dialogs prevented clean full iOS
visual acceptance. No Apple account settings were changed.

The QA entry must retain `"use no memo"` on its global-translator consumer, as
production screens already do. React Compiler otherwise caches `tr()` calls
across language switches. An initial stale-copy fixture was corrected and its
captures replaced; the production translator architecture was retained.

Node initialization/resource measurements compare the current 14-language
working-tree catalogs with the expanded 21-language catalogs. They do not
measure Hermes/mobile cold launch, memory, scrolling or keyboard latency.

The full repository test run includes one failing header-title source assertion
in `tests/settings-screen.test.mjs` against the already-modified shared header.
This task does not edit that header or its test. Full-repository diff checking
also reports an existing trailing blank line in `note-blocks-editor.tsx`; the
localization changes pass their scoped whitespace check.

## Required manual review before release

For **each of the eight Indian languages**, have a native speaker review all
catalog keys, native permission descriptions, plural phrases, glossary terms,
mascot lines, errors and accessibility labels in context. Pay particular
attention to board/card/column/space terminology, fragmented variable phrases,
Focus/Spin decisions, planning/wrap-up idioms and onboarding tone. No locale has
native-speaker approval from this task.

For **each language on fresh iOS and Android builds**, in light/dark and
Classic/Sticky, complete the following production-flow checks:

- Welcome, Getting Started, interactive tours and contextual mascot messages.
- Create/edit/reopen chat notes; board/column operations and drag instructions.
- All four Spaces, Connected Notes, Revisit, search, filters and archive.
- Plan My Day, evening reflection, Focus timers, Spin and calendar/reminders.
- Attachments, sharing, settings, native permission states and every error/empty/confirmation state.
- Manual selection versus System Default, first launch, force-stop/relaunch, airplane-mode language switching and unsupported-device English fallback.
- Small screens and maximum accessibility text, touch targets, wrapping, combined glyphs, VoiceOver/TalkBack pronunciation and focus order.
- Each native-script keyboard: unfinished composition, conversion/cursor movement, selection, deletion and saving/reopening Unicode text. Round-trip attachments/backup without changing user text.
- Installed Home Screen widgets, gallery labels, live language changes, privacy states, newly scheduled notifications and preservation of existing reminder times/text.

Signed IPA/AAB inspection, OS language-settings acceptance, real Home Screen
widgets, physical-device IME/accessibility, native-speaker review, release
startup performance and Store language display remain pending. No build was
uploaded, no store listing was changed and no release was published.

Implementation references: [Expo SDK 57 Localization](https://docs.expo.dev/versions/v57.0.0/sdk/localization/)
and [Expo SDK 57 Font](https://docs.expo.dev/versions/v57.0.0/sdk/font/).
