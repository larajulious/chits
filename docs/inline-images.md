# Inline images in Chits

Chits uses the existing message entity for chat thoughts and notes. Boards link
those messages through `card_messages`; Spaces link the same message or card.
Inline insertion and structured lists therefore preserve IDs and ordering across organization without
copying files or introducing another note store.

## Editing

- Open the native text editing menu and choose Paste for a copied image, or
  **Insert photo inline** for a library photo. These actions insert at the native
  selection, preserving selected text after the image, then focus the text after the image.
- Fullscreen Message Note, Add Note and Edit Note have an **Insert image** toolbar
  icon. It captures the cursor before opening the native picker, restores focus
  on cancellation, and inserts through the same content pipeline as paste.
- Chat also offers **Insert photo inline** in the existing attachment sheet.
- Hold Add Note's existing Photo control to insert inline. Tapping it retains the
  existing attachment behavior. The contextual Paste image action remains available.
- Saved and staged images open in the existing full-screen preview. Editor drafts
  use a preview without stored-attachment actions. Images can be replaced from the gallery or removed individually. Replacement keeps
  the image position; saved files are cleaned up only after saving, if unreferenced. Text surrounding a removed image rejoins
  without trimming whitespace or adding new characters.
- Text-only inputs keep their existing native TextInput and styles. Docked and
  fullscreen Chat use the same block editor; headers, send buttons and navigation
  retain their existing layout.

The native editing actions require a rebuilt development/production app, rather
than Expo Go or an older installed native binary. The clipboard chip is the
fallback when the installed binary lacks the new hooks.

## Lists

Fullscreen Message Note, Add Note and Edit Note share a minimal toolbar with
Lucide ImagePlus, List and ListOrdered icons. List actions use the saved native
selection to convert the current paragraph or selected multiline paragraphs.
Enter continues a list; Enter on an empty item exits it. Backspace on an empty
item removes its formatting. The selected list action toggles an item off, and
switching kinds changes the logical list. Multiline paste creates ordered items.

Each list item remains a text block with `list: { kind, id }` metadata. Its text
contains the user's words only. Markers and numbers are derived from item order,
including items separated by inline images. JSON parsing, editing, saving,
Board/Space rendering, Chat drafts and Share Note pagination retain this metadata.
Plain-text notes continue to use NULL structured content. Numbering is recomputed
after insertion, deletion or reordering; a new list ID restarts it at 1.

The editor still uses native TextInputs for each text block. Native range selection
and native text undo stay within one input; it does not provide selection across
image/list blocks or document-wide structural undo/redo. Selecting multiple
paragraphs within a plain text input and converting them together is supported.

## Persistence and integrity

The existing `messages.content_json` array stores ordered text and stable image
attachment IDs; `messages.text` stores readable words for search and compact
previews. Legacy text-only messages retain NULL content_json. No database migration
is necessary because these columns and the attachment schema already exist.

Photos use the existing optimization and app-owned relative storage paths.
SQLite holds metadata, not image bytes. Inline photo IDs and ordinary attachments
share storage/backup/lifecycle infrastructure, while their render positions remain
distinct. Attachment collections list each underlying photo row once. Repeated
references can render repeatedly without creating duplicate attachment rows.

Writes validate image ownership and reject temporary paths before committing.
Flattened text edits that cannot describe mixed content are rejected rather than
moving images. Image deletion reports files for removal only after commit and only
when no other stored message, card attachment or wallpaper references the path.
Deleting a photo from the attachment library removes its inline references in the
same transaction. Cleanup failures do not convert an already committed save into an unsaved retry.

Ordinary unsent Chat image drafts remain staged until Send or Save as draft; the
existing automatic text draft persistence does not retain their image files across
screen teardown. Use Save as draft to retain the complete message across restarts.

## Sharing and backup

Rich Share Note exports keep text and the selected images in their written order,
using the existing theme and image-selection controls (including the existing
maximum of two selected photos). Long rich notes paginate rather than truncating
their words. Standard text-only exports retain their existing renderer.

The existing backup captures content_json, photo rows and referenced file bytes.
Tests restore a two-image message after Board/Space transfers and verify IDs,
ordered content, byte identity and foreign-key integrity. Old-schema recovery,
missing files, low storage and interrupted restores remain covered by backup tests.

## Validation

Run the focused tests, TypeScript and changed-file ESLint:

```sh
node --test tests/note-lists.test.mjs tests/note-inline-images.test.mjs tests/chat-composer.test.mjs tests/backup-restore.test.mjs tests/share-note.test.mjs tests/add-note-attachments.test.mjs
npx tsc --noEmit
```
All 81 focused tests pass, including list conversion, Enter/exit, multiline paste,
renumbering, list-only drafts, Board/Space backup and restore, image insertion
at empty/start/middle/end positions, and preservation of authored whitespace.

`scripts/test-inline-paste-ios.sh` runs UIKit interception tests on an already
booted simulator. Android instrumentation lives in the local attachments module;
build with `android/gradlew -p android :chits-attachments:assembleDebugAndroidTest`
and run `expo.modules.chitsattachments.test/androidx.test.runner.AndroidJUnitRunner`
on a selected emulator. Tests check image selection, text-handler forwarding,
photo insertion dispatch and cleanup of native hooks.

The iOS simulator app build and Android native/test APK builds passed. Mobile JavaScript exports also passed. Two UIKit
runtime tests and one Android emulator instrumentation test passed. The Android
test used a disposable emulator because the existing emulator had insufficient
storage; its apps and data were left intact. Full Node
regression testing has 214 passing cases and two existing source assertions failing
in unchanged Card Details and root navigation files.

`tests/native/note-lists.yaml` provides the list UI regression flow for a fresh,
disposable iPhone simulator or Pixel 7 Android emulator using Gboard. Runtime
checks covered the toolbar, bullet continuation/exit, conversion to numbering,
save/reopen and empty-item soft-keyboard Backspace. Android text input updates
use the latest draft state, and empty-item deletion waits for any accompanying
IME commit before removing formatting. Android hardware Backspace is subject to
React Native's soft-keyboard-only `onKeyPress` event support.

Physical-device gallery/other-app clipboard permissions, OEM/IME paste variants,
keyboard/scroll behavior and visual comparisons across themes still require manual
app-level acceptance. Native hook tests do not establish those results.

Implementation was checked against [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
and its [Clipboard API](https://docs.expo.dev/versions/v57.0.0/sdk/clipboard/).
