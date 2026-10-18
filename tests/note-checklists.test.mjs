import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleNoteList, editNoteListItem, toggleNoteChecklist } from '../src/services/note-lists.ts';
import { draftFromNote, draftContentForStorage, insertImageAtCursor, noteChecklistSummary, noteListMarkers, noteRenderContent, parseNoteContent, serializeNoteContent } from '../src/services/note-content.ts';
import { createNoteEditHistory } from '../src/services/note-edit-history.ts';
import { buildShareNoteSource, paginateInlineShare } from '../src/services/share-note.ts';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';

const plain = (text, key = 'p') => ({ key, type: 'text', text });
const task = (text, key = 't', checked = false, id = 'group') => ({ ...plain(text, key), list: { kind: 'checklist', id, checked } });
const cursor = (start, end = start, key = 'p') => ({ key, start, end });
const image = { key: 'photo', type: 'image', attachmentId: null, image: { storagePath: 'chits-attachments/chat/checklist.jpg', originalName: 'checklist.jpg', mimeType: 'image/jpeg', size: 8, width: 800, height: 600 } };

test('toolbar converts the cursor paragraph and selected paragraphs without eating surrounding text', () => {
  for (const position of [6, 8, 10]) {
    const result = toggleNoteList([plain('Title\nTask\nAfter')], cursor(position), 'checklist');
    assert.deepEqual(result.blocks.map((block) => block.text), ['Title', 'Task', 'After']);
    assert.deepEqual(result.blocks[1].list, { kind: 'checklist', id: result.blocks[1].list.id, checked: false });
    assert.equal(result.cursor.key, result.blocks[1].key);
    assert.equal(result.cursor.start, position - 6);
  }
  const selected = toggleNoteList([plain('Title\nFirst\nSecond\nAfter')], cursor(6, 19), 'checklist');
  assert.deepEqual(selected.blocks.map((block) => block.text), ['Title', 'First', 'Second', 'After']);
  assert.equal(noteChecklistSummary(selected.blocks).total, 2);
});

test('completion toggles are immutable, preserve order, and text edits keep checked state', () => {
  const original = [plain('Intro'), task('Done', 'a', true), task('Next', 'b'), plain('After', 'z')];
  const toggled = toggleNoteChecklist(original, 'b');
  assert.deepEqual(toggled.map((block) => block.key), ['p', 'a', 'b', 'z']);
  assert.equal(original[2].list.checked, false);
  assert.equal(toggled[2].list.checked, true);
  const edited = editNoteListItem(toggled, 'a', 'Still done');
  assert.equal(edited.blocks[1].list.checked, true);
  assert.equal(edited.cursor, null, 'ordinary typing must not schedule focus or reset native selection');
});

test('Enter splits a checked item and creates an unchecked item with a correctly positioned caret', () => {
  const original = [task('Hello world', 't', true)];
  const result = editNoteListItem(original, 't', 'Hello\n world', cursor(5, 5, 't'));
  assert.deepEqual(result.blocks.map((block) => block.text), ['Hello', ' world']);
  assert.equal(result.blocks[0].list.checked, true);
  assert.equal(result.blocks[1].list.checked, false);
  assert.equal(result.cursor.key, result.blocks[1].key);
  assert.equal(result.cursor.start, 0);
  const end = editNoteListItem(original, 't', 'Hello world\n', cursor(11, 11, 't'));
  assert.equal(end.blocks[1].text, '');
  assert.equal(end.blocks[1].list.checked, false);
});

test('Enter and Backspace on empty items exit into a normal paragraph, preserving the next item', () => {
  const original = [task('Keep', 'keep', true), task('', 'empty'), task('Next', 'next')];
  for (const result of [editNoteListItem(original, 'empty', '\n'), toggleNoteList(original, cursor(0, 0, 'empty'), 'checklist')]) {
    assert.equal(result.blocks[1].list, undefined);
    assert.equal(result.blocks[2].list.kind, 'checklist');
    assert.equal(result.blocks[0].list.checked, true);
    assert.equal(result.cursor.start, 0);
  }
});

test('multiline paste keeps paragraphs plain rather than manufacturing tasks, including replacement', () => {
  const original = [task('Before After', 't', true), task('Keep next', 'next')];
  const result = editNoteListItem(original, 't', 'Before One\nTwo\nThree After', cursor(6, 6, 't'));
  assert.deepEqual(result.blocks.map((block) => block.text), ['Before One', 'Two\nThree After', 'Keep next']);
  assert.equal(result.blocks[0].list.checked, true);
  assert.equal(result.blocks[1].list, undefined);
  assert.equal(result.cursor.start, 'Two\nThree'.length);
  const replaced = editNoteListItem([task('Selected')], 't', 'One\nTwo', cursor(0, 8, 't'));
  assert.deepEqual(replaced.blocks.map((block) => block.text), ['One', 'Two']);
  assert.equal(replaced.blocks[1].list, undefined);
});

test('switching a single item between lists leaves neighboring checkbox states and bullet numbering intact', () => {
  const original = [task('One', 't', true), task('Two', 'two', true)];
  const bullet = toggleNoteList(original, cursor(1, 1, 't'), 'bullet');
  assert.equal(bullet.blocks[0].list.kind, 'bullet');
  assert.equal(bullet.blocks[1].list.checked, true);
  const numbered = toggleNoteList(bullet.blocks, cursor(1, 1, 't'), 'numbered');
  assert.equal(numbered.blocks[1].list.checked, true, 'a converted item must not keep its former checklist group id');
  const checklist = toggleNoteList(bullet.blocks, cursor(1, 1, 't'), 'checklist');
  assert.equal(checklist.blocks[0].list.checked, false);
  assert.deepEqual(noteListMarkers(checklist.blocks), [null, null]);
});

test('serialization round trips mixed groups, blank items, images and legacy text without mutation', () => {
  const blocks = [plain('Title\n'), task('Done', 'a', true), { ...image, attachmentId: 'saved-photo' }, task('', 'empty'), plain('\nAfter', 'z'), task('Other group', 'c', false, 'other')];
  const json = serializeNoteContent(blocks);
  const parsed = parseNoteContent(json);
  const attachment = { ...image.image, id: 'saved-photo', type: 'photo', createdAt: 1 };
  const draft = draftFromNote({ text: 'fallback', content: parsed, attachments: [attachment] });
  assert.equal(draftContentForStorage(draft), json);
  assert.equal(draft[1].list.checked, true);
  assert.equal(draft[3].text, '');
  assert.equal(noteRenderContent({ text: '', content: parsed, attachments: [attachment] }).blocks[1].list.checked, true);
  assert.equal(serializeNoteContent([plain('Legacy plain text')]), null);
  assert.deepEqual(draftFromNote({ text: 'Legacy', attachments: [] }).map((block) => block.text), ['Legacy']);
  assert.equal(parseNoteContent('[{"type":"text","text":"safe","list":{"kind":"checklist","id":"g","checked":"false"}}]')[0].list.checked, false);
});

test('image insertion preserves groups and checkbox states on either side', () => {
  const result = insertImageAtCursor([task('First', 't', true), task('Second', 'next')], cursor(5, 5, 't'), image);
  assert.equal(result.blocks[0].list.checked, true);
  assert.equal(result.blocks[1].type, 'image');
  assert.equal(result.blocks.at(-1).list.checked, false);
});

test('Cards summary uses all actual states, bounds remaining items and preserves mixed prose', () => {
  const blocks = [plain('Title\nDetails'), ...Array.from({ length: 120 }, (_, index) => task(`Task ${index}`, `t${index}`, index < 90)), plain('After', 'end')];
  assert.deepEqual(noteChecklistSummary(blocks), { total: 120, completed: 90, percent: 75, remaining: ['Task 90', 'Task 91', 'Task 92'], text: 'Title\nDetails\n\nAfter' });
  assert.equal(noteChecklistSummary([plain('[x] Legacy text\n☐ Literal symbol')]), null);
  assert.equal(noteChecklistSummary([task('', 't', true)]).percent, 100);
});

test('undo/redo restores completion, list formatting and cursor; new edits clear redo', () => {
  const history = createNoteEditHistory(2);
  const initial = { blocks: [plain('Task')], cursor: cursor(2) };
  const converted = toggleNoteList(initial.blocks, initial.cursor, 'checklist');
  history.record(initial);
  const checked = { blocks: toggleNoteChecklist(converted.blocks, converted.blocks[0].key), cursor: converted.cursor };
  history.record(converted);
  assert.deepEqual(history.travel('undo', checked), converted);
  assert.deepEqual(history.travel('undo', converted), initial);
  assert.deepEqual(history.travel('redo', initial), converted);
  history.record(converted);
  assert.equal(history.canRedo(), false);
  history.reset();
  assert.equal(history.canUndo(), false, 'external loads/image removal must discard obsolete file snapshots');
  assert.equal(history.canRedo(), false);
});

test('Share Note retains inline checkbox state across page breaks without duplicating checkbox indicators', () => {
  const source = buildShareNoteSource({ messages: [{ text: 'fallback', content: [task('Long '.repeat(400), 'a', true), task('Next')], attachments: [] }] });
  const pages = paginateInlineShare(source.blocks);
  const blocks = pages.flat();
  assert.ok(pages.length > 1);
  assert.deepEqual(blocks.filter((block) => block.list?.kind === 'checklist').map((block) => block.list.checked), [true, false]);
  assert.equal(blocks.map((block) => block.text).join(''), 'Long '.repeat(400) + 'Next');
});

const { createMessageRepository, createBoardRepository, createSpaceRepository, createAttachmentRepository } = await loadModule('src/db/repositories');
const { saveChatComposer, writeChatDraft, readChatDraft } = await loadModule('src/services/chat-composer');
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec("INSERT INTO boards (id,name,created_at,updated_at) VALUES ('b','Ideas',1,1); INSERT INTO board_columns (id,board_id,name,position,created_at,updated_at) VALUES ('c','b','Inbox',0,1,1)");
  return { env, db, messages: createMessageRepository(db) };
}

test('Chat draft, send, repeated save and subsequent editing persist states without duplication', async (t) => {
  const { db, messages } = await fixture(t);
  const blocks = [task('First', 'a', true), task('Second', 'b')];
  await writeChatDraft(db, 'First\nSecond', null, serializeNoteContent(blocks));
  const draft = await readChatDraft(db, messages);
  assert.deepEqual(draft.content.map((block) => block.list.checked), [true, false]);
  const saved = await saveChatComposer(messages, { text: '', editing: null, attachment: null, blocks });
  const edited = await saveChatComposer(messages, { text: '', editing: saved, attachment: null, blocks: [task('Edited first', 'a', true), task('Second', 'b')] });
  assert.equal(edited.id, saved.id);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
  assert.deepEqual(edited.content.map((block) => block.list.checked), [true, false]);
  await assert.rejects(messages.updateText(saved.id, 'Flattened'), /note editor/);
});

test('an empty checklist is savable and reopens as an editable item', async (t) => {
  const { messages } = await fixture(t);
  const saved = await saveChatComposer(messages, { text: '', editing: null, attachment: null, blocks: [task('')] });
  assert.equal(saved.content[0].text, '');
  await messages.updateContent(saved.id, [task('', 't', true)]);
  assert.equal((await messages.getActiveById(saved.id)).content[0].list.checked, true);
});

test('saved checkbox changes are atomic and reject stale, missing and archived targets', async (t) => {
  const { messages } = await fixture(t);
  const id = await messages.createNote({ blocks: [task('First', 'a'), task('Second', 'b')] });
  const saved = await messages.getActiveById(id);
  const original = serializeNoteContent(saved.content);
  await messages.setChecklistChecked(id, 0, true, original);
  await assert.rejects(messages.setChecklistChecked(id, 1, true, original), /note changed/);
  const current = await messages.getActiveById(id);
  assert.deepEqual(current.content.map((block) => block.list.checked), [true, false]);
  assert.equal(current.text, saved.text, 'toggling state does not rewrite searchable text');
  await assert.rejects(messages.setChecklistChecked(id, 100, true, serializeNoteContent(current.content)), /no longer available/);
  await messages.archive(id);
  await assert.rejects(messages.setChecklistChecked(id, 0, false, serializeNoteContent(current.content)), /note changed/);
});

test('mixed checklists survive Add Note, organization, Spaces, backup/restore and photo deletion', async (t) => {
  const { db, env, messages } = await fixture(t);
  env.write(image.image.storagePath, 'qa-photo');
  const id = await messages.createNote({ blocks: [plain('Title\n'), task('Done', 'a', true), image, task('Todo', 'b'), plain('\nAfter', 'end')] });
  await createBoardRepository(db).organizeMessages('b', [id], 'c');
  await createSpaceRepository(db).stick('thought', id, 'desk');
  const before = await messages.getActiveById(id);
  const backup = await service.createBackup(db);
  const checked = await service.validateBackup(backup.uri);
  assert.equal(checked.valid, true);
  await service.restoreBackup(checked, db);
  const restored = await env.sqlite.openDatabaseAsync('chits.db');
  const repository = createMessageRepository(restored);
  const reopened = await repository.getActiveById(id);
  assert.deepEqual(reopened.content, before.content);
  const space = await createSpaceRepository(restored).readNote('thought', id);
  assert.equal(noteChecklistSummary(space.thoughts[0].content).completed, 1);
  const summary = (await repository.listChecklistSummaries())[0];
  assert.equal(summary.cardId !== null, true);
  assert.deepEqual(noteChecklistSummary(summary.content).remaining, ['Todo']);
  await createAttachmentRepository(restored).delete(reopened.attachments[0]);
  const withoutPhoto = await repository.getActiveById(id);
  assert.equal(noteChecklistSummary(withoutPhoto.content).completed, 1);
  assert.equal(noteChecklistSummary(withoutPhoto.content).total, 2);
  assert.deepEqual(withoutPhoto.content.filter((block) => block.type === 'text').map((block) => block.text), ['Title\n', 'Done', 'Todo', '\nAfter']);
  assert.equal(restored.raw.prepare('PRAGMA foreign_key_check').all().length, 0);
});
