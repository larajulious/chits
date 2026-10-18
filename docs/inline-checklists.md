# Inline checklists

The fullscreen Chat composer, Add Note and Edit Content use `NoteBlocksEditor`.
The compact Chat composer has no additional toolbar controls.

A checklist item is a text block with `list: { kind: 'checklist', id, checked }`.
The list ID groups related items; each item's completion is independent. Images,
plain runs, bullets and numbered items retain their existing ordered format.
`messages.content_json` stores this content, and `messages.text` retains searchable
words. Legacy plain notes keep `content_json = NULL`. No SQLite migration or
new dependency is required. The existing database backup includes these states.
Older Chits builds do not recognize the new list kind; use the updated app to
edit or restore backups containing checklists.

The checkbox toolbar action converts the current paragraph, or the selected
paragraphs within one native text input. Native selection cannot span separate
block inputs. Enter creates an unchecked item; Enter on an empty item and
Backspace on an empty item return to a normal paragraph. Pasted multiline text
keeps its later paragraphs as plain text. Existing bullet/numbered paste behavior
is preserved. Checkbox taps keep item order and do not request keyboard focus.

Undo/redo buttons cover text, list-format and completion edits for the current
editor session, with 100 snapshots. Loading another note, saving/reopening, or an
image operation starts a new history, so undo cannot resurrect a deleted staged
file. Platform keyboard undo is still owned by each native text input. Saved
reader toggles commit immediately; open the editor for session undo/redo.

Saved Chat and Card Details readers use a transaction to update only the tapped
completion state. A content-version check rejects stale writes. Cards previews
count all structured checkboxes, show up to three remaining items, and retain
ordinary prose separately. Card subtasks remain a separate existing feature.
Share Note draws checkbox states using the existing vector checklist renderer.

## Automated checks

- `node --test tests/note-checklists.test.mjs tests/note-lists.test.mjs tests/note-inline-images.test.mjs`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`

Checklist tests cover paragraph/selection conversion, Enter, empty-item exits,
multiline paste, immutability/order, kind switching, cursor targets, 120-item
summaries, history, serialization, Chat drafts and repeated saves, atomic stale
writes, Add Note persistence, organization, Spaces, backup/restore and image
removal. Real SQLite and portable archive fixtures exercise the storage path.

## Manual device checklist

Run on iOS and Android with their normal software keyboards, in both light and
dark mode. Use disposable notes, and back up before trying restore.

- [ ] Chat → fullscreen: insert a checkbox into an empty note and at the start,
  middle and end of a paragraph. Keep text on either side and the caret position.
- [ ] Add Note → fullscreen: perform the same operations; save, open from Cards,
  edit existing content and save again.
- [ ] Select several paragraphs within one input and convert them. Verify the
  next paragraph is excluded when the selection ends at its boundary.
- [ ] Type three consecutive tasks with Enter. Enter twice to resume prose.
  Enter midway through a checked task: the new task must be unchecked.
- [ ] Backspace on an empty task: return to plain editing without losing adjacent
  tasks. Delete one item's text and remove its formatting.
- [ ] Paste several paragraphs into a task, including over selected text. Only
  the first line remains in the existing task; later paragraphs stay plain.
- [ ] Mix separate checklist groups with prose, bullet/numbered lists, and images
  before and after tasks. Replace/remove images and reopen the saved note.
- [ ] Toggle a task while its keyboard is closed: no keyboard or caret movement.
  Toggle while typing: preserve focus, checked state, scroll and writing order.
- [ ] Undo and redo typing, formatting and completion; make a fresh edit after
  undo to discard redo. Test rapid toggles and image-operation history reset.
- [ ] Save as draft repeatedly in fullscreen Chat, then Send. Reopen and confirm
  one note, one copy of each item, correct checked states, and accurate save status.
- [ ] Toggle in saved Chat/Card Details and reopen the note. Verify persistence
  and Cards progress, including 0%, 100%, mixed prose and separate card subtasks.
- [ ] Use a 100+ item note: scroll to the bottom, insert in the middle, edit, save,
  reopen and confirm progress. Check small screens, landscape and large text.
- [ ] Export through Share Note: checkbox states, image order and page boundaries
  survive. Export/import backup and verify the same content and attachment files.
- [ ] iOS selection handles, Android/Gboard composition, keyboard open/close,
  dark mode, VoiceOver/TalkBack labels and independent checkbox touch targets.

Full-suite failures unrelated to checklists in the current checkout:
`Card details edit controls follow the board accent` (`detach-card.test.mjs`) and
`the root layout only gains the onboarding layer, after every existing screen`
(`onboarding-first-run.test.mjs`) assert older source markup.

## Validation in this change

TypeScript and ESLint pass. The 59 focused checklist/list/image/Add Note tests
pass, including 15 new checklist behavior/persistence tests. The full suite has
251 passing tests and the two existing source-markup assertions listed above.
iOS and Android production JavaScript exports pass.

The iPhone 18 Pro simulator confirmed checkbox conversion, burgundy completion,
Enter continuation, typing, undo/redo, saving, reopening with completion intact,
and the Cards summary showing 1 of 2 completed and 50%. Native testing exposed
Add Note's fullscreen header underneath the status bar; the modal now provides
its own safe-area context and its save control is accessible.

Checklist spacing was tightened after feedback: 28-point minimum checkbox row
height, 4-point spacing between consecutive items, and a narrower marker column.
The checkbox has additional press slop independent of the text input. Authored
paragraph breaks remain intact. Full software-keyboard/selection, dark-mode and
physical-device acceptance still follow the manual list above.
