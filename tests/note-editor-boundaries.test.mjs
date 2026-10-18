import assert from 'node:assert/strict';
import test from 'node:test';
import { backspaceNoteBlock, editNoteListItem, toggleNoteList } from '../src/services/note-lists.ts';
import { draftPlainText, draftContentForStorage, draftFromNote, parseNoteContent } from '../src/services/note-content.ts';
import { createNoteEditHistory } from '../src/services/note-edit-history.ts';

const plain = (key, text) => ({ key, type: 'text', text });
const item = (key, text, kind, checked = false) => ({ ...plain(key, text), list: kind === 'checklist' ? { kind, id: 'g', checked } : { kind, id: 'g' } });
const at = (key, start = 0, end = start) => ({ key, start, end });

for (const kind of ['numbered', 'bullet', 'checklist']) {
  test(`${kind}: Backspace first removes formatting, then merges with preceding item`, () => {
    const original = [item('a', 'First😀', kind, true), item('b', 'Second', kind, true)];
    const unformatted = backspaceNoteBlock(original, at('b'));
    assert.equal(unformatted.blocks[1].list, undefined);
    assert.equal(unformatted.blocks[1].text, 'Second');
    assert.deepEqual(unformatted.cursor, at('b'));
    assert.equal(unformatted.blocks[0], original[0]);
    const merged = backspaceNoteBlock(unformatted.blocks, unformatted.cursor);
    assert.equal(merged.blocks.length, 1);
    assert.equal(merged.blocks[0].key, 'b', 'focused input survives the merge');
    assert.equal(merged.blocks[0].text, 'First😀Second');
    assert.deepEqual(merged.blocks[0].list, original[0].list);
    assert.deepEqual(merged.cursor, at('b', 'First😀'.length));
    assert.equal(original[1].list.kind, kind);
  });

  test(`${kind}: Enter exits an empty item and continues a nonempty one`, () => {
    const blocks = [plain('p', 'Intro'), item('b', '', kind), item('c', 'Next', kind, true)];
    const exit = editNoteListItem(blocks, 'b', '\n', at('b'));
    assert.equal(exit.blocks[0].key, 'b');
    assert.equal(exit.blocks[0].list, undefined);
    assert.equal(exit.blocks[0].text, 'Intro\n');
    assert.deepEqual(exit.cursor, at('b', 6));
    assert.equal(exit.blocks[1], blocks[2]);
    const enter = editNoteListItem([item('b', 'AB', kind, true)], 'b', 'A\nB', at('b', 1));
    assert.deepEqual(enter.blocks.map(b => b.text), ['A', 'B']);
    assert.deepEqual(enter.cursor, at(enter.blocks[1].key));
    assert.equal(enter.blocks[1].list.kind, kind);
    if (kind === 'checklist') assert.equal(enter.blocks[1].list.checked, false);
  });
}

test('unformat beside plain text retains a paragraph boundary and focused key', () => {
  const result = backspaceNoteBlock([plain('p', 'Intro'), item('b', 'Task', 'checklist', true), plain('z', 'After')], at('b'));
  assert.deepEqual(result.blocks, [plain('b', 'Intro\nTask\nAfter')]);
  assert.deepEqual(result.cursor, at('b', 6));
  assert.equal(draftPlainText(result.blocks), 'Intro\nTask\nAfter');
  assert.equal(draftContentForStorage(result.blocks), null);
});

test('plain boundary merge consumes the structural separator and retains authored newlines and UTF-16 offsets', () => {
  const original = [plain('p', '👩🏽‍💻中文\n'), plain('q', 'Next\nAfter')];
  const result = backspaceNoteBlock(original, at('q'));
  assert.deepEqual(result.blocks, [plain('q', '👩🏽‍💻中文\nNext\nAfter')]);
  assert.deepEqual(result.cursor, at('q', '👩🏽‍💻中文\n'.length));
});

test('merging a multiline paragraph into a list formats only its first line', () => {
  const result = backspaceNoteBlock([item('a', 'Task', 'checklist', true), plain('b', 'Next\nAfter')], at('b'));
  assert.equal(result.blocks[0].text, 'TaskNext');
  assert.equal(result.blocks[0].list.checked, true);
  assert.equal(result.blocks[1].text, 'After');
  assert.equal(result.blocks[1].list, undefined);
  assert.deepEqual(result.cursor, at('b', 4));
});

test('character, range deletion and the first plain boundary stay native', () => {
  const blocks = [plain('p', '😀AB')];
  for (const cursor of [at('p'), at('p', 2), at('p', 0, 3), null, at('missing')]) {
    const result = backspaceNoteBlock(blocks, cursor);
    assert.equal(result.blocks, blocks);
    assert.equal(result.cursor, null);
  }
});

test('formatting a middle paragraph retains the focused input key', () => {
  const result = toggleNoteList([plain('p', 'Before\nSelected\nAfter')], at('p', 9, 12), 'bullet');
  assert.equal(result.blocks[1].key, 'p');
  assert.deepEqual(result.cursor, at('p', 2, 5));
  assert.equal(result.blocks.map(b => b.text).join('\n'), 'Before\nSelected\nAfter');
});

test('repeated boundary deletes remove consecutive empty blocks without getting stuck', () => {
  let blocks = [plain('p', ''), item('a', '', 'numbered'), item('b', '', 'bullet'), item('c', '', 'checklist')];
  let cursor = at('c');
  for (let step = 0; step < 12; step++) {
    if (cursor.start > 0) {
      blocks = blocks.map(b => b.key === cursor.key ? { ...b, text: b.text.slice(0, cursor.start - 1) + b.text.slice(cursor.start) } : b);
      cursor = at(cursor.key, cursor.start - 1);
      continue;
    }
    const result = backspaceNoteBlock(blocks, cursor);
    blocks = result.blocks;
    cursor = result.cursor ?? cursor;
  }
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, '');
  assert.equal(blocks[0].list, undefined);
});

test('continuous deletion traverses a mixed document and preserves every surviving prefix', () => {
  let blocks = [plain('p', 'Intro\n'), item('a', 'One', 'numbered'), item('b', 'Two', 'bullet'), item('c', 'Done', 'checklist', true), plain('z', 'After')];
  let cursor = at('z', 5);
  for (let step = 0; step < 100; step++) {
    const block = blocks.find(b => b.key === cursor.key);
    if (cursor.start > 0) {
      const position = cursor.start - 1; // ASCII fixture: native character deletion simulated here.
      blocks = blocks.map(b => b === block ? { ...b, text: b.text.slice(0, position) + b.text.slice(cursor.start) } : b);
      cursor = at(block.key, position);
    } else {
      const result = backspaceNoteBlock(blocks, cursor);
      if (result.blocks === blocks && !result.cursor) break;
      blocks = result.blocks;
      cursor = result.cursor;
    }
  }
  assert.deepEqual(blocks, [plain('z', '')]);
});

test('images stay intact when Backspace crosses their text boundary', () => {
  const image = { key: 'image', type: 'image', attachmentId: 'saved', image: { storagePath: 'saved.jpg' } };
  const blocks = [plain('a', 'Before'), image, plain('b', 'After')];
  const result = backspaceNoteBlock(blocks, at('b'));
  assert.equal(result.blocks, blocks);
  assert.deepEqual(result.cursor, at('a', 6));
  assert.equal(result.blocks[1], image);
});

test('boundary edits round trip saved checklist state and undo/redo document plus cursor', () => {
  const initial = { blocks: [item('a', 'Done', 'checklist', true), item('b', 'Next', 'checklist')], cursor: at('b') };
  const history = createNoteEditHistory();
  history.record(initial);
  const result = backspaceNoteBlock(initial.blocks, initial.cursor);
  const restored = draftFromNote({ text: '', content: parseNoteContent(draftContentForStorage(result.blocks)), attachments: [] });
  assert.equal(restored[0].list.checked, true);
  assert.equal(restored[1].list, undefined);
  assert.equal(restored[1].text, 'Next');
  assert.deepEqual(history.travel('undo', result), initial);
  assert.deepEqual(history.travel('redo', initial), result);
});

test('long checklist edit retains unrelated objects and completion states', () => {
  const blocks = Array.from({ length: 5000 }, (_, i) => item(String(i), `Task ${i}`, 'checklist', i % 2 === 0));
  const result = backspaceNoteBlock(blocks, at('4999'));
  for (let i = 0; i < 4999; i++) assert.equal(result.blocks[i], blocks[i]);
  assert.equal(result.blocks.at(-1).list, undefined);
  assert.equal(result.blocks.at(-1).key, '4999');
});
