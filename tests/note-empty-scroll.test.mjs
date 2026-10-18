import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { isEmptyNoteDraft } from '../src/services/note-content.ts';

function harness(blocks) {
  const source = readFileSync(new URL('../src/components/notes/note-blocks-editor.tsx', import.meta.url), 'utf8');
  const callback = source.match(/const resetEmptyScroll = useCallback\((\(\) => \{[\s\S]*?\}), \[\]\);/)[1];
  const calls = [];
  const context = {
    isEmptyNoteDraft,
    liveBlocks: { current: blocks }, pendingScroll: { current: 'former-list-row' },
    positions: { current: new Map([['active', 900]]) },
    scroll: { current: { scrollTo: position => calls.push(position) } },
  };
  return { context, calls, reset: vm.runInNewContext(`(${callback})`, context) };
}

test('empty layout cancels obsolete row scrolling and resets the viewport without scheduling focus', () => {
  const h = harness([{ key: 'active', type: 'text', text: '' }]);
  h.reset();
  assert.equal(h.context.pendingScroll.current, null);
  assert.equal(h.context.positions.current.size, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].x, 0);
  assert.equal(h.calls[0].y, 0);
  assert.equal(h.calls[0].animated, false);
});

test('late native layout callbacks cannot reset scrolling after typing resumes', () => {
  const h = harness([{ key: 'active', type: 'text', text: '' }]);
  h.context.liveBlocks.current = [{ key: 'active', type: 'text', text: 'Resumed' }];
  h.reset();
  assert.equal(h.calls.length, 0);
  assert.equal(h.context.pendingScroll.current, 'former-list-row');
  assert.equal(h.context.positions.current.size, 1);
});

test('empty tasks and image typing slots are not cleared-document layouts', () => {
  for (const blocks of [
    [{ key: 'active', type: 'text', text: '', list: { kind: 'checklist', id: 'g', checked: false } }],
    [{ key: 'active', type: 'text', text: '' }, { key: 'image', type: 'image' }],
  ]) {
    const h = harness(blocks);
    h.reset();
    assert.equal(h.calls.length, 0);
    assert.equal(h.context.positions.current.size, 1);
  }
});
