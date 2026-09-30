import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const storage = await loadModule('src/features/onboarding/storage');
const tour = await loadModule('src/features/onboarding/tour');
const repositories = await loadModule('src/db/repositories');
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

async function freshDatabase(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return db;
}
const settings = async (db) => Object.fromEntries((await db.getAllAsync('SELECT key, value FROM app_settings ORDER BY key')).map((row) => [row.key, row.value]));

test('a fresh install starts the welcome tour once, with onboarding.version = 1', async (t) => {
  const db = await freshDatabase(t);
  assert.equal(await tour.prepareLaunch(db, true), true);
  const stored = await settings(db);
  assert.equal(stored['onboarding.version'], '1');
  assert.equal(stored['onboarding.firstRun'], 'shown');
  assert.equal(stored['onboarding.checklistHome'], 'shown');
  assert.equal((await tour.readTour(db)).stage, 'welcome');
  assert.equal((await tour.readTour(db)).mode, 'first-run');
  // The next launch never starts it again, and a tour left running is ended cleanly.
  assert.equal(await tour.prepareLaunch(db, true), false);
  assert.equal(await tour.readTour(db), null);
  assert.ok((await settings(db))['onboarding.completedAt']);
});

test('an existing user — any note, board or setting — never sees onboarding after updating', async (t) => {
  for (const seed of [
    (db) => repositories.createMessageRepository(db).createText('Buy milk'),
    (db) => repositories.createBoardRepository(db).create({ name: 'Work' }),
    (db) => db.runAsync("INSERT INTO app_settings (key, value, updated_at) VALUES ('app_theme', 'faith', 1)"),
    async (db) => { const note = await repositories.createMessageRepository(db).createText('gone'); await repositories.createMessageRepository(db).softDelete(note.id); },
  ]) {
    const db = await freshDatabase(t);
    await seed(db);
    assert.equal(await tour.prepareLaunch(db, true), false);
    assert.equal((await settings(db))['onboarding.firstRun'], 'existing-user');
    assert.equal(await tour.readTour(db), null);
    assert.equal((await settings(db))['onboarding.checklistHome'], undefined, 'no checklist card is added to an existing user’s home');
    // Even after they delete everything, the decision stands.
    await db.runAsync('DELETE FROM messages'); await db.runAsync('DELETE FROM board_columns'); await db.runAsync('DELETE FROM boards');
    assert.equal(await tour.prepareLaunch(db, true), false);
  }
});

test('a launch that lands on a deep link leaves a fresh install undecided until an ordinary launch', async (t) => {
  const db = await freshDatabase(t);
  assert.equal(await tour.prepareLaunch(db, false), false);
  assert.deepEqual(await settings(db), {});
  assert.equal(await tour.prepareLaunch(db, true), true);
});

test('Reset tips removes only onboarding rows', async (t) => {
  const db = await freshDatabase(t);
  await db.runAsync("INSERT INTO app_settings (key, value, updated_at) VALUES ('chat_title', 'Mine', 1), ('onboardingish', 'keep', 1)");
  await storage.writeOnboardingValue(db, 'onboarding.version', '1');
  await storage.writeOnboardingValue(db, 'onboarding.checklist', '["first-note"]');
  await storage.resetOnboarding(db);
  assert.deepEqual(await settings(db), { chat_title: 'Mine', onboardingish: 'keep' });
});

test('the root layout only gains the onboarding layer, after every existing screen', () => {
  const layout = read('src/app/_layout.tsx');
  assert.match(layout, /import \{ OnboardingLayer \} from '@\/features\/onboarding\/onboarding-layer';/);
  assert.match(layout, /<Stack\.Screen name="pinned" \/>\n {10}<\/Stack>\n {10}<OnboardingLayer \/>\n {8}<\/AppDrawerProvider>/);
});
