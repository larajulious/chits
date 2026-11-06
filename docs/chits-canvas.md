# Chits Canvas

Open **Create New → New Canvas**, or use a note's **Pin to Canvas** action. Browse saved canvases from **Side panel → Chits Canvas**. The destination is registered in both the native and shared drawers. The existing Notes board and its Connected Notes gestures remain separate and unchanged.

The full-screen route is `/canvas?id=<document ID>`. The dedicated `/canvases` screen includes vector thumbnails, title search, and an Archived switch. Global Search also matches canvas titles. More supports duplication, archive/restore and confirmed deletion. Removing a pin never writes to the original note.

## Workspace

- Pen and highlighter store world-coordinate points, pressure, width, color and tool. Finger pressure defaults to a stable width; stylus pointer pressure is retained when delivered by the device.
- Move pans with one finger. Two pointers pan and zoom in any mode. Fit and double-tapping blank space frame the complete content.
- Select an object and drag to move. Drag the lower-right handle to resize notes or text. Open / Edit opens the original note or edits text. Color / Size changes selected text color/font size as well as the current drawing style. Bring forward changes layer order.
- Eraser removes intersecting drawing strokes only. Remove selected explicitly removes any selected object. Undo/redo retains up to 60 operation snapshots.
- Pin Note searches and filters existing organized notes and thoughts, with multiple selection. Previews resolve original IDs on every screen focus. Hidden content is redacted; absent/archived notes display a missing-note placeholder. Existing card editor routing is reused.
- Export PNG composes every object from content bounds, with 16/32/64 world-point padding and white background. Large output scales to a maximum edge of 4096 pixels and 4 million pixels total. Sharing uses the native share sheet; temporary export files are removed afterwards.

## Architecture

`src/features/whiteboard` owns the typed document, repository, note resolver, shelf, native host and offline drawing runtime. No network, backend, dependency changes, schema migration or attachment files are required.

The runtime uses the already-installed Expo 57-compatible WebView. Pointer movement and drawing run inside its drawing surface, without React state changes or bridge calls for each point. The vector document is authoritative; HTML Canvas is only its renderer. Skia was evaluated but is not an existing dependency. This choice avoids a new native-module rollout. Native toolbars use existing paper colors, AppText and Icon primitives, 44-point-or-larger controls and safe-area insets.

Documents are namespaced `whiteboard.v1.<ID>` rows in `app_settings`, the existing local SQLite table covered by database backup and restore. Complete gestures send structured objects to the host. Saves debounce at 300 ms, serialize snapshots, flush when backgrounding/leaving, and expose failure/retry status. The in-progress gesture and debounce window can be lost on abrupt process termination. Metadata includes creation/modification dates, title, archive status, viewport and dismissed guide. No drawing-content search is claimed.

The Canvas library is a dedicated navigation destination, rather than changing the established card/thought union used by Notes, boards and Connected Notes. Canvas pin relationships are document-local original-note references; they do not create or alter Connected Notes edges.

## Verification

- `tests/whiteboard.test.mjs`: world transformations, stroke-only erasing, undo/redo, movement/resizing/removal, 400 structured strokes, export limits, SQLite roundtrip and actual backup/validation/restore roundtrip.
- Chromium drawing-surface checks: pointer drawing, pinned preview, fit, generated PNG and 390/850px viewport captures. These exercise the rendering runtime, not the React Native toolbar or native WebView embedding.
- iOS and Android production JavaScript/Hermes export completed to `/tmp/chits-canvas-export`.
- Full suite: 895/896 passed. The failing `every header title gets the paper tag, and only with a title` assertion concerns unchanged `src/components/ui/primitives.tsx`.

Outstanding acceptance checks: native iOS/Android toolbar and keyboard behavior, two-finger/stylus delivery, native share/save destinations, abrupt-kill behavior and frame/memory profiling on mid-range hardware with many pins. UI copy is currently English. The canvas interaction surface is not yet a screen-reader editing alternative. Native builds, device acceptance and store readiness are not established by the bundle/browser checks.

The reusable browser check is `node scripts/check-chits-canvas-browser.mjs` with Playwright available. Optional `CHITS_CANVAS_PLAYWRIGHT` and `CHITS_CANVAS_CHROMIUM` select an existing installation/browser executable; `CHITS_CANVAS_ARTIFACTS` selects the screenshot directory. It checks text entry, including the pointer-default-action focus regression, and PNG composition alongside drawing and pins.

## Chits visual alignment

The library and pickers reuse PaperDesk, PaperCard, SearchField, AppHeader, EmptyState, the existing mascot, and workspace Fredoka/Nunito fonts. Toolbar and page colors come from the existing welcomeSurfaces/useDesk tokens in both themes. The artwork remains white, as Chits paper content does. The editor uses a floating dock with all eight tools visible: a single horizontally scrolling row, retaining at least 44-point touch targets. Object editing, layer ordering and removal remain available through Canvas options.

The bundled Nunito asset is also loaded into the offline WebView through FontFace for canvas text and pinned-note previews; no web fonts or network dependency are introduced. This changes display typography, not saved text or vector geometry.

Visual checks used an iPhone 17 simulator and an isolated QA database through `tests/native/canvas-style.fixture.tsx`. Light library, light editor at 375-point content width, dark editor, and dark Pin to Canvas screens were inspected. Screenshot evidence is in `/tmp/chits-canvas-library-light-final.png`, `/tmp/chits-canvas-editor-light-375-final.png`, `/tmp/chits-canvas-editor-dark-final.png`, and `/tmp/chits-canvas-pin-dark-final.png`. The temporary QA route was removed. The test fixture remains available to remount for future visual checks. These captures do not establish Android device or stylus performance acceptance.

The Canvas library now follows Unorganized’s compact list layout: a brief description below the single top-bar title, shared Active/Archived FilterRail, and 76-point minimum theme-aware rows with 80×54 vector previews and the shared control radius. The custom mascot intro, oversized fixed-white cards and standalone archive button were removed. Light (375-point) and dark simulator captures: `/tmp/chits-canvas-list-light-375.png` and `/tmp/chits-canvas-list-dark.png`.
