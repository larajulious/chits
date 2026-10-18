import assert from 'node:assert/strict';
import test from 'node:test';
import { backspaceNoteBlock, editNoteListItem, toggleNoteList } from '../src/services/note-lists.ts';
const plain = (key, text = '') => ({ key, type: 'text', text });
const at = key => ({ key, start: 0, end: 0 });
for (const kind of ['bullet', 'numbered', 'checklist']) {
  const item = (key, text = '') => ({ ...plain(key, text), list: kind === 'checklist' ? { kind, id: 'g', checked: false } : { kind, id: 'g' } });
  test(`${kind}: explicit exit collapses otherwise blank document to the focused paragraph`, () => {
    const blocks = [plain('blank', '\n'.repeat(8)), item('active')];
    for (const result of [backspaceNoteBlock(blocks, at('active')), editNoteListItem(blocks, 'active', '\n', at('active'))]) {
      assert.deepEqual(result.blocks, [plain('active')]);
      assert.deepEqual(result.cursor, at('active'));
    }
    assert.equal(blocks[1].list.kind, kind, 'original document remains immutable');
  });
  test(`${kind}: deleting final character leaves a deliberate empty formatted item`, () => {
    const result = editNoteListItem([item('active', 'A')], 'active', '', { key: 'active', start: 1, end: 1 });
    assert.equal(result.blocks[0].text, '');
    assert.equal(result.blocks[0].list.kind, kind);
    assert.equal(result.cursor, null, 'native deletion/composition must not be refocused');
    const inserted = toggleNoteList([plain('active')], at('active'), kind);
    assert.equal(inserted.blocks[0].list.kind, kind);
  });
  test(`${kind}: another deliberate empty item is preserved until explicitly exited`, () => {
    const result = backspaceNoteBlock([item('other'), item('active')], at('active'));
    assert.equal(result.blocks[0].list.kind, kind);
    assert.equal(result.blocks.length, 2);
  });
}

test('blank plain runs collapse on structural Backspace and keep the focused key', () => {
  const result = backspaceNoteBlock([plain('before', '\n\n'), plain('active')], at('active'));
  assert.deepEqual(result.blocks, [plain('active')]);
  assert.deepEqual(result.cursor, at('active'));
});

test('ordinary words, spaces and images prevent empty-document cleanup', () => {
  for (const text of ['Keep', '  ']) {
    const blocks = [plain('before', text), { ...plain('active'), list: { kind: 'checklist', id: 'g', checked: true } }];
    const result = backspaceNoteBlock(blocks, at('active'));
    assert.equal(result.blocks[0].text, `${text}\n`);
    assert.equal(result.blocks[0].key, 'active');
  }
  const image = { key: 'image', type: 'image', attachmentId: 'saved', image: { storagePath: 'saved.jpg' } };
  const result = backspaceNoteBlock([plain('before'), image, { ...plain('active'), list: { kind: 'bullet', id: 'g' } }], at('active'));
  assert.equal(result.blocks[1], image);
  assert.equal(result.blocks.length, 3);
});

test('clearing is one undoable structural operation with cursor restoration', async () => {
  const { createNoteEditHistory } = await import('../src/services/note-edit-history.ts');
  const initial = { blocks: [plain('blank', '\n\n'), { ...plain('active'), list: { kind: 'checklist', id: 'g', checked: true } }], cursor: at('active') };
  const history = createNoteEditHistory();
  history.record(initial);
  const cleared = backspaceNoteBlock(initial.blocks, initial.cursor);
  assert.deepEqual(cleared.blocks, [plain('active')]);
  assert.deepEqual(history.travel('undo', cleared), initial);
  assert.deepEqual(history.travel('redo', initial), cleared);
});

test('already empty boundary deletion is a no-op and ordinary toggle preserves authored blank lines', () => {
  const blocks = [plain('active')];
  const unchanged = backspaceNoteBlock(blocks, at('active'));
  assert.equal(unchanged.blocks, blocks);
  assert.equal(unchanged.cursor, null);
  const source = [plain('active', '\n\n')];
  const formatted = toggleNoteList(source, at('active'), 'checklist');
  const restored = toggleNoteList(formatted.blocks, formatted.cursor, 'checklist');
  assert.equal(restored.blocks[0].text, '\n\n');
});
