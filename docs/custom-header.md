# Custom photo header

Settings → Appearance → Theme → Custom Header → Choose Photo.
Drag or pinch the header preview, or use the positioning and zoom buttons. Shading
has a safe minimum for white header text. Apply Header commits the selection;
Cancel and system Back discard edits. Edit or Replace Photo reopens the editor.
Remove Photo returns to the current built-in theme's header. Choosing another
palette or theme keeps the photo, which is an independent customization layer.

The picker and preview use existing Expo SDK 57 dependencies and AppHeader.
The system editor was not used because iOS restricts its crop to a square;
Chits' small crop surface uses React Native's existing PanResponder instead.
No new packages or native configuration are required.

Photos are optimized by the existing attachment-storage pipeline (JPEG, quality
0.82, maximum edge 2048 px), copied into `chits-attachments/headers/`, and stored
as relative references in `app_settings.custom_header_photo`. The setting
contains optimized dimensions, normalized position, zoom, and overlay. Cropping
is a clipped, resolution-independent frame; the stored optimized image supports
other header sizes without another decode/manipulation of the camera original.
The preview uses the same image layer, header layout, fonts and safe-area height.
The image cache uses each copy's unique URI. File existence is checked when the
saved reference changes; image decode failures also fall back to the built-in
header. The recoverable setting remains available for replacement/removal.

ThemeProvider owns the setting independently of theme identity, style, accent
and appearance. Shared TopBarBackground/useHeaderInk inherit it. Notes Cards and
Boards therefore use the photo automatically. Chat's timeline fade and Spaces'
immersive canvas keep their specialized layouts.

A staged copy is deleted on cancellation or replacement before Apply. Saving
commits the SQLite setting first, then checks attachment and setting references
before removing the previous dedicated header copy. Cleanup failures do not turn
a committed save into a failed operation. Removal never targets original gallery
assets. Backups enumerate this setting's file through the existing manifest,
checksum, staging and rollback flow; absent settings in older backups need no
migration. Missing files are reported through the existing missing-media report.

## Verification

Automated coverage is in `tests/header-photo.test.mjs`: safe parsing and paths,
contrast/crop limits, portrait/landscape geometry, atomic settings failure,
reference-aware cleanup eligibility, backup round trip and missing media. The
existing backup suite covers older backups and restore rollback. These run
against isolated SQLite/filesystem fixtures, not the user's database.

Validation on this change:

- TypeScript, changed-file ESLint, and Android/iOS Expo exports pass.
- All 35 focused header, background and backup tests pass (including nine new
  header tests). The full suite run before the final two additional header tests
  had 280 passes and the same two pre-existing source-shape failures in
  `detach-card.test.mjs` and `onboarding-first-run.test.mjs`.
- Android 13 emulator: real system gallery selection, photo preview, positioning
  and zoom buttons, Apply, saved preview, cold restart, and Notes header rendering
  were exercised. Canceling edited framing preserves the active photo. Canceling
  replacement removes the staged copy and retains the original copy. Applying a
  replacement deletes only the previous copy; Remove Photo restores the built-in
  header and leaves the dedicated header folder empty.
- iOS 27 simulator: Theme Picker integration was visually inspected. Android and
  iOS native exports both pass. This is not physical-device acceptance.
- An optional all-platform export reaches a pre-existing web resolution failure
  for `@/services/backup-service` from `backup.native.tsx`; native exports pass.

Remaining manual acceptance: iOS gallery/editor flow; two-finger pinch on both
platforms; real device safe areas; system light/dark changes; large photo memory
behavior; large accessibility fonts/long titles; landscape rotation; and native
backup UI round trips. Missing-media and restore rollback are covered by isolated
runtime tests, not yet by physical-device testing.
