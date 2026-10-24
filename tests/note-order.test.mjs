import assert from 'node:assert/strict';
import test from 'node:test';

import { arrangeNotes, moveNote, noteKey, parseNoteOrder, reorder } from '../src/services/note-order.ts';

const note = (kind, id, createdAt) => ({ kind, id, createdAt });
const keys = (items) => items.map(noteKey);

test('unplaced notes come first, newest first, then the saved arrangement', () => {
  const items = [note('card', 'a', 1), note('thought', 'b', 2), note('card', 'c', 3), note('card', 'new', 9), note('thought', 'newer', 10)];
  const arranged = arrangeNotes(items, ['card:c', 'card:a', 'thought:b', 'card:gone']);
  assert.deepEqual(keys(arranged), ['thought:newer', 'card:new', 'card:c', 'card:a', 'thought:b']);
});

test('a move in the full list puts the note exactly where it was dropped', () => {
  const everything = ['card:a', 'card:b', 'card:c', 'card:d'];
  assert.deepEqual(moveNote(everything, ['card:c', 'card:a', 'card:b', 'card:d'], 'card:c'), ['card:c', 'card:a', 'card:b', 'card:d']);
  assert.deepEqual(moveNote(everything, ['card:b', 'card:c', 'card:d', 'card:a'], 'card:a'), ['card:b', 'card:c', 'card:d', 'card:a']);
});

test('a move under a filter keeps notes outside the filter in their places', () => {
  // The filter shows a, c and e; c is dragged above a.
  const everything = ['card:a', 'card:b', 'card:c', 'card:d', 'card:e'];
  assert.deepEqual(moveNote(everything, ['card:c', 'card:a', 'card:e'], 'card:c'), ['card:c', 'card:a', 'card:b', 'card:d', 'card:e']);
  // Dragged to the end of the filtered run, it lands right after the last shown note.
  assert.deepEqual(moveNote(everything, ['card:c', 'card:e', 'card:a'], 'card:a'), ['card:b', 'card:c', 'card:d', 'card:e', 'card:a']);
});

test('a broken saved order reads as no order', () => {
  assert.deepEqual(parseNoteOrder(null), []);
  assert.deepEqual(parseNoteOrder('{nope'), []);
  assert.deepEqual(parseNoteOrder('{"a":1}'), []);
  assert.deepEqual(parseNoteOrder('["card:a", 3, "thought:b"]'), ['card:a', 'thought:b']);
});

test('reorder moves one item', () => {
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
});
