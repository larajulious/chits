# Compact Boards mascot verification

Checked 2026-11-04. Existing local changes were retained.

The listing reuses Getting Started's `ChitsPeekMascot`, artwork, speech bubble,
fonts, paper surfaces and rig. Compact mode has a 260ms peek, 420ms single wave
and 320ms settle. Blinks and small head movements replace the breathing loop.
Entrance flags and the first-row reveal history live in memory for this launch.
No schema, repository, board action or stored preference was changed.

The revised hero is normally 164–191dp. Enlarged or translated copy can make it
taller. The character stays at least 225dp across its full artwork canvas; both
eyes and the top tape remain visible, while the body's far edge extends beyond
the screen. Speech stays inside the mascot's column. Boards no longer draws the
decorative paper-edge overlay below the illustrated room header.

The list uses FlatList virtualization. Unorganized, Your boards and the existing
board cards follow the hero. Existing Focus/Spin and Getting Started controls
remain available in the list footer. Cards mode keeps those controls above its
content. Default view selection and navigation handlers are retained.

Board rows now reuse Getting Started's PaperCard component, theme-selected 12dp
corners, 38dp inset icon tiles, paper shadows and press feedback. Rows are level,
at least 72dp tall, with 12dp gaps. Board colors, names, tape, icons
and both counts are retained; the former tilted back-sheet stack was removed.
The Unorganized feature card follows Getting Started's yellow replay card and fonts.
TypeScript and focused ESLint passed after this refinement. Android light/dark
fixture screenshots and the board callback probe were checked again.

Create board now sits below the title and supporting message in the hero's text
column, using the existing themed Button and onCreate callback. The duplicate
empty-state button was removed. Hero measurement includes the action so enlarged
or translated labels can grow without overlapping Chits or the board controls.

The listing header now uses the board-columns screen's filled 46dp icon-button
treatment: palette-aware surfaces and ink, circular Classic buttons, Sticky tiles,
and dim/scale press feedback (no scale under reduced motion). Boards keeps its
centered title; Cards allocates its two leading and three trailing controls
separately to leave more room for the title. The decorative paper-edge strip is
disabled in both listing views. Existing menu, mode, sort, search and add-note
callbacks are retained. Notes subsequently gained its own hero action and now
uses two controls on each side with no header plus; see `notes-mascot-qa.md`. TypeScript,
focused ESLint and Android screenshots of both views were checked.

## Completed

- `npx tsc --noEmit`
- ESLint on changed production TypeScript and the native fixture: no warnings.
- `node scripts/check-localization.mjs`: all 14 languages pass.
- 63 tests: compact geometry, existing mascot/onboarding behavior and navigation,
  board search and default-column creation.
- Scoped `git diff --check`: passed. The whole checkout has an unrelated existing
  blank-line warning in `src/components/notes/note-blocks-editor.tsx`.
- Android emulator: actual empty listing; fixture containing 500 in-memory boards;
  light/dark surfaces; rose accent on a board without its own accent; card callback
  and return; scrolling; tap replies and automatic dismissal.
- Android at 320dp and 140% text: complete hero copy remains readable; hero grows.
- Reduced motion: sampled hero frames a second apart had zero changed pixels;
  a tap still displayed a reply and dismissed it after the reading interval.

Screenshots from this local run:

- [Light, 500 boards](/tmp/chits-boards-500-light.png)
- [Dark, rose accent](/tmp/chits-boards-dark-verified.png)
- [Compact reply](/tmp/chits-boards-bubble-verified.png)
- [320dp with enlarged text](/tmp/chits-boards-320-text-verified.png)
- [Reduced-motion reply](/tmp/chits-reduced-reply-final.png)
- [Reply dismissed](/tmp/chits-reduced-dismiss-final.png)
- [Revised framing and removed header strip](/tmp/chits-hero-framing-after.png)
- [Getting Started card reference](/tmp/chits-getting-started-card-reference.png)
- [Rounded board cards, light](/tmp/chits-board-cards-rounded-light.png)
- [Rounded board cards, dark](/tmp/chits-board-cards-rounded-dark.png)
- [Create board under the hero copy](/tmp/chits-hero-action-visible.png)
- [Empty listing with the hero action](/tmp/chits-hero-action-empty-board.png)
- [Filled header buttons, Boards](/tmp/chits-header-buttons-updated.png)
- [Filled header buttons, Cards](/tmp/chits-header-filled-cards.png)

## Boundaries

iOS, physical devices, screen-reader interaction and measured frame-rate profiling
were not tested. Tablet geometry is covered by tests, not native screenshots.
The fixture's board callback probe does not exercise a real persisted workspace.

The existing board navigation fade is retained. Reanimated 4's shared-element
transitions remain experimental and list a tab-navigator limitation:
https://docs.swmansion.com/react-native-reanimated/docs/shared-element-transitions/overview/

Native development startup emitted a React state-update-before-mount warning and
`getId` deprecation warnings on Cards, before Boards was opened. Hot refreshing
while removing the temporary route also emitted SQLite closed-resource warnings.
These were observed, not resolved or established as regressions by this work.

`tests/native/boards-mascot.fixture.tsx` can temporarily be mounted at
`src/app/boards-mascot-qa.tsx`. Its board data and theme database are in memory;
parameters include `count=0`, `mode=dark` and `accent=rose`. Remove the temporary
route after testing. Changing emulator density can recreate the activity; relaunch
after configuration changes. The temporary route was removed and emulator density,
font scale, night mode and animator-duration settings were restored after this run.
