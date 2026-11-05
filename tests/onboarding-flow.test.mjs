import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const tour = await loadModule('src/features/onboarding/tour');
const checklist = await loadModule('src/features/onboarding/checklist');
const journey = await loadModule('src/features/onboarding/hub/journey');
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
  assert.match(home, /<GettingStartedCard \/>/);
  assert.match(chat, /prefill\?: string/);
  assert.match(hub, /startTour\(database, 'replay'\)/);
  assert.doesNotMatch(hub, /resetOnboarding|hub\.reset/);
  assert.match(read('src/features/onboarding/onboarding-layer.native.tsx'), /pathname: '\/unorganized'/);
  assert.match(read('src/features/onboarding/onboarding-layer.native.tsx'), /card_messages cm INNER JOIN cards/);
});

test('a reminder set on a chat note counts, not only one on a card', async (t) => {
  const db = await freshDatabase(t);
  const note = await repositories.createMessageRepository(db).createText('Call the vet');
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote']);
  const columns = (await db.getAllAsync("SELECT name FROM pragma_table_info('message_reminders') WHERE \"notnull\" = 1 AND dflt_value IS NULL")).map((column) => column.name);
  const values = { message_id: note.id, scheduled_at: Date.now() + 100000, created_at: Date.now(), updated_at: Date.now() };
  const row = columns.map((name) => [name, values[name] ?? (name === 'id' ? 'reminder-1' : 0)]);
  await db.runAsync(`INSERT INTO message_reminders (${row.map(([name]) => name).join(', ')}) VALUES (${row.map(() => '?').join(', ')})`, ...row.map(([, value]) => value));
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'reminder']);
  await db.runAsync('DELETE FROM message_reminders');
  assert.deepEqual(await checklist.readChecklist(db), ['firstNote', 'reminder'], 'it stays ticked after the reminder is gone');
});

test('opening a task records nothing: only saved work ticks the checklist', async (t) => {
  const db = await freshDatabase(t);
  const hook = read('src/features/onboarding/hub/use-checklist.ts');
  assert.doesNotMatch(hook.slice(hook.indexOf('const open ='), hook.indexOf('const dismissFromHome')), /ONBOARDING_KEYS\.checklist,|INSERT|UPDATE/);
  assert.deepEqual(await checklist.readChecklist(db), []);
});

test('Chits says hello once, then reacts only when progress actually moves', () => {
  assert.deepEqual(journey.journeyReaction(0, null), { line: 0, remember: 0 }, 'first visit greets');
  assert.deepEqual(journey.journeyReaction(2, null), { line: 2, remember: 2 }, 'first visit greets from wherever they are');
  assert.deepEqual(journey.journeyReaction(0, 0), { line: null, remember: null }, 'reopening stays quiet');
  assert.deepEqual(journey.journeyReaction(3, 3), { line: null, remember: null });
  assert.deepEqual(journey.journeyReaction(1, 0), { line: 1, remember: 1 }, 'a new task is celebrated');
  assert.deepEqual(journey.journeyReaction(4, 3), { line: 4, remember: 4 });
  assert.deepEqual(journey.journeyReaction(1, 3), { line: null, remember: null }, 'never replays a lower milestone');
});

test('the last celebrated milestone survives, so a reopened hub stays quiet', async (t) => {
  const db = await freshDatabase(t);
  assert.equal(await journey.readCelebrated(db), null);
  await journey.saveCelebrated(db, 2);
  assert.equal(await journey.readCelebrated(db), 2);
  assert.deepEqual(journey.journeyReaction(2, await journey.readCelebrated(db)), { line: null, remember: null });
  assert.equal(await storage.hasPriorUse(db), false, 'it is an onboarding row, so it never makes a fresh install look used');
});

test('replaying the tour keeps every note, card, tick and milestone', async (t) => {
  const db = await freshDatabase(t);
  const note = await repositories.createMessageRepository(db).createText('Remember milk');
  const board = await repositories.createBoardRepository(db).create({ name: 'Personal' });
  await repositories.createBoardRepository(db).organizeMessages(board.id, [note.id]);
  const before = await checklist.readChecklist(db);
  await journey.saveCelebrated(db, before.length);
  await tour.endTour(db);
  await tour.startTour(db, 'replay');
  await tour.endTour(db);
  assert.deepEqual(await checklist.readChecklist(db), before);
  assert.equal(await journey.readCelebrated(db), before.length);
  assert.equal(await count(db, 'messages'), 1);
  assert.equal(await count(db, 'boards'), 1);
});

test('Settings replays the whole tour without touching saved work', () => {
  const settings = read('src/app/settings.tsx');
  assert.match(settings, /endTour\(database\); await startTour\(database, 'replay'\); router\.push\('\/onboarding\/welcome'\)/);
  assert.match(settings, /label=\{tr\('onboarding\.hub\.replay'\)\}/);
  assert.doesNotMatch(settings, /resetOnboarding/);
});

test('the next task is the first one not done, in the original order', () => {
  assert.equal(journey.nextChecklistItem([]), 'firstNote');
  assert.equal(journey.nextChecklistItem(['firstNote', 'reminder']), 'firstCard');
  assert.equal(journey.nextChecklistItem(['firstNote', 'firstCard', 'reminder', 'space']), null);
});
