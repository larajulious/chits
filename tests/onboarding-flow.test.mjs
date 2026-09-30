import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const tour = await loadModule('src/features/onboarding/tour');
const checklist = await loadModule('src/features/onboarding/checklist');
const setup = await loadModule('src/features/onboarding/board-setup');
const storage = await loadModule('src/features/onboarding/storage');
const repositories = await loadModule('src/db/repositories');
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

async function freshDatabase(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return db;
}
const count = async (db, table) => (await db.getFirstAsync('SELECT COUNT(*) AS n FROM ' + table)).n;

test('skipping every persisted tour stage ends cleanly without changing notes or boards', async (t) => {
  const db = await freshDatabase(t);
  for (const stage of ['welcome', 'first-note', 'aha', 'moved', 'setup']) {
    await tour.startTour(db, 'first-run');
    await tour.updateTour(db, { stage });
    await tour.endTour(db);
    assert.equal(await tour.readTour(db), null);
    assert.equal(await count(db, 'messages'), 0);
    assert.equal(await count(db, 'boards'), 0);
  }
});

test('quick setup only creates selected boards and reuses Personal on repeat', async (t) => {
  const db = await freshDatabase(t);
  assert.deepEqual(await setup.createSelectedBoards(db, []), []);
  assert.equal(await count(db, 'boards'), 0);
  const first = await setup.createSelectedBoards(db, ['Personal']);
  assert.equal(first.length, 1);
  assert.equal(await count(db, 'boards'), 1);
  const second = await setup.createSelectedBoards(db, ['personal', 'Work', 'Work']);
  assert.equal(second[0], first[0]);
  assert.equal(second[1], second[2]);
  assert.equal(await count(db, 'boards'), 2);
  assert.equal(await count(db, 'board_columns'), 2);
});

test('replay starts without creating data and ends without modifying it', async (t) => {
  const db = await freshDatabase(t);
  const note = await repositories.createMessageRepository(db).createText('Saved note');
  const board = await repositories.createBoardRepository(db).create({ name: 'Existing' });
  const before = [await count(db, 'messages'), await count(db, 'boards'), await count(db, 'card_messages')];
  await tour.startTour(db, 'replay');
  await tour.updateTour(db, { stage: 'first-note', messageId: note.id });
  await tour.updateTour(db, { stage: 'aha' });
  await tour.endTour(db);
  assert.ok(board.id);
  assert.deepEqual([await count(db, 'messages'), await count(db, 'boards'), await count(db, 'card_messages')], before);
});

test('checklist observes saved notes, cards, reminders and Space placements', async (t) => {
  const db = await freshDatabase(t);
  assert.deepEqual(await checklist.readChecklist(db), []);
  const note = await repositories.createMessageRepository(db).createText('Remember milk');
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote']);
  const board = await repositories.createBoardRepository(db).create({ name: 'Personal' });
  const result = await repositories.createBoardRepository(db).organizeMessages(board.id, [note.id]);
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'firstCard']);
  const cardId = result.cardIds[0];
  await db.runAsync('INSERT INTO card_reminders (card_id, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?)', cardId, Date.now() + 100000, Date.now(), Date.now());
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'firstCard', 'reminder']);
  await db.runAsync('DELETE FROM card_reminders');
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'firstCard', 'reminder'], 'a fired reminder stays completed');
  await repositories.createSpaceRepository(db).stick('card', cardId, 'fridge');
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'firstCard', 'reminder', 'space']);
  await db.runAsync('DELETE FROM space_placements');
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'firstCard', 'reminder', 'space'], 'a removed sticky stays completed');
});

test('drawer, real Chat and home link to onboarding without replacing existing flows', () => {
  const nativeDrawer = read('src/components/navigation/app-drawer.native.tsx');
  const home = read('src/app/(tabs)/index.native.tsx');
  const chat = read('src/app/(tabs)/chat.native.tsx');
  const hub = read('src/features/onboarding/screens/hub-screen.tsx');
  assert.match(nativeDrawer, /NavigationRow destination={gettingStartedDestination}/);
  assert.match(home, /<GettingStartedCard onHome \/>/);
  assert.match(chat, /prefill\?: string/);
  assert.match(hub, /startTour\(database, 'replay'\)/);
  assert.match(hub, /resetOnboarding\(database\)/);
  assert.match(read('src/features/onboarding/onboarding-layer.native.tsx'), /pathname: '\/unorganized'/);
  assert.match(read('src/features/onboarding/onboarding-layer.native.tsx'), /card_messages cm INNER JOIN cards/);
});
