import assert from 'node:assert/strict';
import test from 'node:test';
import { continueNoteParagraph, formatRange, marksAt, noteTitle, replaceNoteText, setNoteHeading, splitNoteHeading, withNoteTitle } from '../src/services/note-rich-text.ts';
import { draftContentForStorage, draftFromNote, insertImageAtCursor, noteBlocksText, noteRenderContent, parseNoteContent, serializeNoteContent, textDraft } from '../src/services/note-content.ts';
import { backspaceNoteBlock, editNoteListItem, toggleNoteList } from '../src/services/note-lists.ts';
import { buildShareNoteSource, paginateInlineShare } from '../src/services/share-note.ts';
import { createNoteEditHistory } from '../src/services/note-edit-history.ts';
import { classifyMessage } from '../src/components/chat/message-presentation.ts';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const plain = (text, key = 'body') => ({ key, type: 'text', text });
const at = (start, end = start, key = 'body') => ({ key, start, end });
const body = blocks => blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');

test('Chat uses the shared rich reader for titles, headings and marks without attachments', () => {
  for (const block of [{ ...plain('Body'), title: 'Title' }, { ...plain('Heading'), heading: 1 }, formatRange(plain('Marked'), 0, 6, { bold: true })]) {
    assert.equal(classifyMessage({ text: block.text, content: [block], attachments: [] }), 'rich-note');
  }
});

test('optional title is metadata, can be cleared, and never rewrites body words', () => {
  const blocks = withNoteTitle([plain('First meaningful line\nMore')], 'My title');
  assert.equal(blocks[0].text, 'First meaningful line\nMore');
  assert.equal(noteTitle(blocks), 'My title');
  assert.equal(noteBlocksText(blocks), 'My title\n\nFirst meaningful line\nMore');
  const restored = draftFromNote({ text: noteBlocksText(blocks), content: parseNoteContent(draftContentForStorage(blocks)), attachments: [] });
  assert.equal(noteTitle(restored), 'My title');
  assert.equal(restored[0].text, blocks[0].text);
  assert.equal(draftContentForStorage(withNoteTitle(restored, '')), null);
  assert.equal(draftContentForStorage(textDraft()), null);
});

test('mixed inline formats overlap, toggle independently and survive serialization', () => {
  let block = formatRange(plain('Hello colorful world'), 0, 5, { bold: true });
  block = formatRange(block, 3, 15, { italic: true, color: 'purple', highlight: 'yellow' });
  block = formatRange(block, 0, 15, { underline: true });
  block = formatRange(block, 3, 5, { bold: false });
  const saved = parseNoteContent(serializeNoteContent([block]));
  assert.deepEqual(saved[0].spans, block.spans);
  assert.deepEqual(marksAt(saved[0], 0, 3), { bold: true, underline: true });
  assert.deepEqual(marksAt(saved[0], 3, 5), { italic: true, underline: true, color: 'purple', highlight: 'yellow' });
  assert.equal(saved[0].text, 'Hello colorful world');
});

test('active marks intersect all spans in a mixed-color selection', () => {
  let block = formatRange(plain('Red Blue'), 0, 8, { bold: true });
  block = formatRange(block, 0, 3, { color: 'red' });
  block = formatRange(block, 4, 8, { color: 'blue' });
  assert.deepEqual(marksAt(block, 0, 8), { bold: true });
  assert.deepEqual(marksAt(block, 0, 3), { bold: true, color: 'red' });
  assert.deepEqual(marksAt(block, 0, 9), {});
});

test('removing a list from an explicit paragraph never concatenates neighboring words', () => {
  const original = [plain('Before', 'before'), { ...plain('Middle'), paragraph: true }, plain('After', 'after')];
  const listed = toggleNoteList(original, at(2), 'bullet');
  const normal = toggleNoteList(listed.blocks, listed.cursor, 'bullet');
  const reopened = draftFromNote({ text: noteBlocksText(normal.blocks), content: parseNoteContent(draftContentForStorage(normal.blocks)), attachments: [] });
  assert.equal(body(reopened), 'Before\nMiddle\nAfter');
});

test('structural Backspace removes a heading before merging its paragraph', () => {
  const block = { ...plain('Heading'), heading: 1, paragraph: true };
  const result = backspaceNoteBlock([block], at(0));
  assert.equal(result.blocks[0].heading, undefined);
  assert.equal(result.blocks[0].text, 'Heading');
  assert.deepEqual(result.cursor, at(0));
});

test('typing at a collapsed caret inherits marks or explicit pending marks', () => {
  const block = { ...formatRange(plain('Hello'), 0, 5, { bold: true }), key: 'body' };
  const typed = replaceNoteText(block, 'Hello!', undefined, at(5));
  assert.equal(marksAt(typed, 5, 6).bold, true);
  const normal = replaceNoteText(typed, 'Hello! plain', {}, at(6));
  assert.deepEqual(marksAt(normal, 6, normal.text.length), {});
  const colored = replaceNoteText(normal, 'Hello! plain red', { color: 'red' }, at(normal.text.length));
  assert.equal(marksAt(colored, 12, colored.text.length).color, 'red');
});

test('range replacement, emoji deletion and multiline paste retain unaffected spans', () => {
  const block = formatRange(plain('😀 hello world'), 9, 14, { color: 'green', underline: true });
  const deleted = replaceNoteText(block, ' hello world', {}, at(0, 2));
  assert.equal(deleted.text, ' hello world');
  assert.deepEqual(deleted.spans, [{ start: 7, end: 12, marks: { underline: true, color: 'green' } }]);
  const pasted = replaceNoteText(deleted, 'One\nTwo world', {}, at(0, 6));
  assert.equal(pasted.text, 'One\nTwo world');
  assert.equal(marksAt(pasted, 8, 13).color, 'green');
});

test('heading formatting targets paragraphs, and reverting to normal preserves their boundaries', () => {
  const blocks = [plain('Before\nHeading\nAfter')];
  const heading = setNoteHeading(blocks, at(10), 1);
  assert.equal(body(heading.blocks), blocks[0].text);
  assert.deepEqual(heading.blocks.map(b => b.heading ?? 0), [0, 1, 0]);
  const normal = setNoteHeading(heading.blocks, heading.cursor, 0);
  const reopened = draftFromNote({ text: noteBlocksText(normal.blocks), content: parseNoteContent(draftContentForStorage(normal.blocks)), attachments: [] });
  assert.equal(body(reopened), blocks[0].text);
  assert.deepEqual(reopened.map(b => b.heading ?? 0), [0, 0, 0]);
});

test('a selected range of headings becomes independent paragraphs that retain their styles while typing', () => {
  const selected = setNoteHeading([plain('Before\nOne\nTwo\nAfter')], at(7, 14), 2);
  assert.equal(body(selected.blocks), 'Before\nOne\nTwo\nAfter');
  assert.deepEqual(selected.blocks.map(b => b.heading ?? 0), [0, 2, 2, 0]);
  const first = selected.blocks[1];
  assert.equal(replaceNoteText(first, 'One more').heading, 2);
  assert.equal(selected.blocks[2].heading, 2);
});

test('heading Enter produces a normal following paragraph and an exact caret', () => {
  const block = { ...formatRange(plain('Hello world'), 0, 11, { bold: true }), key: 'body', heading: 2, title: 'Title' };
  const updated = replaceNoteText(block, 'Hello\n world', undefined, at(5));
  const split = splitNoteHeading([block], updated, at(5));
  assert.deepEqual(split.blocks.map(b => b.heading ?? 0), [2, 0]);
  assert.equal(split.cursor.start, 0);
  assert.equal(noteTitle(split.blocks), 'Title');
  assert.equal(marksAt(split.blocks[1], 0, 6).bold, true);
});

test('queued native keystrokes after heading Enter update one paragraph without duplication', () => {
  const block = { ...plain('Heading'), heading: 1 };
  const split = splitNoteHeading([block], { ...block, text: 'Heading\n' }, at(7));
  let continuation = { sourceKey: 'body', targetKey: split.cursor.key, prefix: 'Heading\n', nativeValue: 'Heading\n', caret: 0 };
  let blocks = split.blocks;
  for (const text of ['n', 'ne', 'nex', 'next']) {
    const edit = continueNoteParagraph(blocks, 'body', 'Heading\n' + text, continuation, { italic: true, color: 'green' });
    assert.ok(edit);
    blocks = edit.blocks; continuation = edit.continuation;
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].text, 'Heading');
    assert.equal(blocks[1].text, text);
    assert.equal(edit.cursor.start, text.length);
    assert.equal(marksAt(blocks[1], 0, text.length).color, 'green');
  }
  assert.equal(continueNoteParagraph(blocks, 'body', 'A deliberate heading edit', continuation), null);
});

test('lists preserve spans when splitting, pasting, unformatting and merging', () => {
  const original = withNoteTitle([{ ...formatRange(plain('Before\nRed item\nAfter'), 7, 15, { color: 'red' }), key: 'body' }], 'Title');
  let edit = toggleNoteList(original, at(9), 'numbered');
  assert.equal(noteTitle(edit.blocks), 'Title');
  const item = edit.blocks.find(b => b.list);
  assert.equal(marksAt(item, 0, item.text.length).color, 'red');
  edit = editNoteListItem(edit.blocks, item.key, 'Red\n item', { key: item.key, start: 3, end: 3 });
  const items = edit.blocks.filter(b => b.list);
  assert.equal(items.length, 2);
  assert.equal(marksAt(items[1], 0, items[1].text.length).color, 'red');
  edit = toggleNoteList(edit.blocks, at(0, 0, items[1].key), 'numbered');
  const joined = backspaceNoteBlock(edit.blocks, at(0, 0, items[1].key));
  assert.equal(noteTitle(joined.blocks), 'Title');
  assert.ok(joined.blocks.some(b => b.type === 'text' && b.spans?.some(s => s.marks.color === 'red')));
});

test('image insertion splits spans without dropping selected words, titles or saved image ids', () => {
  const block = { ...formatRange(plain('BeforeAfter'), 0, 11, { italic: true }), key: 'body', title: 'Title' };
  const image = { key: 'image', type: 'image', attachmentId: 'photo', image: { storagePath: 'chits-attachments/photo.jpg' } };
  const edit = insertImageAtCursor([block], at(6, 10), image);
  assert.deepEqual(edit.blocks.map(b => b.type === 'text' ? b.text : b.attachmentId), ['Before', 'photo', 'After']);
  assert.equal(marksAt(edit.blocks[2], 0, 5).italic, true);
  assert.equal(noteTitle(edit.blocks), 'Title');
});

test('invalid marks and out of bounds spans are sanitized and legacy content stays editable', () => {
  const parsed = parseNoteContent(JSON.stringify([{ type: 'text', text: 'Words', heading: 99, spans: [{ start: -1, end: 500, marks: { color: 'url(javascript:bad)', bold: true, highlight: 'cyan' } }] }]));
  assert.deepEqual(parsed[0].spans, [{ start: 0, end: 5, marks: { bold: true, highlight: 'cyan' } }]);
  assert.equal(parsed[0].heading, undefined);
  assert.equal(draftFromNote({ text: 'Legacy plain note', content: null, attachments: [] })[0].text, 'Legacy plain note');
});

test('undo and redo retain immutable title and span snapshots', () => {
  const history = createNoteEditHistory();
  const first = { blocks: [plain('Words')], cursor: at(0, 5) };
  const next = { blocks: withNoteTitle([{ ...formatRange(first.blocks[0], 0, 5, { bold: true }), key: 'body' }], 'Title'), cursor: at(5) };
  history.record(first);
  assert.deepEqual(history.travel('undo', next), first);
  assert.deepEqual(history.travel('redo', first), next);
  assert.equal(first.blocks[0].spans, undefined);
});

test('Share Note page boundaries preserve every UTF-16 span offset and title once', () => {
  const text = 'Word '.repeat(600);
  const block = { ...formatRange(plain(text), 0, text.length, { color: 'blue', highlight: 'pink' }), title: 'Long note' };
  const source = buildShareNoteSource({ messages: [{ text: 'Long note\n\n' + text, content: [block], attachments: [] }] });
  const pages = paginateInlineShare(source.blocks).flat();
  assert.equal(pages.map(b => b.text).join(''), text);
  assert.equal(pages.filter(b => b.title).length, 1);
  for (const part of pages) assert.equal(marksAt(part, 0, part.text.length).color, 'blue');
});

test('title-only content remains present in Share Note pagination', () => {
  const source = buildShareNoteSource({ messages: [{ text: 'Just a title', content: [{ type: 'text', text: '', title: 'Just a title' }], attachments: [] }] });
  const pages = paginateInlineShare(source.blocks);
  assert.equal(pages.length, 1);
  assert.equal(pages[0][0].title, 'Just a title');
});

test('replacing a styled selection inherits its marks without touching the prefix', () => {
  const original = formatRange(plain('Plain styled'), 6, 12, { bold: true, color: 'red' });
  const replaced = replaceNoteText(original, 'Plain replacement', undefined, at(6, 12));
  assert.equal(marksAt(replaced, 6, 17).color, 'red');
  assert.deepEqual(marksAt(replaced, 0, 6), {});
});

const { createMessageRepository } = await loadModule('src/db/repositories');
const { saveChatComposer, writeChatDraft, readChatDraft } = await loadModule('src/services/chat-composer');
test('SQLite save, close/reopen, formatting-only update and Chat draft retain rich metadata', async t => {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('rich.db'); await migration.migrateDatabase(db);
  const repo = createMessageRepository(db);
  const blocks = withNoteTitle([{ ...formatRange(plain('Mixed formatting'), 0, 5, { bold: true, highlight: 'green' }), key: 'body', heading: 1 }], 'Optional title');
  const saved = await saveChatComposer(repo, { text: '', editing: null, attachment: null, blocks });
  assert.equal(saved.text, 'Optional title\n\nMixed formatting');
  assert.equal(saved.content[0].title, 'Optional title');
  assert.equal(saved.content[0].heading, 1);
  const draft = draftFromNote(saved);
  const changed = draft.map(b => b.type === 'text' ? { ...formatRange(b, 6, b.text.length, { italic: true, color: 'rose' }), key: b.key } : b);
  await repo.updateContent(saved.id, changed);
  const connection = await env.sqlite.openDatabaseAsync('rich.db');
  const reopened = await createMessageRepository(connection).getActiveById(saved.id);
  assert.equal(reopened.content[0].spans[1].marks.color, 'rose');
  assert.ok(noteRenderContent(reopened));
  await writeChatDraft(db, noteBlocksText(changed), null, draftContentForStorage(changed));
  assert.deepEqual((await readChatDraft(db, repo)).content, reopened.content);
  await assert.rejects(repo.updateText(saved.id, 'Flatten'), /note editor/);
});

test('a title-only note saves without adding that title to body text', async t => {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('rich.db'); await migration.migrateDatabase(db);
  const repo = createMessageRepository(db);
  const saved = await saveChatComposer(repo, { text: '', editing: null, attachment: null, blocks: withNoteTitle([plain('')], 'Just a title') });
  assert.equal(saved.content[0].text, '');
  assert.equal(saved.content[0].title, 'Just a title');
  assert.equal(saved.text, 'Just a title');
});
