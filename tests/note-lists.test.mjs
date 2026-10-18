import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleNoteList, editNoteListItem } from '../src/services/note-lists.ts';
import { draftFromNote, insertImageAtCursor, noteListMarkers, noteRenderContent, parseNoteContent, removeImageBlock, serializeNoteContent } from '../src/services/note-content.ts';
import { buildShareNoteSource, paginateInlineShare } from '../src/services/share-note.ts';
import { classifyMessage } from '../src/components/chat/message-presentation.ts';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';

const plain = (text, key = 't') => ({ key, type: 'text', text });
const item = (text, key = 't', kind = 'numbered', id = 'list') => ({ ...plain(text, key), list: { kind, id } });
const image = { key: 'i', type: 'image', attachmentId: null, image: { storagePath: 'chits-attachments/chat/list.jpg', originalName: 'list.jpg', mimeType: 'image/jpeg', size: 9, width: 800, height: 600 } };
const cursor = (start, end = start, key = 't') => ({ key, start, end });
const textOf = (blocks) => blocks.filter((block) => block.type === 'text').map((block) => block.text);

test('current paragraph converts at beginning, middle and end without touching adjacent paragraphs', () => {
  for (const kind of ['bullet', 'numbered']) {
    for (const position of [6, 8, 10]) {
      const result = toggleNoteList([plain('Title\nMilk\nFooter')], cursor(position), kind);
      assert.deepEqual(textOf(result.blocks), ['Title', 'Milk', 'Footer']);
      assert.equal(result.blocks[1].list.kind, kind);
      assert.equal(result.blocks[0].list, undefined);
      assert.equal(result.blocks[2].list, undefined);
    }
  }
});

test('selected paragraphs become structural items, and selection ending on the next line excludes it', () => {
  const result = toggleNoteList([plain('Intro\nMilk\nEggs\nCoffee\nEnd')], cursor(6, 22), 'bullet');
  assert.deepEqual(textOf(result.blocks), ['Intro', 'Milk', 'Eggs', 'Coffee', 'End']);
  assert.deepEqual(noteListMarkers(result.blocks), [null, '•', '•', '•', null]);
  assert.equal(new Set(result.blocks.filter((block) => block.list).map((block) => block.list.id)).size, 1);
  const boundary = toggleNoteList([plain('First\nSecond\nThird')], cursor(0, 6), 'numbered');
  assert.deepEqual(textOf(boundary.blocks), ['First', 'Second\nThird']);
});

test('a leading blank paragraph converts without consuming the paragraph after it', () => {
  const result = toggleNoteList([plain('\nAfter')], cursor(0), 'bullet');
  assert.deepEqual(textOf(result.blocks), ['', 'After']);
  assert.equal(result.blocks[0].list.kind, 'bullet');
  assert.equal(result.blocks[1].list, undefined);
});

test('empty paragraphs begin a list, Enter continues, and Enter on an empty item exits', () => {
  for (const kind of ['bullet', 'numbered']) {
    const started = toggleNoteList([plain('')], cursor(0), kind);
    assert.equal(started.blocks[0].list.kind, kind);
    const typed = editNoteListItem(started.blocks, 't', 'Hello');
    const continued = editNoteListItem(typed.blocks, 't', 'Hello\n');
    assert.deepEqual(textOf(continued.blocks), ['Hello', '']);
    assert.deepEqual(noteListMarkers(continued.blocks), kind === 'bullet' ? ['•', '•'] : ['1.', '2.']);
    const exited = editNoteListItem(continued.blocks, continued.cursor.key, '\n');
    assert.equal(exited.blocks[1].list, undefined);
    assert.deepEqual(exited.cursor, { key: exited.blocks[1].key, start: 0, end: 0 });
  }
});

test('Enter in the middle of an item splits its text and focuses the new item', () => {
  const result = editNoteListItem([item('Hello world')], 't', 'Hello\n world');
  assert.deepEqual(textOf(result.blocks), ['Hello', ' world']);
  assert.equal(result.cursor.key, result.blocks[1].key);
  assert.equal(result.cursor.start, 0);
});

test('multiline paste creates multiple items and leaves following text at the correct caret', () => {
  const result = editNoteListItem([item('Before After')], 't', 'Before One\nTwo\nThree After', cursor(6));
  assert.deepEqual(textOf(result.blocks), ['Before One', 'Two', 'Three After']);
  assert.deepEqual(noteListMarkers(result.blocks), ['1.', '2.', '3.']);
  assert.equal(result.cursor.start, 5);
});

test('switching kinds changes the logical list including items separated by images', () => {
  const result = toggleNoteList([item('One'), image, item('Two', 't2')], cursor(1), 'bullet');
  assert.deepEqual(noteListMarkers(result.blocks), ['•', null, '•']);
  assert.equal(result.blocks[1], image);
});

test('toggling off and removing empty-item formatting preserve surrounding words and caret', () => {
  const result = toggleNoteList([item('Milk'), item('Eggs', 't2')], cursor(2), 'numbered');
  assert.deepEqual(textOf(result.blocks), ['Milk', 'Eggs']);
  assert.equal(result.blocks[0].list, undefined);
  assert.equal(result.cursor.start, 2);
  const unlisted = toggleNoteList(result.blocks, cursor(0, 0, 't2'), 'numbered');
  assert.deepEqual(textOf(unlisted.blocks), ['Milk\nEggs']);
  const empty = toggleNoteList([item('')], cursor(0), 'numbered');
  assert.equal(empty.blocks[0].list, undefined);
});

test('numbering recalculates after item insertion, deletion and reorder and restarts for another list', () => {
  const blocks = [item('One'), image, item('Two', 't2'), item('New list', 't3', 'numbered', 'other')];
  assert.deepEqual(noteListMarkers(blocks), ['1.', null, '2.', '1.']);
  assert.deepEqual(noteListMarkers([blocks[2], blocks[1], blocks[0], blocks[3]]), ['1.', null, '2.', '1.']);
  assert.deepEqual(noteListMarkers(blocks.slice(1)), [null, '1.', '1.']);
  const inserted = editNoteListItem(blocks, 't', 'One\nInserted');
  assert.deepEqual(noteListMarkers(inserted.blocks), ['1.', '2.', null, '3.', '1.']);
});

test('inline insertion within list text preserves both halves and list identity', () => {
  const result = insertImageAtCursor([item('Before after')], cursor(6), image);
  assert.deepEqual(textOf(result.blocks), ['Before', ' after']);
  assert.deepEqual(noteListMarkers(result.blocks), ['1.', null, '2.']);
  const removed = removeImageBlock(result.blocks, 'i');
  assert.deepEqual(textOf(removed), ['Before', ' after']);
  assert.deepEqual(noteListMarkers(removed), ['1.', '2.']);
});

test('list-only content serializes without prefixes and reopens with formatting, including an empty item', () => {
  const blocks = [item('Milk'), item('Eggs', 't2'), item('', 't3')];
  const stored = parseNoteContent(serializeNoteContent(blocks));
  assert.deepEqual(stored.map((block) => block.text), ['Milk', 'Eggs', '']);
  const draft = draftFromNote({ text: 'preview', content: stored, attachments: [] });
  assert.deepEqual(textOf(draft), ['Milk', 'Eggs', '']);
  assert.deepEqual(noteListMarkers(draft), ['1.', '2.', '3.']);
  assert.ok(noteRenderContent({ text: 'preview', content: stored, attachments: [] }));
  assert.equal(serializeNoteContent([plain('Old plain note')]), null);
  assert.equal(parseNoteContent('[{"type":"text","text":"old","list":{"kind":"invalid","id":"x"}}]'), null);
});

test('Share Note preserves item markers across image positions and page boundaries', () => {
  const source = buildShareNoteSource({ messages: [{ text: 'preview', content: [item('Long '.repeat(400)), item('Second', 't2')], attachments: [] }] });
  const pages = paginateInlineShare(source.blocks);
  assert.ok(pages.length > 1);
  const blocks = pages.flat();
  assert.deepEqual(blocks.filter((block) => block.marker).map((block) => block.marker), ['1.', '2.']);
  assert.equal(blocks.map((block) => block.text).join(''), 'Long '.repeat(400) + 'Second');
});

const { createMessageRepository, createBoardRepository, createSpaceRepository } = await loadModule('src/db/repositories');
const { saveChatComposer, readChatDraft, writeChatDraft } = await loadModule('src/services/chat-composer');
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec("INSERT INTO boards (id,name,created_at,updated_at) VALUES ('board','Ideas',1,1); INSERT INTO board_columns (id,board_id,name,position,created_at,updated_at) VALUES ('column','board','Inbox',0,1,1)");
  return { env, db, messages: createMessageRepository(db) };
}

test('list-only Chat saves and unsent drafts retain list metadata across reopening', async (t) => {
  const { db, messages } = await fixture(t);
  const blocks = [item('First'), item('Second', 't2')];
  await writeChatDraft(db, 'First\nSecond', null, serializeNoteContent(blocks));
  const restored = await readChatDraft(db, messages);
  assert.equal(restored.editing, null);
  assert.deepEqual(restored.content.map((block) => block.list.kind), ['numbered', 'numbered']);
  const saved = await saveChatComposer(messages, { text: 'fallback', editing: null, attachment: null, blocks });
  assert.deepEqual(saved.content.map((block) => block.list.kind), ['numbered', 'numbered']);
  assert.equal(classifyMessage(saved), 'rich-note', 'submitted list-only messages must use Chat’s rich renderer');
  const edited = await messages.updateContent(saved.id, [item('Updated')]);
  assert.deepEqual(edited.removablePaths, []);
  const reopened = await messages.getActiveById(saved.id);
  assert.equal(reopened.content[0].list.kind, 'numbered');
  assert.equal(classifyMessage(reopened), 'rich-note');
  await assert.rejects(messages.updateText(saved.id, 'Flattened'), /note editor/);
});

test('Chat routes bullet and numbered notes by their structured content, preserving plain-text presentation', () => {
  for (const kind of ['bullet', 'numbered']) {
    for (const text of ['One', 'One\n\nTwo', 'Long paragraph '.repeat(30)]) {
      const note = { text, attachments: [], content: [item('One', 't', kind), item('Two', 't2', kind)] };
      assert.equal(classifyMessage(note), 'rich-note');
      const rendered = noteRenderContent(note);
      assert.deepEqual(noteListMarkers(rendered.blocks), kind === 'bullet' ? ['•', '•'] : ['1.', '2.']);
    }
  }
  assert.equal(classifyMessage({ text: 'A short thought', attachments: [] }), 'quick-thought');
  assert.equal(classifyMessage({ text: 'Long paragraph '.repeat(30), attachments: [] }), 'note');
  assert.equal(classifyMessage({ text: '• One\n• Two', attachments: [] }), 'structured-note');
});

test('lists and images survive Board/Space transfers, backup, restore and safe photo removal', async (t) => {
  const { env, db, messages } = await fixture(t);
  env.write(image.image.storagePath, 'list-file');
  const id = await messages.createNote({ blocks: [plain('Title\n'), item('One'), image, item('Two', 't2'), plain('\nAfter', 'tail')] });
  await createBoardRepository(db).organizeMessages('board', [id], 'column');
  await createSpaceRepository(db).stick('thought', id, 'desk');
  const before = await messages.getActiveById(id);
  const backup = await service.createBackup(db);
  const checked = await service.validateBackup(backup.uri);
  assert.equal(checked.valid, true);
  await service.restoreBackup(checked, db);
  const restored = await env.sqlite.openDatabaseAsync('chits.db');
  const repository = createMessageRepository(restored);
  const after = await repository.getActiveById(id);
  assert.deepEqual(after.content, before.content);
  assert.deepEqual(noteListMarkers(after.content), [null, '1.', null, '2.', null]);
  assert.deepEqual(noteListMarkers((await createSpaceRepository(restored).readNote('thought', id)).thoughts[0].content), [null, '1.', null, '2.', null]);
  const { createAttachmentRepository } = await loadModule('src/db/repositories');
  await createAttachmentRepository(restored).delete(after.attachments[0]);
  const withoutImage = await repository.getActiveById(id);
  assert.deepEqual(noteListMarkers(withoutImage.content), [null, '1.', '2.', null]);
  assert.equal(restored.raw.prepare('PRAGMA foreign_key_check').all().length, 0);
});
