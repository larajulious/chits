import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/chat-transition-lifecycle.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createChatTransitionLifecycle } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('a balloon visit returns to its origin and navigates exactly once', () => {
  const state = createChatTransitionLifecycle();
  const token = state.beginOpen('/attachments');
  assert.equal(state.beginOpen('/'), null);
  assert.equal(state.navigateOpen(token), true);
  assert.equal(state.navigateOpen(token), false);
  assert.equal(state.focus(), true);
  assert.equal(state.finishOpen(token), true);
  assert.deepEqual(state.close(), { balloonVisit: true, returnPath: '/attachments' });
  assert.equal(state.close(), null);
});

test('Chat returns to the Spaces or Calendar tab that opened it', () => {
  for (const origin of ['/spaces', '/calendar']) {
    const state = createChatTransitionLifecycle();
    const token = state.beginOpen(origin);
    state.navigateOpen(token);
    state.focus();
    state.finishOpen(token);
    assert.deepEqual(state.close(), { balloonVisit: true, returnPath: origin });
  }
});

test('rapid back invalidates unfinished navigation and animation callbacks', () => {
  const state = createChatTransitionLifecycle();
  const interrupted = state.beginOpen('/');
  state.navigateOpen(interrupted);
  state.focus();
  assert.ok(state.close());
  assert.equal(state.navigateOpen(interrupted), false);
  assert.equal(state.finishOpen(interrupted), false);
  state.blur();
  const next = state.beginOpen('/attachments');
  assert.notEqual(next, interrupted);
  assert.equal(state.navigateOpen(interrupted), false);
  assert.equal(state.navigateOpen(next), true);
});

test('direct/history visits use navigation history instead of a stale balloon origin', () => {
  const state = createChatTransitionLifecycle();
  const token = state.beginOpen('/attachments');
  state.navigateOpen(token); state.focus(); state.finishOpen(token); state.close(); state.blur();
  assert.equal(state.focus(), false);
  assert.deepEqual(state.close(), { balloonVisit: false, returnPath: '/attachments' });
});

test('a slow focus after animation completion still remembers its balloon origin', () => {
  const state = createChatTransitionLifecycle();
  const token = state.beginOpen('/attachments');
  state.navigateOpen(token); state.finishOpen(token);
  assert.equal(state.focus(), false);
  assert.deepEqual(state.close(), { balloonVisit: true, returnPath: '/attachments' });
});

test('blur or unmount invalidates callbacks without navigating an inactive screen', () => {
  const state = createChatTransitionLifecycle();
  const token = state.beginOpen('/');
  state.blur();
  assert.equal(state.navigateOpen(token), false);
  assert.equal(state.finishOpen(token), false);
  assert.equal(state.close(), null);
  assert.ok(state.beginOpen('/attachments'));
});
