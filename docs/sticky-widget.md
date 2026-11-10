# Sticky Notes widget

A Space on the Home Screen: each widget shows the Fridge, Desk, Cork board or Wall the user picked, with that Space's notes stuck where the user put them. Small, medium and large on iOS; freely resizable on Android. Built for Expo SDK 57 (`expo-widgets` 57.0.27, `@expo/ui` 57.0.26) after checking https://docs.expo.dev/versions/v57.0.0/sdk/widgets/.

The first version (2026-11-10, same day) put a single chosen note on the Home Screen. The user asked for a Space with its notes instead, so the widget was reworked; there is no single-note widget.

## How it fits together

- **Data.** `src/features/sticky-widget/data.ts` lists every live note on every Space through `createSpaceRepository().list()`, the query the board itself draws from, back to front as the board stacks them. So the widget can never disagree with the board about which notes are up, where, how they're tilted, their paper, color or media, or whether they're hidden. One more query reads the words of each live thought on those notes.
- **Snapshot.** `snapshot.ts` makes one entry per Space: its name and pin style, the board's own empty-Space words, a link that opens it, and its notes. Each note carries its stored position (`x`, `y`: fractions of the room a sticky can move in) and tilt. Its look comes from the Spaces definitions: `paperColor()`, `PAPER_INK`, `magnetColor(noteSeed(placement id))`, paper style, and PinDecoration's tape lean. Words become lines that keep their structure (titles and headings, `☐`/`☑` checklist items, bullets and numbers), bounded to 10 lines and 240 characters.
- **Placement: the board in miniature.** A note's stored `x`/`y` are fractions of the room on the board the user arranged it on, and that board is portrait: the screen less the Spaces header and dock. The Spaces screen records the size it measures (`space_board_size` in `app_settings`, via `rememberSpaceBoard` in `board-size.ts`; the only change to Spaces, and invisible). The snapshot turns each note back into its spot on that board with the board's own `fromUnit`. Before Spaces has been opened, the coordinator estimates the board from the screen the same way. Each widget draws all of a Space's notes (up to its 12) at those spots, scaled by one factor. Spacing, overlaps, stacking and left/right/up/down therefore stay exactly as arranged. The arrangement, with the board's room for pins and shadows, is fitted to the widget and centered, never drawn larger than on the board. `widgetLayout()` is the shared math: the iOS layout and the Android renderer repeat it, and tests check both against it.
  - The first rework spread the fractions over each widget's own shape, with a fixed note size and only the front 4 or 6 notes. The user reported the arrangement did not match the board, which led to this miniature rule.
  - Trade-off: notes spread over the whole board come out small on a small or medium widget, because keeping the arrangement exact means one scale for everything.
- **Publishing.** `StickyWidgetCoordinator` (mounted in `src/app/_layout.tsx` beside the Anywhere and Plan coordinators) republishes on any change to `messages`, `cards`, `boards`, `card_messages`, `attachments` or `space_placements`, on Spaces changes (sticking, moving, dragging, recoloring), and on foreground/background. It waits for explicit transactions to settle, never publishes rolled-back data, skips identical snapshots and never logs note text.
- **Taps.** `chits:///sticky?space=<id>` saves that Space as the one Spaces opens on, then opens Spaces; the board rereads the saved Space when it comes back into view. `chits:///sticky?kind=…&id=…` opens a note, rechecked on every tap. A thought opens in the existing editor, and a card goes through the existing `cardNoteRoute`. A note hidden in Chat goes through Chits' own reveal (Card Details, or Chat for a thought). A note deleted since the widget last drew shows "This note is no longer available." while the widget catches up.

## iOS

- `src/features/sticky-widget/widget.tsx` is an `expo-widgets` layout (`ChitsSticky`). The tile is the Space's surface, drawn as `SpaceSurface` draws it: the brushed fridge door with its seam and handle, the wood desk with its grain and vignette, the framed cork with speckles and the frame's shadow, the sage wall with its soft light. The notes sit on top at their stored positions and tilts, each with its pin: magnet, clear tape, pushpin or washi tape. Each note is drawn as the board draws it: sticky paper with its curl, the ruled index card, the receipt with its torn edge, photo prints with their picture, voice notes as cassettes, and hidden notes covered. Words are in Nunito, Space Mono for tape times.
- iOS doesn't tell a widget its size, so the notes are laid out on a canvas the size of each family on the smallest iOS 17 iPhone (148 pt, 321×148, 321×324), centered; the surface fills the rest of the tile.
- The surface fills the tile; the notes keep the board's arrangement and are not stretched to the tile's shape.
- Taps: a small widget has one tap target (the Space). On medium and large widgets each note is its own link, and the rest of the tile opens the Space.
- **Choosing a Space.** `app.json` declares an `ios.configuration` with a `space` choice (Fridge by default), which makes expo-widgets build an `AppIntentConfiguration` widget (iOS 17+): touch and hold → Edit Widget → Space. `plugins/with-chits-sticky.js` swaps the generated Swift for `plugins/chits-sticky/ChitsSticky.swift`: the same choice as an `AppEnum`, plus a fallback for a widget added before the app's first launch. The plugin also bundles Nunito SemiBold/ExtraBold and Space Mono Bold into the extension (`UIAppFonts` and the Resources phase, verified on the widget target only). `with-chits-anywhere.js` adds the widget's name, description, Edit Widget title and the four Space names to the extension's string catalog in all 21 languages.
- **Engine constraints (important).** The `'widget'` function ships as a source string inside a template literal whose escapes are read a second time. A backslash anywhere in the layout breaks it, and only on a device: `'\n'` becomes a raw newline and the layout fails to evaluate. The layout builds such characters with `String.fromCharCode`. Nested `<Text>` runs are dropped by that engine, so a note's words are one Markdown `Text`: bold titles, struck-through ticks, user text escaped. A zero-width space in front keeps a note that reads exactly like a catalog string ("Desk") from being translated. `tests/sticky-widget.test.mjs` compiles the layout with `babel-preset-expo` and evaluates it the way the engine does, at every size and for every Space, so these break in tests rather than on a phone.
- **No nulls in widget props (important).** `expo-widgets` stores props in `UserDefaults`, which accepts only property lists. A JS `null` reaches it as `NSNull`, and the write fails: a test binary on macOS aborted on it. The publish then fails silently, and the widget keeps drawing a bare Space from its "not yet published" fallback. The first iOS install showed exactly that: no notes. `publish.ios.ts` sends `withoutNulls(snapshot)`, and a test checks that what iOS stores holds only strings, finite numbers, booleans, arrays and objects. In development the coordinator now logs the error's type (never note text) when a publish fails.
- **SwiftUI layout rules (important).** `frame(width:height:)` centers its content unless given `alignment`. So every `ZStack(alignment: topLeading)` that places notes by `offset` pins its frame `topLeading` too; without that, every note was shifted toward the middle (the first iOS build rendered this way). `padding` goes inside a fixed `frame`, never after it, or the view grows by the padding. Only finite numbers may reach a modifier, even from an older snapshot. The layout test checks all three on every Space, size and snapshot shape.
- iOS 17 or later only (Edit Widget needs App Intents). Chits supports 16.4; on iOS 16 the widget is not in the gallery and nothing is published.
- Photo prints use a 640-pixel JPEG copy in the App Group container (`sticky-<attachment>.jpg`), made once and removed when no print uses it. Original attachment paths never enter the snapshot.

## Android

- `ChitsStickyProvider` (local `chits-attachments` module) keeps the snapshot in `chits_sticky` SharedPreferences and each widget's Space as `widget_<id>`. Entries are removed on delete and carried over on restore.
- `ChitsStickyRenderer.drawSpace` draws the Space into the launcher's rounded corners: the same surface, then the front notes at their stored positions and tilts with shadows and pins. All measurements are the board's, in board units. The bitmap is redrawn for each widget size (resize), capped at 960 px on its long side. Default size is 4×2.
- Taps: the widget opens its Space. On Android 12+ each note also gets an invisible tap target over its footprint (`sticky_hit_0`–`11`, front notes on top) that opens the note. TalkBack reads the Space and each note's first line, or "Hidden Chit".
- `ChitsStickyConfigureActivity` picks the Space when a widget is added, and on Android 12's reconfigure. It shows the four Spaces, each drawn exactly as the widget will draw it, in Spaces' dark ink interface. It reads only the published snapshot, so it works offline without starting the app.
- `ChitsAnywhere.updateStickySnapshot` is the bridge (`publish.android.ts`). No new permissions, no network, and no periodic updates (`updatePeriodMillis="0"`): widgets redraw when the app publishes or the launcher asks.

## Privacy

- **Hidden in Chat** notes are always covered on both platforms ("Hidden Chit"). Their words, captions and pictures never enter the snapshot (tested).
- **Choosing a Space counts as consent.** Settings → Widget privacy (titles off by default) governs widgets that list recent notes on their own (Chits Anywhere, Today's Plan). A Sticky Notes widget shows only the Space the user put on the Home Screen, so it does not read that setting. Reverse this in the coordinator if that setting should hide sticky words too.
- iOS marks note content `privacySensitive`, so it is redacted where iOS redacts widgets on a locked device.
- Chits has no app lock today, so there is none to respect. If one is added, publish no words (empty `lines`) while locked.
- What is shared: words of Space notes (bounded), their look and placement, and small copies of printed photos, in the app's own App Group container (iOS) or app-private storage (Android).

## Building

Android: nothing to regenerate. The provider, picker and resources live in the local module, so the next app build includes them.

iOS: `ios/` is generated and gitignored. On 2026-11-10 the widget was added to the existing `ios/` by hand instead of by prebuild, so Pods and hand edits were kept: `ChitsSticky.swift` and the three fonts in `ios/ExpoWidgetsTarget/`, `ChitsSticky()` behind `if #available(iOS 17.0, *)` in its `index.swift`, `UIAppFonts` in its `Info.plist`, the ten new strings in its `Localizable.xcstrings`, and the Swift file (Sources) and fonts (Resources) registered with the `ExpoWidgetsTarget` target in `project.pbxproj`. The extension's Swift was type-checked against the built ExpoWidgets, ExpoUI and ExpoModulesCore modules with no errors. Rebuild in Xcode to get the widget. A later prebuild reproduces all of this from `app.json` and the plugins, but prebuild wipes `ios/` and its hand edits even without `--clean`. Prebuild wipes `ios/` and its hand edits even without `--clean`. When a prebuild is needed, back up `ios/` first, then:

```sh
npx expo prebuild --platform ios --no-install
cd ios && pod install
```

Then restore the usual hand edits: the Podfile `post_install` deployment-target block, `.xcode.env.local` and `Podfile.lock` (restore the lock before `pod install`), the widget target's `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` and `TARGETED_DEVICE_FAMILY` (iPhone only), and `RCTNewArchEnabled` in both Info.plists. A new native binary is required; an OTA update cannot add a widget kind.

## Validation done (2026-11-10)

- `npx tsc --noEmit` and ESLint on all new and changed files: clean.
- `tests/sticky-widget.test.mjs`, 9 tests on a real SQLite fixture:
  - every Space published with its pin, link and empty words;
  - a pink "Buy groceries" sticky on the Fridge keeps its color, spot, tilt and stacking order;
  - moving a note takes it to the other Space's widget; edits, deletes and archives follow;
  - hidden notes leak nothing;
  - card titles, checklists, numbering and headings;
  - bounds, and photo paths kept out of the snapshot;
  - the miniature keeps every gap between notes at one scale, centered, never enlarged;
  - the iOS layout goes through the real Babel transform for every Space and size, with tap links and capacities checked.
- Localization audit: no `stickyWidget.*` issues in any of the 21 languages. (It currently fails on `noteMedia.*`, `notesPull.*` and `reminderTimePicker.*`, which belong to other in-progress work.)
- Swift: `ChitsSticky.swift` type-checks against the iPhoneOS 27.2 SDK at the 16.4 deployment target, in Swift 5 and Swift 6 modes, with stubs that mirror ExpoWidgets' public API.
- iOS prebuild into a scratch copy (not `ios/`): the replaced Swift is behind `if #available(iOS 17.0, *)`. Fonts, `UIAppFonts`, the Resources phase (widget target only) and the 21-language catalog entries are in place.
- Android: a Gradle build of the module and its test APK (`:chits-attachments:assembleDebugAndroidTest`) passed with no warnings in the new code.

## Not yet verified

- **Nothing has run on a device or simulator.** `ChitsStickyTest` (androidTest) draws fixture Spaces at three sizes and checks note bounds and arrangement. It also inflates both layouts and screenshots the picker. It could not be installed: the running emulator (`Pixel_7`) was below Android's low-storage reserve (about 310 MB free). The other emulator image and the user's phone were not used without asking. After freeing emulator space, run it with `ANDROID_SERIAL=<device> ./gradlew :chits-attachments:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=expo.modules.chitsattachments.ChitsStickyTest`. To keep the PNGs (written to the test app's cache, `sticky/`), install and run it with `adb shell am instrument` instead, pull with `run-as`, then uninstall.
- No signed iOS build; the extension has not been compiled with the real ExpoWidgets pods.

### Manual checklist (both platforms)

- [ ] Add small, medium and large widgets, one per Space. Compare each with the Space in Chits: surface, note positions, tilts, colors, paper styles, pins, words. Android: resize, portrait and landscape.
- [ ] Edit, recolor, drag, add and remove notes in Chits; every widget showing that Space updates without a refresh. Move a note to another Space: it leaves one widget and appears on the other.
- [ ] Arrange notes on each Space (spread out, clustered, overlapping, a full 12), then compare each widget size with the board: same arrangement, smaller. Rotate or use another device: arrange again and the widgets follow the newly measured board.
- [ ] Tap a note (iOS medium/large, Android 12+): it opens in the editor, hidden notes through the reveal. Tap the surface (and any small iOS widget): that Space opens in Chits. Try from a terminated, background and open app.
- [ ] Empty Space: the board's "Nothing here yet" slip.
- [ ] Offline, reboot, backup restore, reinstall; Arabic (RTL), German, Japanese, Hindi; large text sizes.
- [ ] iOS: Edit Widget offers Fridge, Desk, Cork board and Wall in the app's language. iOS 16 device: widget absent, app unaffected.
