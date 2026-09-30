import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPACE_CAPACITY, SPACE_IDS, SPACE_LIST, STICKY_COLORS, STICKY_SIZE,
  STICKY_INSET, autoPlace, fromUnit, randomRotation, resolveSpaceId, stickyBounds, toUnit,
} from '../src/constants/spaces.ts';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createBoardRepository, createMessageRepository, createSpaceRepository } = await loadModule('src/db/repositories');

// A repeatable "random": the same sequence every run.
const sequence = (...values) => { let index = 0; return () => values[index++ % values.length]; };

async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec(`
    INSERT INTO boards (id, name, created_at, updated_at) VALUES ('board', 'Home', 1, 1);
    INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('column', 'board', 'To do', 1, 1, 1);
    INSERT INTO cards (id, board_id, column_id, title, position, created_at, updated_at) VALUES ('card', 'board', 'column', 'Groceries', 1, 1, 5);
    INSERT INTO messages (id, text, type, created_at, updated_at) VALUES ('in-card', 'Milk
Eggs
Bread
Coffee', 'text', 1, 1);
    INSERT INTO card_messages (card_id, message_id, position) VALUES ('card', 'in-card', 1);
  `);
  for (let index = 0; index < 14; index++) db.raw.prepare("INSERT INTO messages (id, text, type, created_at, updated_at) VALUES (?, ?, 'text', ?, ?)").run(`t${index}`, `Thought ${index}`, 10 + index, 10 + index);
  return { env, db, spaces: createSpaceRepository(db), messages: createMessageRepository(db), boards: createBoardRepository(db) };
}

test('four spaces, defined in one place, each with its own way of holding a sticky', () => {
  assert.deepEqual(SPACE_LIST.map((space) => [space.id, space.name, space.pinStyle]), [['fridge', 'Fridge', 'magnet'], ['desk', 'Desk', 'tape'], ['cork', 'Cork board', 'pushpin'], ['wall', 'Wall', 'washi']]);
  assert.deepEqual([...SPACE_IDS], SPACE_LIST.map((space) => space.id));
  for (const space of SPACE_LIST) for (const color of Object.values(space.background)) assert.match(color, /^#[0-9A-F]{6}$/);
  assert.deepEqual(STICKY_COLORS.map((color) => color.hex), ['#FFE58A', '#FFC7CC', '#C4E4FF', '#D2F0C4', '#FFD6AE']);
  assert.equal(resolveSpaceId('cork'), 'cork');
  for (const value of [null, undefined, '', 'Cork', 'garage']) assert.equal(resolveSpaceId(value), null, String(value));
});

test('positions are stored as fractions, so a sticky stays fully on any board size', () => {
  const phone = { width: 390, height: 600 };
  const tablet = { width: 1024, height: 700 };
  const point = { x: 129, y: 238 };
  const unit = toUnit(point, phone);
  assert.deepEqual(fromUnit(unit, phone), point);
  for (const board of [phone, tablet]) {
    for (const corner of [{ x: 0, y: 0 }, { x: 1, y: 1 }]) {
      const at = fromUnit(corner, board);
      // Inside the board, with room above for the pin.
      assert.ok(at.x >= STICKY_INSET.side && at.x + STICKY_SIZE.width <= board.width - STICKY_INSET.side && at.y >= STICKY_INSET.top && at.y + STICKY_SIZE.height <= board.height - STICKY_INSET.bottom);
    }
  }
  // Dragged past an edge: clamped inside the board.
  assert.deepEqual(toUnit({ x: -50, y: 9999 }, phone), { x: 0, y: 1 });
  assert.deepEqual(stickyBounds(phone), { minX: 8, minY: 16, maxX: 390 - 8 - 132, maxY: 600 - 10 - 124 });
});

test('a new sticky tilts between -4° and +4°, and lands in the next open slot of a loose two-column grid', () => {
  for (const value of [0, 0.25, 0.5, 0.999]) { const tilt = randomRotation(() => value); assert.ok(tilt >= -4 && tilt <= 4, String(tilt)); }
  const placed = [];
  for (let index = 0; index < SPACE_CAPACITY; index++) placed.push(autoPlace(placed, sequence(0.5)));
  assert.deepEqual(placed.slice(0, 4), [{ x: 0.1, y: 0 }, { x: 0.9, y: 0 }, { x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }]);
  // No two stickies share a slot.
  assert.equal(new Set(placed.map((point) => `${point.x},${point.y}`)).size, SPACE_CAPACITY);
  // The nudge is small, and always stays on the board.
  const nudged = autoPlace([], sequence(1));
  assert.ok(Math.abs(nudged.x - 0.1) <= 0.04 + 1e-9 && nudged.y >= 0 && nudged.y <= 0.04 + 1e-9);
});

test('a placement holds exactly one note, and a note is on at most one space', async (t) => {
  const { db } = await fixture(t);
  const insert = (id, messageId, cardId) => db.raw.prepare("INSERT INTO space_placements (id, message_id, card_id, space_id, x, y, rotation, color, z_index, pinned_at, updated_at) VALUES (?, ?, ?, 'fridge', 0, 0, 0, '#FFE58A', 1, 1, 1)").run(id, messageId, cardId);
  assert.throws(() => insert('both', 't0', 'card'), /CHECK/);
  assert.throws(() => insert('neither', null, null), /CHECK/);
  insert('one', 't0', null);
  assert.throws(() => insert('again', 't0', null), /UNIQUE/);
  assert.throws(() => insert('ghost', 'no-such-thought', null), /FOREIGN KEY/);
});

test('sticking notes: auto-placed, tilted, yellow by default, and a space holds twelve', async (t) => {
  const { spaces } = await fixture(t);
  assert.equal(await spaces.getSelectedSpace(), null, 'no space until the user picks one');
  await spaces.setSelectedSpace('cork');
  assert.equal(await spaces.getSelectedSpace(), 'cork');

  const first = await spaces.stick('card', 'card', 'fridge', sequence(0.5));
  assert.equal(first.status, 'stuck');
  assert.deepEqual({ x: first.placement.x, y: first.placement.y, rotation: first.placement.rotation, color: first.placement.color }, { x: 0.1, y: 0, rotation: 0, color: '#FFE58A' });
  for (let index = 0; index < SPACE_CAPACITY - 1; index++) assert.equal((await spaces.stick('thought', `t${index}`, 'fridge')).status, 'stuck');
  assert.deepEqual(await spaces.stick('thought', 't12', 'fridge'), { status: 'full' });
  assert.equal((await spaces.counts()).fridge, SPACE_CAPACITY);
  assert.equal((await spaces.stick('thought', 't12', 'desk')).status, 'stuck', 'another space still has room');

  const [card] = await spaces.list('fridge');
  assert.deepEqual({ kind: card.kind, noteId: card.noteId, title: card.title, text: card.text, hidden: card.hidden, boardId: card.boardId }, { kind: 'card', noteId: 'card', title: 'Groceries', text: 'Milk\nEggs\nBread\nCoffee', hidden: false, boardId: 'board' });
});

test('drag, bring to front, recolor and move between spaces all persist', async (t) => {
  const { spaces } = await fixture(t);
  const a = (await spaces.stick('thought', 't0', 'fridge')).placement;
  const b = (await spaces.stick('thought', 't1', 'fridge')).placement;
  const top = async () => (await spaces.list('fridge')).at(-1).id;
  assert.equal(await top(), b.id);

  await spaces.savePosition(a.id, { x: 0.42, y: 1.7 });
  const moved = (await spaces.list('fridge')).find((note) => note.id === a.id);
  assert.deepEqual({ x: moved.x, y: moved.y }, { x: 0.42, y: 1 }, 'saved and clamped');
  assert.equal(await top(), a.id, 'a dropped sticky stays in front');
  const z = moved.zIndex;
  await spaces.bringToFront(a.id);
  assert.equal((await spaces.list('fridge')).at(-1).zIndex, z, 'raising the top sticky again does not climb');
  await spaces.bringToFront(b.id);
  assert.equal(await top(), b.id);

  await spaces.setColor(a.id, '#C4E4FF');
  assert.throws(() => spaces.setColor(a.id, '#000000'), /isn’t available/);
  const moveResult = await spaces.moveToSpace(a.id, 'wall');
  assert.equal(moveResult.status, 'stuck');
  const [onWall] = await spaces.list('wall');
  assert.deepEqual({ id: onWall.id, color: onWall.color, rotation: onWall.rotation }, { id: a.id, color: '#C4E4FF', rotation: a.rotation }, 'keeps its color and tilt');
  assert.equal((await spaces.list('fridge')).length, 1);
  const { title, text, hidden, boardId, media, ...placement } = onWall;
  assert.deepEqual(await spaces.placementFor('thought', 't0'), placement);
  assert.equal(await spaces.remove(a.id), true);
  assert.equal(await spaces.placementFor('thought', 't0'), null);
});

test('hidden notes never show their words; archived ones step aside; deleted ones come off for good', async (t) => {
  const { db, spaces, messages, boards } = await fixture(t);
  await spaces.stick('thought', 't0', 'fridge');
  await spaces.stick('thought', 't1', 'fridge');
  await spaces.stick('thought', 't2', 'fridge');
  await spaces.stick('card', 'card', 'fridge');

  db.raw.exec("UPDATE messages SET is_hidden_content = 1 WHERE id IN ('t0', 'in-card')");
  const hidden = (await spaces.list('fridge')).filter((note) => note.hidden);
  assert.deepEqual(hidden.map((note) => [note.noteId, note.title, note.text]).sort(), [['card', null, null], ['t0', null, null]]);

  db.raw.exec("UPDATE messages SET archived_at = 1 WHERE id = 't1'");
  assert.equal((await spaces.counts()).fridge, 3, 'an archived note is hidden and frees its slot');
  db.raw.exec("UPDATE messages SET archived_at = NULL WHERE id = 't1'");
  assert.equal((await spaces.counts()).fridge, 4, 'and comes back where it was when restored');

  await messages.softDelete('t1');
  await messages.deletePermanently('t2');
  await boards.detachCard('card'); // "Move back to Unorganized" removes the card itself
  assert.deepEqual((await spaces.list('fridge')).map((note) => note.noteId), ['t0']);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM space_placements').get().n, 1, 'no placement outlives its note');
});

test('the note picker lists cards and unorganized thoughts that are not on a space, searchable but never by hidden words', async (t) => {
  const { db, spaces } = await fixture(t);
  await spaces.stick('thought', 't0', 'desk');
  const all = await spaces.listCandidates();
  assert.ok(all.some((item) => item.kind === 'card' && item.id === 'card' && item.title === 'Groceries' && item.context === 'Home · To do'));
  assert.ok(!all.some((item) => item.id === 't0'), 'already on a space');
  assert.ok(!all.some((item) => item.id === 'in-card'), 'organized thoughts appear as their card');
  assert.equal(all.length, 1 + 13);

  db.raw.exec("UPDATE messages SET is_hidden_content = 1 WHERE id = 't5'");
  assert.equal((await spaces.listCandidates()).find((item) => item.id === 't5').title, 'Hidden Chit');
  assert.deepEqual((await spaces.listCandidates('Thought 5')).map((item) => item.id), [], 'a hidden note is not found by its words');
  assert.deepEqual((await spaces.listCandidates('groc')).map((item) => item.id), ['card']);
  assert.deepEqual((await spaces.listCandidates('100%')).map((item) => item.id), []);
});

test('the fridge magnets spell the NoteSpace name, fitted to the row', async () => {
  const { magnetLetters, MAGNET_LETTER_SIZE } = await import('../src/constants/letter-magnets.ts');
  const spell = (name, width = 346) => magnetLetters(name, width).glyphs.map((glyph) => glyph.char).join('');
  assert.equal(spell('Chits'), 'CHITS');
  assert.equal(spell('Lara’s notes'), 'LARAS NOTES', 'spaces become gaps; a curly apostrophe has no magnet');
  assert.equal(spell("Mom's  Kitchen 2"), "MOM'S KITCHEN 2", 'runs of spaces are one gap');
  assert.equal(spell('Ideas 💡✨'), 'IDEAS', 'emoji are left off, and no trailing gap');
  assert.equal(spell('🍕🍕'), 'CHITS', 'nothing to spell falls back to CHITS');
  assert.equal(spell('   '), 'CHITS');
  assert.equal(magnetLetters('Chits', 346).size, MAGNET_LETTER_SIZE.max, 'a short name gets full-size magnets');
  // A long name shrinks, then is cut at the last whole magnet — never overflowing.
  const long = magnetLetters('The very long name of my NoteSpace', 346);
  assert.equal(long.size, MAGNET_LETTER_SIZE.min);
  assert.ok(long.glyphs.length < 34 && !long.glyphs.at(-1).gap);
  assert.ok(long.glyphs.reduce((sum, glyph) => sum + (glyph.gap ? 0.36 : 0.74) * long.size, 0) <= 346);
  // Neighbouring letters are different magnets and never tilt the same way twice in a row.
  const { glyphs } = magnetLetters('NOTES', 346);
  for (let index = 1; index < glyphs.length; index++) {
    assert.notEqual(glyphs[index].colorIndex % 5, glyphs[index - 1].colorIndex % 5);
    assert.notEqual(glyphs[index].rotation, glyphs[index - 1].rotation);
    assert.ok(glyphs[index].rotation >= -8 && glyphs[index].rotation <= 9);
  }
});
