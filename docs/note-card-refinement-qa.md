# Notes cards aligned with Chits

The cards follow the original Chits direction: warm cream for unfiled notes,
existing board pastels for filed notes, kraft for hidden notes, shared workspace
Fredoka titles/Nunito text, rounded note-card token corners and soft desk shadows.
Compact category/date/menu metadata has no divider. The inline pin indicator
preserves pin state without covering content. The separate cut-out fold is
removed, so the card is one continuous rounded paper surface.

The image inset correction remains: an explicitly sized 4:3 media frame inside
a wrapper with equal 8-point horizontal padding. Content selection, menus,
subtasks, arrangement and persistence remain on their existing handlers.
`cards-collection.native.tsx` no longer needs to pass a corner-cutout color.

TypeScript, focused ESLint and `git diff --check` passed. No full build or
unrelated suite. Android inspected colored, unfiled, pinned and hidden fixture
cards in light appearance and actual Notes text/checklist cards in dark.
Evidence: `/tmp/chits-original-style-light.png`,
`/tmp/chits-original-style-final.png`. Prior sticky-sheet previews are superseded.
The temporary fixture route was removed after review. No stored notes changed.

iOS and the full media/large-text/accessibility matrix remain manual checks:
1. Check photo/video insets, long names, media/link counts and hidden content.
2. Open/menu/long-press a note, toggle a card subtask, and arrange/drop a note.
3. Pull to refresh and change filters; compare the cards with the surrounding
   Chits header, controls and paper surfaces in both appearances.

## Held-card tilt

The existing spring lift now rotates the dragged overlay to -4 degrees (was
-1.5), retaining its 4% scale lift. Idle and dropped cards remain flat.
Reduced-motion mode translates the dragged card without tilt or scale. Drag
activation, sorting, autoscroll and commit/cancel handlers are unchanged.

TypeScript, focused ESLint and whitespace checks passed. Android My order
fixture checked holding/moving within a note and flat appearance after drop:
`/tmp/chits-card-held-tilt.png`, `/tmp/chits-card-dropped-flat.png`. No stored
order changed. Manual: hold/drag/release in My order, cancel a drag, and repeat
with reduced motion on iOS/Android. No full build was run.
