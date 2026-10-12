import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  draftFromNote, ensureEditableText, imageFingerprint, imageRows, insertImageAtCursor, noteBlocksText, noteRenderContent,
  parseNoteContent, removeImageBlock, serializeNoteContent,
} from '../src/services/note-content.ts';
import { buildShareNoteSource, paginateInlineShare } from '../src/services/share-note.ts';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createAttachmentRepository, createBoardRepository, createMessageRepository, createSpaceRepository } = await loadModule('src/db/repositories');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const photo = (id, width = 1200, height = 900) => ({ id, messageId: 'm', type: 'photo', storagePath: `chits-attachments/chat/${id}.jpg`, originalName: 'Pasted image.jpg', mimeType: 'image/jpeg', size: 10, duration: null, width, height, createdAt: 1 });
const pasted = (key, path = `chits-attachments/chat/${key}.jpg`) => ({ key, type: 'image', attachmentId: null, image: { storagePath: path, originalName: 'Pasted image.jpg', mimeType: 'image/jpeg', size: 10, width: 800, height: 600 } });

test('content is stored only for notes with images, as ordered references — never image data', () => {
  assert.equal(serializeNoteContent([{ type: 'text', text: 'Just words' }]), null);
  const json = serializeNoteContent([{ type: 'text', text: ' Meeting notes ' }, { type: 'image', attachmentId: 'a' }, { type: 'text', text: '' }, { type: 'text', text: 'Update the design above.' }, { type: 'image', attachmentId: 'b' }]);
  assert.deepEqual(JSON.parse(json), [{ type: 'text', text: ' Meeting notes ' }, { type: 'image', attachmentId: 'a' }, { type: 'text', text: 'Update the design above.' }, { type: 'image', attachmentId: 'b' }]);
  assert.deepEqual(parseNoteContent(json), JSON.parse(json));
  // Damaged or text-only content reads as a plain note.
  assert.equal(parseNoteContent('not json'), null);
  assert.equal(parseNoteContent('[{"type":"text","text":"x"}]'), null);
  assert.equal(noteBlocksText(parseNoteContent(json)), 'Meeting notes\n\nUpdate the design above.');
});

test('pasting splits the text at the cursor and removing the image joins it back', () => {
  const start = [{ key: 't', type: 'text', text: 'Meeting notes Please update' }];
  const { blocks, cursor } = insertImageAtCursor(start, { key: 't', start: 13, end: 13 }, pasted('i1'));
  assert.deepEqual(blocks.map((block) => block.type === 'text' ? block.text : block.key), ['Meeting notes', 'i1', ' Please update']);
  assert.equal(cursor.key, blocks[2].key);
  // A second paste lands where the cursor now is: right after the first image.
  const second = insertImageAtCursor(blocks, cursor, pasted('i2'));
  assert.deepEqual(second.blocks.map((block) => block.type === 'text' ? block.text : block.key), ['Meeting notes', 'i1', '', 'i2', ' Please update']);
  const removed = removeImageBlock(second.blocks, 'i1');
  assert.deepEqual(removed.map((block) => block.type === 'text' ? block.text : block.key), ['Meeting notes', 'i2', ' Please update']);
  // With no cursor an image goes at the end, with room to keep typing after it.
  const appended = insertImageAtCursor(start, null, pasted('i3'));
  assert.deepEqual(appended.blocks.map((block) => block.type), ['text', 'image', 'text']);
  assert.deepEqual(ensureEditableText([pasted('x')]).map((block) => block.type), ['text', 'image', 'text']);
});

test('rendering keeps the written order, skips missing images and leads with attachments that are not inline', () => {
  const note = {
    text: 'Meeting notes\n\nFinal reference',
    content: [{ type: 'text', text: 'Meeting notes' }, { type: 'image', attachmentId: 'p1' }, { type: 'image', attachmentId: 'gone' }, { type: 'text', text: 'Final reference' }, { type: 'image', attachmentId: 'p2' }],
    attachments: [photo('picked'), photo('p1'), photo('p2')],
  };
  const rendered = noteRenderContent(note);
  assert.deepEqual(rendered.blocks.map((block) => block.type === 'text' ? block.text : block.attachment.id), ['Meeting notes', 'p1', 'Final reference', 'p2']);
  assert.deepEqual(rendered.leading.map((attachment) => attachment.id), ['picked']);
  // Every image gone (e.g. deleted from the library): falls back to a plain note.
  assert.equal(noteRenderContent({ ...note, attachments: [] }), null);
  assert.equal(noteRenderContent({ text: 'old', content: null, attachments: [photo('x')] }), null);
});

test('a note saved before inline images opens photos-first, and an inline note keeps a picked photo', () => {
  const legacy = draftFromNote({ text: 'Caption', content: null, attachments: [photo('old')] });
  assert.deepEqual(legacy.map((block) => block.type === 'text' ? block.text : block.attachmentId), ['', 'old', 'Caption']);
  const inline = draftFromNote({ text: 'A', content: [{ type: 'text', text: 'A' }, { type: 'image', attachmentId: 'p1' }], attachments: [photo('picked'), photo('p1')] });
  assert.deepEqual(inline.filter((block) => block.type === 'image').map((block) => block.attachmentId), ['picked', 'p1']);
});

test('image rows keep every image at its own proportions within the width and height cap', () => {
  const [row] = imageRows([{ width: 1600, height: 900 }, { width: 900, height: 1600 }], 300, 4, 400);
  assert.equal(row.indexes.length, 2);
  assert.ok(row.widths.reduce((sum, width) => sum + width, 0) + 4 <= 300);
  assert.ok(Math.abs(row.widths[0] / row.height - 16 / 9) < 0.05);
  assert.ok(Math.abs(row.widths[1] / row.height - 9 / 16) < 0.05);
  // A very tall image is capped, and narrows rather than stretching.
  const [tall] = imageRows([{ width: 500, height: 5000 }], 300, 4, 360);
  assert.equal(tall.height, 360);
  assert.ok(tall.widths[0] < 300);
  // A tiny paste is never blown up past its real size.
  assert.equal(imageRows([{ width: 40, height: 20 }], 300, 4, 360)[0].height, 20);
  // Odd one out gets a row to itself.
  assert.deepEqual(imageRows([{ width: 1, height: 1 }, { width: 1, height: 1 }, { width: 1, height: 1 }], 300, 4, 400).map((r) => r.indexes.length), [2, 1]);
});

test('the same clipboard data gives the same fingerprint, different data a different one', () => {
  const data = 'iVBORw0KGgo'.repeat(5000);
  assert.equal(imageFingerprint(data), imageFingerprint(`${data}`));
  assert.notEqual(imageFingerprint(data), imageFingerprint(`${data}A`));
});

test('Share Note uses a note\'s images in the order the note reads', () => {
  const source = buildShareNoteSource({ messages: [{ text: 'A', content: [{ type: 'image', attachmentId: 'second' }, { type: 'image', attachmentId: 'first' }], attachments: [photo('first'), photo('second')] }] });
  assert.deepEqual(source.images.map((image) => image.id), ['second', 'first']);
});

async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec(`
    INSERT INTO boards (id, name, created_at, updated_at) VALUES ('board', 'Home', 1, 1);
    INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('column', 'board', 'To do', 1, 1, 1);
  `);
  return { env, db, messages: createMessageRepository(db), boards: createBoardRepository(db), spaces: createSpaceRepository(db) };
}

test('a note with pasted images saves text and images in order, as photo attachments on the note', async (t) => {
  const { db, messages } = await fixture(t);
  const id = await messages.createNote({ blocks: [{ type: 'text', text: 'Meeting notes' }, pasted('a'), { type: 'text', text: 'Please update the design above.' }, pasted('b'), { type: 'text', text: 'Final reference for tomorrow.' }] });
  const note = await messages.getActiveById(id);
  assert.equal(note.type, 'photo');
  assert.equal(note.text, 'Meeting notes\n\nPlease update the design above.\n\nFinal reference for tomorrow.');
  assert.deepEqual(note.attachments.map((attachment) => [attachment.type, attachment.storagePath]), [['photo', 'chits-attachments/chat/a.jpg'], ['photo', 'chits-attachments/chat/b.jpg']]);
  const rendered = noteRenderContent(note);
  assert.deepEqual(rendered.blocks.map((block) => block.type === 'text' ? block.text : block.attachment.storagePath), ['Meeting notes', 'chits-attachments/chat/a.jpg', 'Please update the design above.', 'chits-attachments/chat/b.jpg', 'Final reference for tomorrow.']);
  // No image data is ever stored in the note row itself.
  const row = db.raw.prepare('SELECT content_json FROM messages WHERE id = ?').get(id);
  assert.ok(row.content_json.length < 400);
  assert.doesNotMatch(row.content_json, /base64|data:/);
  // Search still finds the words.
  assert.equal((await messages.searchTimeline('design above')).length, 1);
});

test('a board note can carry pasted images too', async (t) => {
  const { boards, messages } = await fixture(t);
  const { messageId } = await boards.createNoteCard({ boardId: 'board', columnId: 'column', text: '', blocks: [pasted('only')] });
  const note = await messages.getActiveById(messageId);
  assert.equal(note.text, null);
  assert.equal(note.attachments.length, 1);
  assert.ok(noteRenderContent(note));
});

test('editing keeps saved images, adds new ones, and removes only the ones taken out — reporting files to delete', async (t) => {
  const { db, messages } = await fixture(t);
  const id = await messages.createNote({ blocks: [{ type: 'text', text: 'One' }, pasted('a'), { type: 'text', text: 'Two' }, pasted('b')] });
  const draft = draftFromNote(await messages.getActiveById(id));
  const [, imageA, , imageB] = draft;
  assert.equal(imageA.type, 'image');
  // Remove b, add c before a, edit the words.
  const { removablePaths } = await messages.updateContent(id, [{ type: 'text', text: 'One!' }, pasted('c'), imageA, { type: 'text', text: 'Two' }]);
  assert.deepEqual(removablePaths, [imageB.image.storagePath]);
  const note = await messages.getActiveById(id);
  assert.deepEqual(noteRenderContent(note).blocks.map((block) => block.type === 'text' ? block.text : block.attachment.storagePath), ['One!', 'chits-attachments/chat/c.jpg', 'chits-attachments/chat/a.jpg', 'Two']);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM attachments WHERE storage_path = 'chits-attachments/chat/b.jpg'").get().count, 0);
  // Taking every image out leaves a plain text note.
  await messages.updateContent(id, [{ type: 'text', text: 'Only words now' }]);
  const plain = await messages.getActiveById(id);
  assert.deepEqual([plain.type, plain.content, plain.attachments.length], ['text', null, 0]);
});

test('editing an old photo note\'s caption leaves it a plain note, and its video is never touched', async (t) => {
  const { messages } = await fixture(t);
  const old = await messages.createAttachmentMessage({ type: 'photo', storagePath: 'chits-attachments/chat/old.jpg', originalName: 'old.jpg', mimeType: 'image/jpeg', size: 1, duration: null, width: 10, height: 10 }, 'Caption');
  await messages.updateContent(old.id, draftFromNote(await messages.getActiveById(old.id)).map((block) => block.type === 'text' && block.text === 'Caption' ? { ...block, text: 'New caption' } : block));
  const edited = await messages.getActiveById(old.id);
  assert.deepEqual([edited.text, edited.content, edited.attachments.length, edited.type], ['New caption', null, 1, 'photo']);
  const video = await messages.createAttachmentMessage({ type: 'video', storagePath: 'chits-attachments/chat/v.mp4', originalName: 'v.mp4', mimeType: 'video/mp4', size: 1, duration: 1000, width: 10, height: 10 }, null);
  await messages.updateContent(video.id, [{ type: 'text', text: 'About the video' }, pasted('shot')]);
  const mixed = await messages.getActiveById(video.id);
  assert.equal(mixed.type, 'video');
  assert.deepEqual(noteRenderContent(mixed).leading.map((attachment) => attachment.type), ['video']);
});

test('a chat text edit of an inline note never drops its images', async (t) => {
  const { messages } = await fixture(t);
  const id = await messages.createNote({ blocks: [{ type: 'text', text: 'Before' }, pasted('keep')] });
  await messages.updateText(id, 'After');
  const note = await messages.getActiveById(id);
  assert.deepEqual(noteRenderContent(note).blocks.map((block) => block.type === 'text' ? block.text : 'image'), ['After', 'image']);
});

test('on a space, an inline note stays a sticky with its image count, and its sheet shows the content in order', async (t) => {
  const { messages, spaces } = await fixture(t);
  const id = await messages.createNote({ blocks: [{ type: 'text', text: 'Look at this' }, pasted('a'), pasted('b')] });
  await spaces.stick('thought', id, 'fridge');
  const [sticky] = await spaces.list('fridge');
  assert.deepEqual([sticky.media, sticky.imageCount, sticky.text], [null, 2, 'Look at this']);
  const detail = await spaces.readNote('thought', id);
  assert.deepEqual(detail.thoughts[0].content.map((block) => block.type), ['text', 'image', 'image']);
});

test('the editors paste through the shared clipboard service and clean up unsaved pastes', () => {
  const editor = read('src/components/notes/note-blocks-editor.tsx');
  assert.match(editor, /pasteClipboardImage\(\)/);
  assert.match(editor, /export function discardPastedImages/);
  const clipboard = read('src/services/clipboard-image.native.ts');
  // Only reads the image on an explicit paste; availability uses hasImageAsync (no iOS paste prompt).
  assert.match(clipboard, /Clipboard\.hasImageAsync\(\)/);
  assert.match(clipboard, /copyIntoAttachmentStorage\(temporary, 'chat'/);
  assert.match(clipboard, /finally \{\s*await deleteAsync\(temporary/);
  const edit = read('src/app/card/edit-content.native.tsx');
  assert.match(edit, /discardPastedImages\(blocksRef\.current\)/);
  assert.match(edit, /removablePaths\.map\(\(path\) => deleteAttachment\(path\)/);
  const chat = read('src/app/(tabs)/chat.native.tsx');
  assert.match(chat, /if \(selected\.content\) \{[^}]*router\.push\(`\/card\/edit-content\?messageId=/);
  // Chat's composer (docked and full screen) is the same block editor, pasting at the cursor.
  assert.match(chat, /<NoteBlocksEditor\s+ref=\{inputRef\}/);
  assert.match(chat, /useNoteImagePaste\(\{[^}]*editor: fullscreenEditing \? fullscreenInputRef : inputRef/);
  assert.match(chat, /useEffect\(\(\) => \(\) => discardPastedImages\(blocksRef\.current\), \[\]\);/);
  assert.match(read('src/components/chat/fullscreen-composer.tsx'), /<NoteBlocksEditor\s+ref=\{editorRef\}/);
});

test('cursor insertion preserves whitespace and removing the image restores the original text', () => {
  const text = '  before\n\n  after  ';
  const inserted = insertImageAtCursor([{ key: 't', type: 'text', text }], { key: 't', start: 10, end: 10 }, pasted('image'));
  assert.equal(inserted.blocks[0].text + inserted.blocks[2].text, text);
  assert.equal(removeImageBlock(inserted.blocks, 'image')[0].text, text);
  const json = serializeNoteContent(inserted.blocks.map((block) => block.type === 'text' ? block : { type: 'image', attachmentId: 'saved' }));
  const restored = draftFromNote({ text: 'preview', content: parseNoteContent(json), attachments: [photo('saved')] });
  assert.equal(restored.filter((block) => block.type === 'text').map((block) => block.text).join(''), text);
});

test('gallery and clipboard insertion preserve selected text at every cursor boundary', () => {
  for (const text of ['', 'Hello world', 'Before\n\nAfter', '日本 🐾 trip']) {
    for (const start of [0, Math.floor(text.length / 2), text.length]) {
      for (const end of [start, text.length]) {
        const result = insertImageAtCursor([{ key: 'text', type: 'text', text }], { key: 'text', start, end }, pasted('photo'));
        assert.equal(result.blocks[0].text, text.slice(0, start));
        assert.equal(result.blocks[2].text, text.slice(start));
        assert.deepEqual(result.cursor, { key: result.blocks[2].key, start: 0, end: 0 });
        assert.equal(removeImageBlock(result.blocks, 'photo')[0].text, text);
      }
    }
  }
});

test('replacing one repeated saved image keeps its other reference and authored position', async (t) => {
  const { messages } = await fixture(t);
  const id = await messages.createNote({ blocks: [{ type: 'text', text: 'Before\n' }, pasted('old'), { type: 'text', text: '\nAfter' }] });
  const original = await messages.getActiveById(id);
  const savedImage = draftFromNote(original).find((block) => block.type === 'image');
  const result = await messages.updateContent(id, [
    { key: 'before', type: 'text', text: 'Before\n' }, pasted('replacement'),
    { key: 'middle', type: 'text', text: '\nMiddle\n' }, savedImage,
    { key: 'after', type: 'text', text: '\nAfter' },
  ]);
  assert.deepEqual(result.removablePaths, []);
  const saved = await messages.getActiveById(id);
  const restored = draftFromNote(saved);
  assert.deepEqual(restored.map((block) => block.type === 'text' ? block.text : block.image.storagePath), [
    'Before\n', 'chits-attachments/chat/replacement.jpg', '\nMiddle\n', 'chits-attachments/chat/old.jpg', '\nAfter',
  ]);
});

test('extreme image proportions remain accurate', () => {
  for (const [width, height] of [[10000, 100], [100, 10000]]) {
    const [row] = imageRows([{ width, height }], 300, 4, 360);
    assert.ok(Math.abs(row.widths[0] / row.height - width / height) <= 1 / row.height);
    assert.ok(row.widths[0] <= 300);
  }
});

test('removing an image never deletes a file still shared by another message or card', async (t) => {
  const { messages, db } = await fixture(t);
  const path = 'chits-attachments/chat/shared.jpg';
  const first = await messages.createNote({ blocks: [{ type: 'text', text: 'First' }, pasted('first', path)] });
  const second = await messages.createNote({ blocks: [{ type: 'text', text: 'Second' }, pasted('second', path)] });
  const { removablePaths } = await messages.updateContent(first, [{ type: 'text', text: 'First edited' }]);
  assert.deepEqual(removablePaths, []);
  const secondNote = await messages.getActiveById(second);
  assert.equal(secondNote.attachments[0].storagePath, path);
  // Deleting from the library also removes the inline reference atomically.
  await createAttachmentRepository(db).delete(secondNote.attachments[0]);
  const withoutImage = await messages.getActiveById(second);
  assert.equal(withoutImage.content, null);
  assert.equal(withoutImage.text, 'Second');
  assert.equal(withoutImage.attachments.length, 0);
  assert.equal(db.raw.prepare('PRAGMA foreign_key_check').all().length, 0);
});


test('rich image exports keep mixed reading order across bounded pages without losing words', () => {
  const long = ('日本 🐾\n' + 'Words around images. '.repeat(50)).repeat(8);
  const source = buildShareNoteSource({ messages: [{ text: long, content: [{ type: 'text', text: long }, { type: 'image', attachmentId: 'a' }, { type: 'text', text: 'After image' }, { type: 'image', attachmentId: 'b' }], attachments: [photo('b'), photo('a')] }] });
  assert.deepEqual(source.blocks.filter((block) => block.type === 'image').map((block) => block.image.id), ['a', 'b']);
  const pages = paginateInlineShare(source.blocks);
  assert.ok(pages.length > 1);
  const flat = pages.flat();
  assert.equal(flat.filter((block) => block.type === 'text').map((block) => block.text).join(''), long + 'After image');
  assert.deepEqual(flat.filter((block) => block.type === 'image').map((block) => block.image.id), ['a', 'b']);
});

test('flat text edits preserve the existing image position and reject ambiguous mixed edits atomically', async (t) => {
  const { messages } = await fixture(t);
  const simple = await messages.createNote({ blocks: [pasted('head'), { type: 'text', text: 'Caption' }] });
  await messages.updateText(simple, 'Updated caption');
  assert.deepEqual((await messages.getActiveById(simple)).content.map((block) => block.type), ['image', 'text']);
  const mixed = await messages.createNote({ blocks: [{ type: 'text', text: 'Before' }, pasted('middle'), { type: 'text', text: 'After' }] });
  const before = await messages.getActiveById(mixed);
  await assert.rejects(messages.updateText(mixed, 'Flattened'), /Edit Note/);
  assert.deepEqual(await messages.getActiveById(mixed), before);
});

test('invalid image references and temporary paths fail without replacing saved content', async (t) => {
  const { messages } = await fixture(t);
  const id = await messages.createNote({ blocks: [{ type: 'text', text: 'Keep' }, pasted('saved')] });
  const before = await messages.getActiveById(id);
  const foreign = { ...pasted('foreign'), attachmentId: 'not-owned' };
  await assert.rejects(messages.updateContent(id, [{ type: 'text', text: 'Changed' }, foreign]), /no longer available/);
  await assert.rejects(messages.updateContent(id, [{ type: 'text', text: 'Changed' }, pasted('temporary', 'file:///tmp/image.jpg')]), /Chits storage/);
  assert.deepEqual(await messages.getActiveById(id), before);
});
