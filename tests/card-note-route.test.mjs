import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { cardDetailsRoute, cardNoteRoute } from '../src/services/card-note-route.ts';

const note = (id, extra = {}) => ({ id, isHiddenContent: false, deletedAt: null, archivedAt: null, ...extra });
const boards = (...messages) => ({ listCardMessages: async () => messages });
const editor = (messageId) => ({ pathname: '/card/edit-content', params: { messageId, autoFocus: '0' } });

test('a card with one note opens that note in the editor', async () => {
  assert.deepEqual(await cardNoteRoute(boards(note('a')), 'c'), editor('a'));
});

test('cards the editor cannot show fall back to Card Details', async () => {
  assert.deepEqual(await cardNoteRoute(boards(), 'c'), cardDetailsRoute('c'));
  assert.deepEqual(await cardNoteRoute(boards(note('a'), note('b')), 'c'), cardDetailsRoute('c'));
  assert.deepEqual(await cardNoteRoute(boards(note('a', { isHiddenContent: true })), 'c'), cardDetailsRoute('c'));
});

test('deleted and archived notes do not count', async () => {
  assert.deepEqual(await cardNoteRoute(boards(note('a'), note('b', { deletedAt: 1 }), note('d', { archivedAt: 1 })), 'c'), editor('a'));
  assert.deepEqual(await cardNoteRoute(boards(note('a', { deletedAt: 1 })), 'c'), cardDetailsRoute('c'));
});

test('widget taps keep their marker on either destination', async () => {
  const extras = { fromWidget: '1' };
  assert.equal((await cardNoteRoute(boards(note('a')), 'c', extras)).params.fromWidget, '1');
  assert.equal((await cardNoteRoute(boards(), 'c', extras)).params.fromWidget, '1');
});

test('board columns go straight to Card Details and Home no longer does', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(read('src/app/board/[id].native.tsx'), /onPress=\{\(\) => router\.push\(`\/card\/\$\{card\.id\}`\)\}/);
  assert.doesNotMatch(read('src/app/(tabs)/index.native.tsx'), /item\.kind === 'card' && item\.boardId/);
});
