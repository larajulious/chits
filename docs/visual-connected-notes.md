# Visual Connected Notes

The infinite Notes canvas reads the existing `note_relationships` through the Revisit repository. Its canonical, undirected pairs and relationship types are preserved. New links use `link`; removal uses `unlink`. No second relationship store, note-content changes, dependencies, or database migration are introduced.

## Controls

- Tap a linked paper once to select it and reveal its direct connections; tap it again to open it. Unlinked papers keep their existing open action. Search selects the found note and brings it into view without arranging it.
- The selected note survives switching between masonry and canvas in the same listing/filter. It is session state, so switching layouts does not unexpectedly hide links in Selected only mode.
- The note's canvas menu offers Connect Note, Focus Connections, Arrange Connected Notes, and Manage Connections. More Note Actions opens the existing note actions unchanged.
- Connect Note highlights the source. Tap another paper, or use the searchable picker to find a note outside the viewport/filter. Existing pairs and self-links are rejected; their relationship types and paper positions are not changed. Cancel closes the mode. Android Back also cancels the canvas interaction before leaving the screen.
- The compact connection button switches between Selected only (default), Show all, and Hidden. This preference uses the existing canvas setting. Category filters only affect drawing; they do not unlink notes.
- Focus Connections fits the selected note and its visible direct neighbors. Exit restores the previous camera. Filtering leaves focus and switches to the filter's own camera.
- Tap a curve to open endpoint navigation and Unlink Notes. Pan gestures take precedence; Manage Connections offers the same unlink operation through an accessible note menu. Unlink requires confirmation and leaves both notes intact.

## Placement and persistence

Initial placement waits for both saved positions and existing pairs. Failed reads never become an empty-position fallback. Missing positions are generated deterministically using connected components, degree-based stable anchors, breadth-first radial levels, rotated paper bounds, and a spatial collision index. Existing positions remain fixed obstacles. Unlinked notes and separate groups receive their own space. Generated positions are saved with `INSERT OR IGNORE` and read back before publishing them.

Canvas bootstrap and relationship reads retry SQLite contention up to three times, with short bounded backoff. Other errors are reported without repeated queries. Refreshes retain the last successful graph, discard older responses, and cancel publishing after unmount or focus cleanup. This handles a layout switch overlapping its final settings write without treating a failed read as an empty graph.

Arrange moves only the selected note's connected component, keeps that anchor fixed, preserves z order, and avoids unrelated papers. Shared values animate cards and curves together. The transaction runs after the animation completes. Undo restores the previous coordinates; compare-and-swap checks reject stale snapshots instead of overwriting a later drag. A subsequent manual drag clears the available arrangement Undo.

## Rendering

SVG curves live below cards inside the existing transformed world. Their endpoints intersect rotated card edges. A drag reads only its incident edges' gesture values; arrangement progress is read only by affected cards/edges. Camera movement does not produce React updates per frame. Existing spatial note culling is retained, and a spatial curve index includes links crossing the viewport even when their papers are outside it. Arrangement culling considers both starting and target bounds.

Android SVG rasterizes its local bounds, so its drawing surface is capped at 2,048 physical pixels per axis and scaled locally inside the world transform. This avoids oversized bitmap crashes at Focus/Fit All zoom levels. Reduced motion skips line drawing, card motion, and camera flights.

## Verification (2026-11-05)

- Focused canvas, graph, repository, Revisit, localization, and Indian-language checks: 113 passed. Graph cases cover cycles, duplicates, rotated bounds, 1,000-note chains/stars/unlinked boards, partial saved layouts, finite-world edges, and SVG bitmap bounds. Repository cases use SQLite to verify atomic Arrange/Undo, rollback on a failed write, stale-snapshot rejection, content preservation, and unchanged relationship types.
- TypeScript and scoped ESLint passed. The localization audit passed for all 21 existing catalogs. New copy remains pending native-speaker review.
- Full suite after the layout-switch fix: 865/866 passed. The remaining `settings-screen.test.mjs` header-title source assertion also fails against the unchanged HEAD version of `primitives.tsx`; this canvas work does not modify that header.
- Android emulator, isolated `notes-canvas-qa.db`: existing pairs appeared after search selection; live drag kept curves attached and saved only the moved paper; Arrange kept the selected anchor fixed; Undo restored the exact saved coordinates. The searchable picker connected an off-screen paper without moving either endpoint. Unlink removed only the new pair; self-link was rejected and connection mode cancelled. Focus fitting was retested after fixing the SVG bitmap-size crash.
- Hidden and Show all persisted locally. Filtering retained all saved pairs and positions. Tapping a curve opened its endpoint/unlink menu. A cold-launch 300-note run preserved all 80 earlier coordinates and exercised Focus and Fit All without an oversized bitmap crash.
- Layout-switch regression: reproduced selection loss without a loading error before the fix; verified selection and visible curves after six masonry/canvas cycles on Android, plus three more cycles retaining Show all. All saved positions and relationship types stayed unchanged. Eight reader regression cases cover native lock messages, bounded retries, a real SQLite write lock during bootstrap, permanent errors, stale responses, unmount, backoff cancellation, and preserving the last successful graph. The focused canvas/Revisit run passed 84 tests.
- iOS UI/gesture acceptance remains pending: the available simulator is headless and this environment lacks the Simulator application and an iOS UI driver. Physical-device performance, VoiceOver/TalkBack, and native-speaker review remain manual acceptance checks; Node timings do not establish device frame rate.

The fixture in `tests/native/notes-canvas.fixture.tsx` can be temporarily re-exported as an Expo Router QA route. It uses a separate database, seeded real relationship records, and optional `count`, `mode`, `saved`, and `reset` parameters. Use `reset=1` only for a fresh fixture run; `reset=0` retains fixture coordinates and visibility for reopening checks. Cold-launch when changing workloads: stacking fixture screens can leave the previous SQLite provider alive and cause an initialization lock. Remove the temporary route after QA.
