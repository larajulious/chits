# Notes board verification

Checked 2026-11-05 on the Chits Expo SDK 57 checkout: Android emulator (Pixel, API
36, software GPU) and the iOS 26.5 simulator. The board replaces the masonry grid in
the Cards view of `/`. The header's grid icon switches back to the grid, saved as
`notes_layout`, and screen readers always get it (see below).

## How it works

- **Camera.** `x`, `y`, `zoom` shared values on one transformed world layer
  (`use-canvas-camera.ts`). Panning and zooming never touch React.
- **Culling.** A UI-thread reaction (`canvasRangeKey`) tells JS only when the camera
  crosses a 320pt grid cell. JS then mounts the notes in those cells.
- **Gestures.** One detector on the viewport (`use-canvas-gestures.ts`), not one per
  note, because notes unmount as the camera moves. Notes are plain Pressables below it.
- **Sizes.** Computed from content (`canvasCardFrame`), so culling, Fit All and the
  map need no measuring. That is why width and height aren't stored.
- **Storage.** `note_canvas_positions` (migration 34, in backups) keyed by note key
  with no foreign keys; the view, per filter, in `app_settings.notes_canvas_view`.
  Nothing writes to a note's own tables except the existing checklist and subtask calls.

## Things that look wrong but are deliberate

- Fit All and pinch go below 0.5x only when the board needs it (`floorZoom`, down to
  0.1x). Below 0.42x notes draw as plain paper (`LiteCard`).
- Panning stops when the board's far edge reaches mid-screen (`panLimits`), so a fling
  can't lose the board. Dropping a note further out widens it.
- The world is a real 80,000pt view, not unbounded: Android delivers touches only
  inside a view's bounds.
- `fly()` reports settled from its own `flight` value. An axis already at its target
  finishes on frame one, which saved the wrong view when two filters shared a zoom.
- The mini-map draws one Path per color. One native node per note made a 2,000-note
  commit long enough to race the hero's Reveal animation, which reverted to opacity 0.
- A held tick box stays a tick box: `onInlineTouch` arms it, and `onPick` won't lift.
- Notes are drawn as stickers: a white edge (`STICKER_EDGE`) and a dashed stitch inside
  the paper. The edge is a plain View outside the card's frame, so sizes, culling and
  layout don't count it, and the found ring clears it. Keep it to plain Views: a try with
  two SVG layers per note made panning lag.
  The grid uses the same sticker (`StickerStitch`, `STICKER_EDGE` in `card-list-row`), with
  the edge inside its cell so the gaps stay put, and the same paper as the board (`notePaper`): the board's chosen color, else one pastel
  per board, and cream for unorganized notes.
- **Full screen** (top-left button) hides the app header, hero, filters and the Getting
  Started dock; only that button or Android Back leaves it, as the header's switches go with
  it. A resize shifts the camera by half the change, so the middle of the view stays put.

## Validation

| Spec item | Result |
| --- | --- |
| Existing notes migration | Real install upgraded 33 to 34, notes byte-identical (test + device) |
| Saved spots never overwritten | Test: `savePlacements` leaves a saved spot alone |
| Pinch focal point | Device: word under the fingers stayed put; test to 1e-9 |
| Dragging at zoom | Device at ~0.5x and ~1.4x: note lands under the finger, others stay |
| Edge auto-pan | Device: board slides under a note held at the edge |
| Viewport restoration | Device: filter round trip, cold start after force stop |
| Category switching | Device: per-filter views kept and stored separately |
| Search focus | Device: Show on board flies to the note, rings it, position unchanged |
| Inline checklist | Device: quick tap and 0.8s hold each tick once, and persist |
| Tap, hold still | Device: tap opens the editor; hold still opens the actions sheet |
| Empty board | Device: existing quiet state, no controls |
| New note | Device: lands near the view, covers nothing, saved |
| Large collections | Device at 300 and 2,000 notes; see below |
| Screen readers | Device: TalkBack on shows the list and the order button |

React commits for the same six pan strokes (about 320 frames): 20 at 300 notes, 21 at
2,000, of which about 5 are idle mascot ticks. Memory: 690 MB at 3 notes, 788 MB at
2,000, in a debug build.

## Not verified

- **iOS gestures.** The board rendered on the simulator with a real photo note, but a
  system dialog blocked the screen and nothing here can script touch on iOS.
- **Frame rate.** The emulator ran on the software GPU, so no FPS figures are quoted.
  Measure with `-gpu host` or on a mid-range phone.
- **RTL.** Written for it (`PHYSICAL_LEFT`), not run in Arabic.
- **Text sharpness at 2x on iOS.** Layers may not re-rasterize under a parent's scale.

`tests/native/notes-canvas.fixture.tsx` is the QA board: re-export it from
`src/app/notes-canvas-qa.tsx` temporarily, then open
`chits://notes-canvas-qa?count=2000`. Its Profiler logs `[qa] commits`. The emulator's
log buffer is 256 KB, so stream `logcat -s ReactNativeJS` to a file. Pinch needs the
emulator console (`event send`, with `ABS_MT_PRESSURE` and `BTN_TOUCH`): `sendevent`
is denied without root.

## Decorations (scrapbook pieces)

**Decorate** (the sparkle button beside Full screen) opens the tray: stickers, washi tape, doodles,
labels & stamps, all drawn in code (`canvas-decor-art.ts`) and rendered with SvgXml.

- **Storage.** One `app_settings` row per filter, `notes_canvas_decor.<filter>`, so
  backups carry it and no migration was needed. `parseDecor` drops anything malformed or
  from a newer set rather than throwing. A deleted board's row is left behind (harmless).
- **Drawing.** Pieces sit in the world layer, behind or in front of the notes, and are
  drawn once; the camera moves them. Not culled: a filter holds at most `MAX_DECOR` (120).
- **Editing.** While decorating, `DecorEditor` covers the board and takes every touch, so
  the board's own gesture code is untouched and notes can't be opened or lifted by
  accident. The selected piece is drawn in screen space from UI-thread values and its
  board copy hides; React hears only when a touch ends. Panning reaches every piece
  (`decorBounds` widens the extent); Fit All and the map still frame notes only.
- **Not verified:** iOS gestures, dark mode, RTL, two-finger rotate on a real device,
  frame rate with 100+ pieces. `tests/canvas-decor.test.mjs` covers parsing, hit testing
  and bounds.
