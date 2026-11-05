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
