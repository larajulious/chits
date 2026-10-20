# Quick Note Templates

## Architecture and reuse

Templates are local starter documents, not another kind of note. Notes and Boards use
`AddNoteSheet`; Spaces exposes Create new inside its existing note picker and uses the
same sheet. The creation sheet offers Blank note / From template. Choosing Use template
opens its existing `NoteBlocksEditor`; only the existing Add confirmation writes a note.
Previewing, searching and selecting never create notes.

The gallery supports built-in, My Templates and Favorites filters, search, previews,
creation, editing, renaming, duplication, deletion and favorites. Open it through
Create new → From template. Save as template is available in the Notes thought menu,
Chat actions and the Card Details content actions. Cards with multiple thoughts let
the user select the source thought; subtasks and card-level attachments are not copied.

The eight bundled definitions use translated labels for Meeting Notes, Daily Journal,
Brainstorm, To-Do List, Project Plan, Shopping List, Study Notes and Expense Notes.
Built-ins are generated from bundled localization catalogs; they are not seeded into
user tables. Duplicate a built-in to customize it. Custom templates remain in the
language in which they were saved. Switching language never rewrites notes or drafts.

The document uses Chits' existing `NoteText` shape: text and optional bullet, numbered,
or checklist metadata. The editor does not currently have heading, quote or code block
types. Template section labels remain editable ordinary text; no new rich-text schema,
Markdown interpretation or editor library is introduced.

`{{date}}` is the only expanded token. Use template expands it using existing device
locale/date formatting. Preview also displays the expanded date; the template itself
retains the token. Arbitrary text and other tokens remain literal.

## Data and safety

Migration 28 adds `note_templates` and `note_template_favorites`; migration 27 and
existing notes are untouched. Built-ins have stable `builtin:*` IDs; custom templates
have independent `custom:*` IDs, title, description, category, document JSON/version
and timestamps. Favorite presence is persisted separately so bundled definitions do
not become stale database copies. Template JSON is an array of the existing text/list
blocks, including for plain-text templates (normal note plain-text storage is unchanged).

Saving a source note snapshots only its text and lists. Checklist completion resets,
list groups get independent identities, and note IDs, timestamps, board/Space identity,
privacy flags, pins, reminders and attachments are excluded. The save screen explicitly
explains this and asks users to review personal information in the text. Templates own
no files and cannot refer to or delete source attachments. Generated notes can add
attachments normally in the existing editor.

Single-flight submission prevents duplicate saves from rapid taps and releases on
failure. Board creation uses its existing transaction. Space creation inserts the
ordinary message and placement in one transaction, checking capacity inside the same
transaction; a full Space creates no orphan note. An empty checklist is valid in either
destination, matching the existing ordinary-note behavior.

Backups include templates/favorites in the existing hashed SQLite snapshot. Validation
checks tables/columns, document version and supported document shapes before restore.
Older backups migrate to empty custom collections plus the eight bundled templates.
Restoring replaces the entire backup data set as before; it does not merge templates.

## Implementation map

- `src/db/template-schema.ts`, `src/db/migrations.ts`: additive schema 28.
- `src/services/note-templates.ts`: definitions, validation, sanitization, instantiation,
  repository CRUD/favorites and single-flight protection.
- `src/features/templates/template-library.tsx`: theme-based gallery, preview and
  template editor using existing note/list components.
- `src/app/templates.native.tsx`, `src/app/templates.tsx`, `src/app/_layout.tsx`:
  source-note save flow and native route; web retains the device-only app boundary.
- `src/components/boards/add-note-sheet.tsx`: creation choices and template draft input.
- `src/components/spaces/note-picker.tsx`, `src/app/(tabs)/spaces.native.tsx`,
  `src/db/repositories.ts`: Space creation entry and atomic placement.
- Notes, Chat, `message-actions.tsx` and Card Details: Save as template entry points.
- All 14 `src/localization/locales/*.json` catalogs: UI, labels, starter text and summaries.
- `src/services/backup-service.native.ts`: schema/document validation.
- `tests/note-templates.test.mjs`: template unit and SQLite integration tests.
- `tests/revisit.test.mjs`: checks the exported latest migration version rather than 27.

## Manual QA — Android and iOS

These steps are a manual acceptance checklist; automated checks do not establish
keyboard, touch, VoiceOver/TalkBack, physical-device or store readiness. Restart the
updated app once so migration 28 runs; Fast Refresh alone does not reinitialize SQLite.

1. Cold start with existing notes. Verify notes, boards, Spaces, reminders, attachments
   and connections remain. Repeat after an app restart and with airplane mode enabled.
2. Notes → Add → Blank note. Type and save; confirm the previous creation behavior.
3. Notes → Add → From template. Browse all eight built-ins, search, clear search, and
   exercise My Templates/Favorites empty states. Preview and go back without saving;
   note counts must remain unchanged.
4. Use each built-in. Edit starter text and save. Reopen normally; verify text, bullets,
   checkboxes and searchable content. Confirm no checkbox is pre-completed.
5. From the same template create two notes. Edit one, change the template and delete
   the template. Verify both notes remain independent and reopen correctly.
6. Create a custom template with prose, bullets, numbered items and checklists. Save,
   edit, rename, duplicate, favorite/unfavorite and delete. Restart offline and verify
   custom templates and favorites persist. Cancel edits and confirm discard behavior.
7. Save an existing note as a template from Notes or Chat. Include completed tasks,
   images and reminders in the source. Verify the copy resets tasks and contains no
   attachments/reminders; verify the source text, files and completion remain unchanged.
   Test Card Details with one thought and with multiple thoughts. Covered notes must
   not expose a save action or source content.
8. Create a custom template with `{{date}}`. Preview and use it in different app/device
   locales. Verify local date output; unknown tokens remain literal. Literal dates in
   source notes are not automatically replaced.
9. Board → Add note → From template. Confirm the new ordinary card stays in the
   selected board/column. Back out and verify no extra card/message was created.
10. Space → Add existing note picker → Create new → From template. Save and confirm
    the new note is pinned to that Space. Fill the Space, then attempt creation and
    verify a clear error without an orphan note. On iOS verify the picker fully closes
    before the creation sheet appears.
11. Rapidly tap Add/Save/Use, including with a slow device. Confirm exactly one final
    note/template per completed save, and that errors allow a retry.
12. Edit a generated note: Enter and Backspace through list boundaries, delete to an
    empty document, toggle checklist formats, select/replace text, paste multiline
    text, undo/redo, and switch between compact/full-screen input. Verify caret position
    and no unexpected blank lines. Repeat with emoji, Arabic and CJK input/composition.
13. Add an image/attachment after selecting a template, save and reopen. Discard another
    draft with an image and confirm existing attachments remain. Templates themselves
    intentionally support text/lists only.
14. Use system/light/dark appearance and customized themes. Verify legibility, gallery
    cards, preview, fields, focus and disabled controls. Test large accessibility fonts,
    narrow phones, tablets, rotation settings and keyboard resize behavior.
15. With VoiceOver/TalkBack verify titles, search, filters, favorites, preview, Save,
    Back, checkboxes and errors. Confirm no essential labels are truncated or hidden.
16. On Android test hardware Back in gallery, preview, custom editor and note editor.
    On iOS test header Back/Cancel and sheet transitions. Cancel/close must return to
    the original destination without creating a note or losing a saved template.
17. Switch among all supported languages; verify built-in labels/content and UI copy.
    Confirm an in-progress custom draft is not silently translated or replaced.
18. Export a backup containing custom templates, favorites and generated notes. Restore
    after a fresh start and verify documents, checklists, notes and favorites. Restore
    an older backup and verify the library still provides all eight built-ins.

Translation catalogs are complete; native-speaker review remains appropriate for
linguistic acceptance. Android/iOS manual QA is intentionally left to the user.

## Executed validation

- `npm test`: 402 passed, 0 failed; includes 16 template tests.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run check:localization`: passed for all 14 bundled languages.
- `npx expo export --platform ios --platform android`: both bundles exported.
- `git diff --check`: passed.

Backup tests exercised real SQLite snapshots, archive validation and replacement
restore, including an older schema-27 backup. The rapid-tap test executes the actual
AddNoteSheet submit handler, not only the single-flight helper. No manual Android/iOS
acceptance or store readiness is claimed by these results.

## Design alignment

The template surfaces reuse Chits' `AppHeader`, `HeaderIcon`, `IconButton`, `Chip`,
`Button`, `Surface`, theme radii, input styles and font roles. The creation choices
use `BottomSheetSurface`, matching existing action sheets. These changes apply to
the template presentation and entry choices; template storage and operations remain
unchanged. The updated gallery and creation sheet were visually checked on Android;
iOS and alternate-theme visual acceptance remain part of the manual checklist.
