# Rich text editor

The shared native `NoteBlocksEditor` now edits optional titles, H1/H2 paragraphs,
bold, italic, underline, named text colors and highlights. The existing list,
checklist, image, attachment and history paths remain in use. The small Chat
capture input keeps its compact layout; its expanded editor exposes the title
and full formatting toolbar.

## Storage and compatibility

`messages.content_json` keeps its existing JSON block array. Text blocks accept
additive `heading`, `paragraph` and `spans` properties. Spans contain UTF-16
`start`/`end` offsets and named marks. Serialization validates/clamps ranges and
allows only the supported colors, highlights and marks. `paragraph: true`
retains authored boundaries when a heading returns to normal text.

The optional `title` is document metadata anchored on the first text block.
Structural edits relocate it to that block; it is never inserted into a block's
body text. `messages.text` remains the plain search/preview/copy projection,
including a nonempty title followed by body words. Consequently existing preview
fallbacks find the optional title first, or the note's meaningful body words.
Title-only notes are supported. Clearing both fields retains the host's existing
empty-note rules.

Legacy plain notes still use their original text field. There is no eager data
migration, extra database, network dependency or new editor package. Android
uses the native appearance bridge described below. Existing JSON readers accept the additive properties. Saved readers,
Chat drafts, templates, Focus, Card Details, Calendar/Space readers and Share Note
use the same document. Plain-string updates reject formatted documents rather
than silently flattening them. Backup/restore continues to copy the canonical
SQLite document and attachment files.

## Interaction

The inset formatting sheet resizes the editor above the existing keyboard-aware
toolbar. Opening it dismisses the keyboard; title and body inputs suppress the
soft keyboard until the sheet closes. Formatting retains the captured selection
without refocusing inputs. It keeps the note visible, uses 44-point targets,
supports reduced motion and reads the current light/dark theme. Swatch
rows and the paragraph/mark row scroll horizontally on narrow screens.

Range formatting updates only selected UTF-16 spans. At a collapsed caret,
explicit pending marks apply to subsequently typed characters. New text otherwise
inherits the preceding span; moving the caret clears explicit pending marks.
Native inputs own character deletion, selection, autocorrect and composition.
Attributed runs supply their text to the shared input's existing complex-script
font fallback, so formatting does not bypass its script-aware line heights.
Formatting controls capture the range before a press. Explicit range restoration
uses a temporary TextInput selection prop, released on native acknowledgement
or direct interaction with the body;
React Native 0.86 Fabric does not restore it with a view setNativeProps call.
The structural engine owns paragraph/list boundaries and preserves span offsets
when splitting, joining, pasting paragraphs or inserting images. Undo/redo
snapshots include title and rich metadata. Heading Enter returns to normal text.

New formatting labels have English defaults through i18next and accept future
reviewed `noteformatting.*` catalog translations. Existing catalogs are preserved.

## Verification and remaining native QA

`tests/note-rich-text.test.mjs` exercises metadata, overlapping formats, typing
marks, emoji/range replacement, paragraph styles, list conversion, images,
sanitation, undo/redo, export pagination and real SQLite save/reopen/Chat drafts.
Existing note, checklist, image, attachment, backup, Focus and sharing suites are
also run. Native-input harnesses retain their alignment and paste-binding checks.

Before release, exercise physical Android and iOS keyboards, predictive input and
CJK composition, dictation, hardware keyboards, selection handles, long notes,
large accessibility text, paste from other apps and every host's attachment flow.
The existing multi-input architecture still limits a single native selection to
one text block. Native text copy/paste preserves the words; arbitrary external
rich clipboard markup is not imported as a new document format.

## Validation on 2026-11-05

- TypeScript and focused ESLint checks pass.
- The focused editor/content run passes all 182 tests. The full run passes 768
  tests with one existing header source assertion failure (`every header title
  gets the paper tag, and only with a title`), outside the changed editor code.
- Android emulator: actual Chat/fullscreen flow verified optional title, selected
  word formatting, mixed colors/highlights, collapsed-caret typing, save/reopen,
  light/dark controls, H1/H2, Enter back to normal text, fast queued typing and
  undo/redo. Stored SQLite JSON was inspected after saves.
- The queued heading-Enter regression now has a pure production-engine test:
  `n`, `ne`, `nex`, `next` update one new paragraph. Late selection events cannot
  clear its pending marks while native focus is crossing the boundary.
- iOS JavaScript export succeeds. This is not an iOS device or signed build test.
- Physical keyboards, IME/accessibility matrices and iOS native acceptance remain
  pending. Native selection across separate blocks remains an existing limit.

Local review captures: `/tmp/chits-rich-final-light.png`,
`/tmp/chits-rich-final-dark.png`, `/tmp/chits-rich-heading-verified.png`.

## Bold/italic and viewport correction

Inline actions and opening the formatting panel now restore the captured range
without requesting a scroll to the start of its text block. Structural changes
retain their existing ability to reveal a new block. Restoring selection also
avoids refocusing an input that already owns native focus.

Chits registers a separate family for each bundled Nunito font file. Rich runs
now select the registered bold, italic or bold-italic face explicitly; ordinary
runs return to their base face. The added italic assets come from the existing
Nunito dependency. Saved marks and local note data are unchanged.

The native fixture `tests/native/note-inline-format-regression.fixture.tsx`
reuses the production fullscreen component with a 60-line document and performs
no database writes. Android verification covered bold-only, italic-only, both,
and switching both off at the end of that document. Captures are available at
`/tmp/chits-format-on.png`, `/tmp/chits-format-off.png`,
`/tmp/chits-format-bold-only.png` and `/tmp/chits-format-italic-only.png`.
The corresponding handler/font regressions execute in
`tests/note-formatting-regressions.test.mjs`. iOS device verification is pending.

Follow-up checks: TypeScript and ESLint pass; all 30 focused font/selection
regressions pass. The full run has 772 passes and the same unrelated header
source assertion failure. The temporary production QA route was removed.

## Continuous fullscreen writing surface

Fullscreen Chat, Add Note and Edit Note now use a continuous themed page with
no inset DeskPage panel, outer margins, rounded paper corners or shadow. Their
plain input fills the available viewport, including the blank area beneath short
notes. Compact composers and embedded Focus/template panels retain their layout.
Android checks covered the real blank Chat editor with keyboard open/closed and
the formatting sheet open. TypeScript and 23 existing input/composer checks pass.
Review capture: `/tmp/chits-fullscreen-no-keyboard.png`.

## Formatting sheet replaces the keyboard

Opening the shared formatting sheet dismisses the keyboard from either title or
body. All note inputs suppress the soft keyboard while the sheet is open, and
formatting restores ranges without requesting native focus. Closing or unmounting
the sheet restores normal keyboard availability. Tap the body after closing to
resume typing. Late selection events cannot overwrite a requested range.

TypeScript, focused ESLint and 25 editor/composer checks pass. Android emulator
checks verified dismissal from title/body, repeated bold/italic actions on a long
note's selected range, heading/list changes, body/title taps while open, and
resuming the keyboard after closing. The fixture reports bold and italic marks
without saving any notes. iOS native keyboard verification remains pending.
Capture: `/tmp/chits-formatting-keyboard-hidden.png`.

## Stable multiline native text during formatting

The attributed fallback keeps one Text root for both plain and formatted
content; newer Android builds use the native span projection described below. Applying the first color/highlight or clearing the last mark no longer
switches the native input between a value prop and attributed children. This is
a rendering stabilization; the exact reported device failure was not reproduced
before the change on API 33 or API 37 emulators, so Samsung-device acceptance
remains pending. No stored text, span offsets or serialization rules change.

The renderer regression exercises the actual BlockInput and noteTextSpans with
LF, CRLF, blank lines, trailing Enter and emoji, including formatting removal and
save/reopen. All 166 note checks, TypeScript and focused ESLint pass. Android
API 37 Add Note checks cover compact/fullscreen, native word selection,
color/highlight changes on the middle line, typing a third line and deletion
without joining neighboring lines. Screenshots:
`/tmp/chits-api37-add-after-fix.png`. The reusable no-write fixture is
`tests/native/note-line-break-regression.fixture.tsx` (mode=add for Add Note).

## Android native formatting and existing-note validation

Android builds with the updated ChitsFiles module keep a normal controlled
multiline TextInput. The document remains the canonical JSON block/span model;
`ChitsNoteFormatting` projects those spans onto the existing native Editable.
Formatting never calls setText, replaces a line separator, moves selection,
changes input type or removes composing/foreign spans. Explicit snapshots use
UTF-16 offsets, monotonic revisions and an exact text match. A TextWatcher waits
for Fabric's matching buffer instead of applying stale offsets or retry timers.
Owned spans and weak registrations are cleaned up with the input lifecycle.
The bridge uses the existing React Native/Expo module and bundled font faces;
there are no new npm dependencies or document migrations. iOS/older native
binaries retain the attributed fallback, so Android needs the rebuilt binary.

The formatter retains its range for the entire formatting session, including
late collapsed-selection events after keyboard dismissal. Direct body interaction
releases that range and cancels pending cursor/scroll requests. The sheet waits
for keyboardDidHide before opening, so its controls do not move during a press.
Native span formatting continues to use the existing undo/history and list/
heading/attachment paths. The title remains separate document metadata.

On 2026-11-05 the rebuilt app was installed on the connected Samsung Android.
The real database-backed Edit Note screen was exercised with separately saved
legacy plain text and structured heading/body notes, with native touch selection:
color, highlight, bold, italic, underline, blank lines, save, reopen, continued
Enter/typing and formatting/typing undo-redo all passed. Canonical saved JSON was
checked, not just screenshots. Test notes were isolated from original notes.
Synthetic review captures: `/tmp/chits-device-existing-fixed.png` and
`/tmp/chits-device-reopened-typing-fixed.png`.

Seven Android instrumented checks pass, including text/selection/composing-span
invariance, native rendered line count, stale/malformed requests, queued typing,
bold/italic, clipboard round trip with newlines/emoji, and existing native paste/
boundary-Backspace bindings. The focused note run passes 213 tests; TypeScript
and focused lint pass. The broad run has 823 passes and the existing unrelated
header source assertion failure. iOS physical keyboard/IME acceptance and
cross-block native selection remain separate limitations. Temporary QA routes
are removed; reusable fixtures live under tests/native.

Physical before/after checks confirm all 19 original message records and all 8
attachment records are unchanged, with SQLite integrity ok. Both phone QA notes
and the baseline emulator QA note were removed. The temporary production QA
route was removed; no original notes were edited during validation.

## Coordinated typing/formatting panels

`note-editor-panels.ts` is the shared coordinator for the note editor and toolbar.
Aa retains selection, suppresses the input keyboard and waits for keyboardDidHide
before opening formatting. Applying a format keeps that panel open. Done/Aa and
completed body/title touch gestures close it, then resume the keyboard only when
the closing animation finishes. Gesture cancellation leaves the panel alone;
the content stays still while native text selection handles are being moved.
Pending typing marks, native selection and the existing text/history engine stay
in use. No stored document or persistence behavior changes.

Android Back chooses an idle target and cancels pending keyboard requests. Modal
hosts forward onRequestClose to their editor before exiting, including Chat and
Add Note/template editing. Native keyboard show/cancel requests are revisioned;
they use ReactEditText's managed focus path and do not blur or replace selection.
Only the owner of a focused input handles global keyboard-show events, so a
background editor cannot dismiss another screen's keyboard. Rapid toggles,
interrupted animations, unmounting and development effect replay are covered.

Validation for the coordinated panel flow: the rebuilt Android app was installed
on the connected Samsung phone. Real Edit Note checks verified Done/Aa returns,
selection of a different section while formatting, pending bold/color marks on
subsequent typing, title focus, Back and unchanged line separators after save.
Production Chat and Add Note modal components also passed Back handling, compact
and fullscreen returns, and long-press selection followed by replacement typing.
Test automation waits for keyboard animation completion after touch release.
The eight native checks pass, as do 241 focused note/composer checks, TypeScript
and focused ESLint. All 19 original message and 8 attachment records were compared
after cleanup and remained unchanged, with SQLite integrity ok. Both temporary
panel QA routes and all owned test notes were removed. iOS device interaction
validation remains pending. Capture: `/tmp/chits-panels-add-fullscreen.png`.

The coordinator also tracks queued keyboard opening, so Back can cancel a return
to typing before keyboardDidShow. Unmounting an input invalidates native IME work.
iOS JavaScript export passes; this is separate from iOS device acceptance.

Final broad run: 840 passes out of 841 tests. The remaining failure is the
pre-existing header-title source assertion (`every header title gets the paper
tag, and only with a title`), outside the editor changes. Final iOS JavaScript
export: `/tmp/chits-editor-panels-ios-final`.
