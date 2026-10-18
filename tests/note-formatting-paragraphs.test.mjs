import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleNoteList, editNoteListItem, backspaceNoteBlock } from '../src/services/note-lists.ts';
import { draftPlainText, draftContentForStorage, parseNoteContent, draftFromNote } from '../src/services/note-content.ts';

const plain = (text, key = 'p') => ({ key, type: 'text', text });
const at = (start, end = start, key = 'p') => ({ key, start, end });
const texts = edit => edit.blocks.map(b => b.text);
for (const kind of ['bullet', 'numbered', 'checklist']) {
  test(`${kind}: converts existing text in place at start, middle and end`, () => {
    for (const offset of [0, 4, 13]) {
      const result = toggleNoteList([plain('Buy groceries')], at(offset), kind);
      assert.deepEqual(texts(result), ['Buy groceries']);
      assert.equal(result.blocks[0].key, 'p');
      assert.deepEqual(result.cursor, at(offset));
      assert.equal(result.blocks[0].list.kind, kind);
    }
  });
  test(`${kind}: formats the existing empty last paragraph without a second separator`, () => {
    const result = toggleNoteList([plain('Meeting notes\n')], at(14), kind);
    assert.deepEqual(texts(result), ['Meeting notes', '']);
    assert.equal(result.blocks[1].key, 'p');
    assert.deepEqual(result.cursor, at(0));
    const off = toggleNoteList(result.blocks, result.cursor, kind);
    assert.equal(draftPlainText(off.blocks), 'Meeting notes\n');
    assert.deepEqual(off.cursor, at(14));
  });
  test(`${kind}: transforms middle and selected paragraphs without retaining delimiter lines`, () => {
    const result = toggleNoteList([plain('Before\nOne\nTwo\nAfter')], at(7, 14), kind);
    assert.deepEqual(texts(result), ['Before', 'One', 'Two', 'After']);
    assert.deepEqual(result.blocks.map(b => b.list?.kind ?? null), [null, kind, kind, null]);
    assert.equal(result.blocks[1].key, 'p');
  });
  test(`${kind}: repeated on/off cycles preserve authored blank lines, text and caret`, () => {
    for (const text of ['Buy groceries', 'Before\nBuy groceries\nAfter', 'Before\n\nBuy groceries\n\nAfter', '\nBuy groceries\n']) {
      const offset = text.indexOf('Buy') + 4;
      let blocks = [plain(text)], cursor = at(offset);
      for (let cycle = 0; cycle < 5; cycle++) {
        let result = toggleNoteList(blocks, cursor, kind);
        result = toggleNoteList(result.blocks, result.cursor, kind);
        blocks = result.blocks; cursor = result.cursor;
        assert.equal(draftPlainText(blocks), text);
        assert.deepEqual(cursor, at(offset));
      }
    }
  });
}

test('direct kind switches affect the active item and preserve text, key, cursor and neighboring completion', () => {
  const done = { ...plain('Done', 'done'), list: { kind: 'checklist', id: 'done', checked: true } };
  let blocks = [done, plain('Buy groceries')], cursor = at(4);
  for (const kind of ['numbered', 'bullet', 'checklist', 'numbered', 'checklist']) {
    const result = toggleNoteList(blocks, cursor, kind);
    assert.equal(result.blocks[0], done);
    assert.equal(result.blocks[1].text, 'Buy groceries');
    assert.equal(result.blocks[1].key, 'p');
    assert.deepEqual(result.cursor, cursor);
    blocks = result.blocks;
  }
});

test('empty Enter exits exactly once, then Backspace joins without losing words', () => {
  for (const kind of ['numbered', 'bullet', 'checklist']) {
    const start = toggleNoteList([plain('Intro\nTask')], at(10), kind);
    const entered = editNoteListItem(start.blocks, 'p', 'Task\n', at(4));
    const exited = editNoteListItem(entered.blocks, entered.cursor.key, '\n', entered.cursor);
    assert.deepEqual(texts(exited), ['Intro', 'Task', '']);
    const joined = backspaceNoteBlock(exited.blocks, exited.cursor);
    assert.deepEqual(texts(joined), ['Intro', 'Task']);
    assert.equal(joined.cursor.start, 4);
  }
});

test('formatting and save/reopen retain exactly the selected paragraphs and completion', () => {
  const result = toggleNoteList([plain('Intro\nBuy groceries\nAfter')], at(10), 'checklist');
  const stored = draftContentForStorage(result.blocks);
  const restored = draftFromNote({ text: '', content: parseNoteContent(stored), attachments: [] });
  assert.deepEqual(restored.map(b => b.text), ['Intro', 'Buy groceries', 'After']);
  assert.equal(restored[1].list.checked, false);
  assert.equal(restored.length, 3);
});

test('every paragraph position preserves exactly the authored text and empty paragraphs', () => {
  for (const text of ['', '\n', '\n\n', 'A\nB', 'A\n\nB\n', '\nA\n\nB\n\n', '😀 Buy\n中文\nAfter']) {
    for (let offset = 0; offset <= text.length; offset++) {
      for (const kind of ['bullet', 'numbered', 'checklist']) {
        const result = toggleNoteList([plain(text)], at(offset), kind);
        assert.equal(result.blocks.map(b => b.text).join('\n'), text);
        const restored = toggleNoteList(result.blocks, result.cursor, kind);
        assert.equal(draftPlainText(restored.blocks), text);
        assert.deepEqual(restored.cursor, at(offset));
      }
    }
  }
});

test('multiline checklist paste preserves the boundary before following plain prose', () => {
  const blocks = [{ ...plain('Task'), list: { kind: 'checklist', id: 'g', checked: true } }, plain('After', 'after')];
  const result = editNoteListItem(blocks, 'p', 'Task\nPasted', at(4));
  assert.deepEqual(texts(result), ['Task', 'Pasted\nAfter']);
  assert.equal(result.blocks[0].list.checked, true);
  assert.equal(result.cursor.start, 6);
});

test('save/reopen retains authored empty paragraphs beside formatted text', () => {
  for (const text of ['\nBuy groceries', 'Buy groceries\n', '\nBuy groceries\n']) {
    const result = toggleNoteList([plain(text)], at(text.indexOf('Buy') + 4), 'checklist');
    const reopened = draftFromNote({ text: '', content: parseNoteContent(draftContentForStorage(result.blocks)), attachments: [] });
    assert.equal(reopened.map(b => b.type === 'text' ? b.text : '').join('\n'), text);
  }
});
