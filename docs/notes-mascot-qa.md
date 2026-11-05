# Notes hero verification

Checked 2026-11-04 in the Chits Expo SDK 57 checkout. Notes is the Cards view of
the existing `/` destination; Chat and Unorganized were not redesigned.

Notes now reuses Boards' illustrated header, filled header controls, mascot art,
rig, type and paper surfaces. Its contextual copy and speech reuse existing
translations. Write a note is beneath the hero copy and calls the existing
add-note sheet; the duplicate header plus and floating greeting were removed.
Boards retains its Create board action and board-specific speech.

The subsequent typography refinement replaced the old Kalam selections throughout
the shared desk UI with the heroes' font families: Fredoka SemiBold for headings
and labels, Nunito SemiBold for body copy. Spaces notes and their share canvas
use the same Nunito face. Existing font sizes, layout values, strings, script
fallbacks and saved data are retained. The legacy font-hook names remain for
caller compatibility. TypeScript, focused ESLint and 39 existing typography/theme
and welcome tests passed; the Pinned and Notes sections were checked on Android.

The hero is a FlashList header rather than a fixed panel or nested scroll view.
The filter row follows the header's measured height until it reaches the top,
then stays below the illustrated header. Section promotion and drag hit testing
continue to use FlashList's measured first-item offset, including the hero.
Drag-edge auto-scrolling also accounts for the visible portion of the hero.
The existing recycled note cells, sorting, filters, selection callbacks, hidden
content rendering and repository writes were retained. Focus/Spin and Getting
Started remain available in the footer, as in Boards.

Completed checks:

- TypeScript and focused ESLint on the changed production code and native fixture.
- 29 focused tests: hero bounds, sticky-section promotion with a scrolling header,
  note ordering (including filtered moves), board search and onboarding navigation.
- Localization audit after removing the temporary native route: 14 languages.
- Android actual empty Notes screen, plus a fixture with 200 in-memory notes.
- Scrolling clears the hero and pins the filters; the section title promotes into
  the illustrated header. Filtering selected 133 unorganized notes correctly.
- Custom ordering: dragging the first note to the second position changed the
  fixture's order and fired the arrange callback, without writing stored notes.
- Light/dark surfaces, contextual mascot tap reply, and 320dp with 130% text.
- On the actual empty Notes screen, Write a note opened the existing Create new
  sheet. The sheet was dismissed without entering or saving a note.

Local screenshots:

- [Actual empty Notes screen](/tmp/chits-notes-hero-empty.png)
- [200-note fixture, light](/tmp/chits-notes-grid-light-verified.png)
- [Scrolled hero and pinned filters](/tmp/chits-notes-hero-scrolled.png)
- [Filtered notes](/tmp/chits-notes-filtered.png)
- [Drag order changed in memory](/tmp/chits-notes-reordered-verified.png)
- [Dark](/tmp/chits-notes-dark-verified.png)
- [Contextual reply](/tmp/chits-notes-mascot-reply.png)
- [320dp with enlarged text](/tmp/chits-notes-320-large-text.png)
- [Existing add-note sheet opened from the hero](/tmp/chits-notes-write-sheet-verified.png)
- [Updated Pinned, Notes and note typography](/tmp/chits-workspace-fonts-verified.png)
- [Updated typography in dark mode](/tmp/chits-workspace-fonts-dark.png)

iOS, physical devices, screen-reader interaction, media-heavy stress testing and
measured frame-rate profiling remain untested. Native development startup warnings
already recorded in `boards-mascot-qa.md` were not part of this change.

Reproduce with `tests/native/notes-mascot.fixture.tsx` temporarily mounted at
`src/app/notes-mascot-qa.tsx`. Notes, theme settings and custom ordering are all in
memory. Parameters include `count=0`, `count=200`, `mode=dark` and `accent=rose`.
The temporary route was removed and the emulator's density and font scale were
restored after checking the layout. No real notes were created for fixture QA.
