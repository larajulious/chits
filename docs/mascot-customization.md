# Mascot customization

Implemented 2026-11-06. Open **Settings → Personalization → Your Chits Mascot → Change Mascot** (`/mascot`). Both Classic Chits and the limited-edition Chits Yong are free. There is no account, purchase, entitlement service, or expiration.

## Artwork and integration audit

The existing `assets/images/chits-mascot-animated.svg` is unchanged. `bandana-art.ts` defines one reusable red paisley accessory in the original body's coordinates. The supplied reference guides its broad, rounded fabric wrap, cream edging, larger paisley/floral motifs and small tucked side tie. It sits beneath the original yellow tape inside the SVG's tilted body group, and is reused by the split native artwork. Body, face, limbs, tape, expressions, animation state machine and rig retain their existing geometry and behavior.

All in-app source-image usages now go through these shared renderers:

| Renderer | Existing consumers |
| --- | --- |
| `ChitsPeekMascot` | Welcome, Getting Started hub and demos, Notes and Boards heroes, Plan My Day, Focus home, Spin, Revisit, space picker, Settings appearance preview |
| `ChitsMascot`, including the compatibility export `OnboardingMascot` | Setup, Notes greeting and organization suggestions, board/card/unorganized guides, empty states, completed subtasks, Settings costume preview and selection cards |
| `ChitsMascot still` | Focus companion during concentration and paper-desk messages |

Application icons, native splash artwork and the widget's application-icon branding remain application identity assets. They do not render the in-app companion.

## Persistence

`MascotProvider` owns one store per SQLite connection, under the existing reset/restore boundary. The existing `app_settings` table stores only `mascot_variant`; no schema migration or note/board/history changes are needed. The initial synchronous read avoids temporarily choosing the default while hydration runs. Missing, invalid or unavailable IDs render Classic without rewriting the saved value. IDs remain stable for future releases.

Selection publishes immediately and serializes writes. A failed save restores the last successfully persisted costume and the picker shows the existing localized save error. A later request cannot be overwritten by an earlier failure. The preference follows the existing whole-database backup/restore flow.

Decorative SVG renderers retain their local hop, sway, wave, blink and tape animations. Interactive previews and picker taps now use the shared native part rig described in [Mascot gestures and personality](mascot-gestures.md), including reduced-motion expression-only reactions. Focus's still companion stays still. No new dependency was added. UI copy is bundled in all 21 existing language catalogs; new translations require native-speaker review.

## Verification

- Expo v57 reference and versioned SVG, Reanimated and SQLite documentation reviewed before coding.
- TypeScript and focused ESLint passed, including the isolated native fixture.
- Localization audit passed: 21 bundled languages, 2,100 source keys.
- Seven new customization tests passed: actual SQLite close/reopen persistence; immediate broadcasts; notes and other settings unchanged; failed saves and retry; rapid choices; unknown IDs; original SVG byte preservation and shared integration.
- Mascot/Settings/onboarding/layout suites: 126 passed, one existing header assertion failed. That assertion also fails against a temporary copy of unchanged HEAD; `src/components/ui/primitives.tsx` was not modified.
- Focus/Plan/Spin suites: all 144 passed serially. An earlier parallel run during production bundling produced three transient SQLite fixture errors; those tests also pass against unchanged HEAD.
- Initial feature production exports completed for iOS and Android, with bundled SVG assets and Hermes bytecode in `/tmp/chits-mascot-export`. These predate the reference-based fabric revision.
- Android emulator: both choices, selected states, restored selection after force-stop/relaunch, Notes hero integration, 320dp width with 140% text, and reduced-motion artwork sampled with zero changed pixels. Density, font scale and animator duration restored to their previous values.
- iOS simulator: selection, persisted Chits Yong after terminate/relaunch, dark picker and an isolated in-memory light-theme fixture.
- Temporary `/mascot-qa` route removed; reusable fixture remains at `tests/native/mascot-customization.fixture.tsx`.
- Reference-based fabric revision: TypeScript, focused ESLint and all seven customization tests passed again. Updated iOS/Android animated cards and the Android native hero were visually checked; the shared costume now sits beneath the original tape in all three renderers.

Screenshots from this run:

- [Android selection](/tmp/chits-mascot-android-selected.png)
- [Android Settings preview](/tmp/chits-mascot-settings-preview.png)
- [Android Notes hero](/tmp/chits-mascot-notes-ong.png)
- [Android narrow display and enlarged text](/tmp/chits-mascot-320-ready.png)
- [iOS selection](/tmp/chits-mascot-ios-ong.png)
- [iOS light-theme fixture](/tmp/chits-mascot-ios-light.png)
- [Revised bandana, Android animated preview](/tmp/chits-bandana-reference-v1.png)
- [Revised bandana, iOS animated preview](/tmp/chits-bandana-reference-ios.png)
- [Revised bandana, Android native hero](/tmp/chits-bandana-reference-hero.png)

## Remaining acceptance boundaries

Physical-device and signed-release airplane-mode testing, VoiceOver/TalkBack interaction, tablet screenshots and measured frame-rate profiling were not performed. The 320dp enlarged-text screen follows the shared header's existing single-line ellipsis behavior; card copy wraps and remains scrollable.

During development, changing the root provider tree with hot refresh produced a native SQLite `getColumnNames` crash; cold relaunch recovered. Development startup also showed the existing state-update-before-mount and navigation deprecation warnings. Metro stopped during one restart attempt, requiring a running development server before the cold-start check could finish. These observations are not evidence of signed-release behavior.
