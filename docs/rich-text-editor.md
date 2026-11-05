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
migration, extra database, network dependency, new editor package or native code
change. Existing JSON readers accept the additive properties. Saved readers,
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

Body inputs now keep one attributed Text root for both plain and formatted
content. Applying the first color/highlight or clearing the last mark no longer
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
