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


## iOS picker presentation fix (2026-10-18)

Status: implemented; physical iOS verification remains pending. No automated
behavior tests or device tests were run for this fix. Earlier verification above
belongs to the original feature and does not validate this patch.

The original editor mount effect immediately called `launchImageLibraryAsync`
when there was no saved header. Mounting inside a React Native Modal does not
mean UIKit has completed presenting it, including with `animationType="none"`.
In the installed React Native Fabric implementation, `Modal.onShow` is emitted
from the native presentation completion. The installed Expo ImagePicker stores
its pending promise and invokes `currentViewController.present(...)` without a
presentation-failure completion handler; if UIKit refuses that presentation,
there is no picker selection/cancellation callback to settle the promise. The
existing `finally` therefore cannot release the loading state. This is an
evidenced source-level race matching the report, not a device-confirmed diagnosis.
No device console trace was provided.

The iOS editor now waits for `onShow` before automatic or button-triggered
selection. Android keeps its existing presentation trigger. Selection also waits
for an active app. A synchronous ref excludes duplicate taps across selection,
processing, and saving; each phase has its own state. Backgrounding never clears
an operation or retries an in-flight picker. Cancellation and rejected promises
release the lock in `finally`. There is no timeout that could unlock a real picker
or interrupt an iCloud download. Existing crop, preview, SQLite setting, and
relative app-owned photo storage remain in place.

ImagePicker JS and iOS Pod versions are both 57.0.20, matching the installed
Expo SDK's bundledNativeModules requirement. Both app.json's picker plugin and
the generated iOS Info.plist contain the photo usage description. Expo 57's
image-only PHPicker flow requires no broad photo-library permission, so no
permission gate was added. iOS uses the compatible representation option already
used by Chits' attachment picker; the existing attachment pipeline converts and
resizes selected images to JPEG, maximum edge 2048, before private storage.
Reference: https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/.

This patch changes JavaScript only; it needs no new native rebuild when testing
with an existing SDK 57 binary containing ExpoImagePicker 57.0.20. A release
binary must still receive the updated JavaScript through the normal release or
compatible update process.

Development logs use `[Custom header photo]` and report settings/editor taps,
editor presentation completion, picker launch attempt, picker result, processing
start/end, preview state updates or decode failure, save results, and lock reset.
They exclude assets, filenames, URIs, and error text that may contain private
paths. Expo has no JS picker-opened event: a launch-attempt log alone does not
prove the photo library appeared. Confirm appearance visually on the device.

### Physical-device manual checks

1. With no custom header, open Settings → Appearance → Theme → Custom Header
   and tap Choose Photo. Confirm the editor appears, then exactly one native
   photo library opens. In development logs, editor presentation completion must
   precede the launch attempt. Do not remove an existing header unless you intend
   to replace it; use a fresh test installation for first-use coverage.
2. Cancel the library. Confirm the editor is usable, its buttons leave Please
   wait, and Choose Photo opens the library again. Repeat cancellation and rapid
   taps; confirm only one picker is active.
3. Select a JPEG. Confirm the preview appears. Drag, pinch, use positioning/zoom
   buttons, and change shading. Tap Apply Header. Navigate away and return, then
   force-quit and relaunch. Confirm the saved photo and framing persist.
4. Open Edit or Replace Photo. Cancel replacement and confirm the old photo and
   framing remain. Select a replacement, cancel the editor, then reopen and
   confirm the saved header remains unchanged. Apply a replacement and confirm
   that it persists. Check Remove Photo restores the current built-in header.
5. Repeat selection with HEIC, PNG, and a large photo. Confirm preview, crop,
   Apply, and restart persistence. Check the existing theme colors and controls.
6. Test a fresh photo-access state, full access, limited access, and denied access
   wherever iOS Settings offers those states. This image-only system picker
   should still allow explicit selection without a new broad-access request.
7. Select an iCloud-only photo with a connection. While it downloads, background
   Chits and return. Confirm no duplicate picker or premature loading reset, and
   that selection eventually reaches the preview. Repeat with a network failure;
   cancel/retry the native download or dismiss the picker, then select a local
   image. If Expo rejects, confirm the inline error and ability to choose again.
8. Repeat choose/cancel/select/crop/apply/restart on Android to check regression.

Remaining risks: iCloud downloads and native image decoding can take time;
loading intentionally stays active while their promises are pending. A different
native failure that never settles the Expo promise cannot safely be recovered by
resetting a timer. If the picker still fails to appear, capture the development
log sequence plus the Xcode device console presentation warning/error. Native
picker visibility, format handling, memory pressure, background transitions, and
persistence acceptance still require these device checks.


### iOS crop gesture follow-up (2026-10-18)

The preview's PanResponder was nested inside an uncoordinated ScrollView. The
iOS scroll view could cancel the preview's touch stream and take over its pan.
The crop now captures iOS touches, rejects responder takeover, and temporarily
disables parent scrolling until release or native termination. The iOS scroll
view also disables native pinch zoom and cancellation of child touch tracking.
The crop retains a native View as its touch target. Android's existing responder
and scroll behavior, crop calculations, layout, and saved framing are unchanged.

Physical verification remains pending. On iPhone, select a portrait photo and
slowly drag up/down in the preview: the photo should move while the editor stays
still. Pinch to zoom, then drag in both directions; at 100% an axis without image
overflow cannot move, so use Zoom In to check movement along both axes. Lift all
fingers and scroll outside the preview to confirm scrolling resumes. Repeat with
one finger → two fingers → one finger, system interruption/background/return,
replacement, Cancel, Apply, and restart. Confirm the existing Android drag/pinch
and outside-preview scrolling remain intact. Development diagnostics report crop
gesture start, finish, and interruption without coordinates or image details.
This follow-up is JavaScript only and requires no native rebuild.
