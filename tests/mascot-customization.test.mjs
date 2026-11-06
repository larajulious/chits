import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { loadModule } from './helpers/backup-runtime.mjs';

const { createMascotPreferenceStore } = await loadModule('src/components/mascot/mascot-preference-store');
const { mascotSvg, BANDANA_MARKUP } = await loadModule('src/components/mascot/bandana-art');
const { resolveMascotVariant, MASCOT_SETTING_KEY } = await loadModule('src/components/mascot/mascot-variants');
const original = readFileSync(new URL('../assets/images/chits-mascot-animated.svg', import.meta.url), 'utf8');
function database(path = ':memory:') {
  const raw = new DatabaseSync(path);
  raw.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER); CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT)');
  return { raw, getFirstSync: (sql, ...args) => raw.prepare(sql).get(...args), runAsync: async (sql, ...args) => raw.prepare(sql).run(...args) };
}

test('defaults and unavailable saved IDs safely resolve to Classic', () => {
  for (const value of [undefined, null, '', 'removed-costume', '__proto__', 7]) assert.equal(resolveMascotVariant(value), 'classic');
  assert.equal(resolveMascotVariant('chits-ong'), 'chits-ong');
  assert.equal(createMascotPreferenceStore({ getFirstSync() { throw Error('read failure'); } }).getSnapshot().variant, 'classic');
});

test('selection broadcasts immediately and survives closing and reopening SQLite without altering notes or other settings', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'chits-mascot-'));
  try {
    const path = join(folder, 'chits.db');
    const db = database(path);
    await db.runAsync("INSERT INTO notes VALUES ('note', 'Keep my words')");
    await db.runAsync("INSERT INTO app_settings VALUES ('app_language', 'hi', 123)");
    const store = createMascotPreferenceStore(db);
    const events = [];
    const stop = store.subscribe(() => events.push(store.getSnapshot()));
    const save = store.select('chits-ong');
    assert.deepEqual(store.getSnapshot(), { variant: 'chits-ong', saving: true });
    await save;
    assert.deepEqual(events.at(-1), { variant: 'chits-ong', saving: false });
    stop(); db.raw.close();
    const reopened = database(path);
    assert.equal(createMascotPreferenceStore(reopened).getSnapshot().variant, 'chits-ong');
    assert.equal(reopened.getFirstSync('SELECT body FROM notes').body, 'Keep my words');
    assert.deepEqual({ ...reopened.getFirstSync("SELECT value, updated_at FROM app_settings WHERE key = 'app_language'") }, { value: 'hi', updated_at: 123 });
    const back = createMascotPreferenceStore(reopened);
    await back.select('classic');
    assert.equal(createMascotPreferenceStore(reopened).getSnapshot().variant, 'classic');
    reopened.raw.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('failed writes roll back to the last saved choice and allow retry', async () => {
  const db = database();
  let fail = false;
  const store = createMascotPreferenceStore({ ...db, async runAsync(...args) { if (fail) throw Error('disk full'); return db.runAsync(...args); } });
  await store.select('chits-ong');
  fail = true;
  await assert.rejects(store.select('classic'), /disk full/);
  assert.deepEqual(store.getSnapshot(), { variant: 'chits-ong', saving: false });
  assert.equal(db.getFirstSync('SELECT value FROM app_settings WHERE key = ?', MASCOT_SETTING_KEY).value, 'chits-ong');
  fail = false;
  await store.select('classic');
  assert.equal(store.getSnapshot().variant, 'classic');
  db.raw.close();
});

test('rapid choices serialize and an earlier failure cannot undo the latest choice', async () => {
  const db = database();
  let writes = 0;
  const store = createMascotPreferenceStore({ ...db, async runAsync(...args) { if (++writes === 1) throw Error('first failure'); return db.runAsync(...args); } });
  const first = store.select('chits-ong');
  const second = store.select('classic');
  const third = store.select('chits-ong');
  const results = await Promise.allSettled([first, second, third]);
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'fulfilled', 'fulfilled']);
  assert.deepEqual(store.getSnapshot(), { variant: 'chits-ong', saving: false });
  assert.equal(db.getFirstSync('SELECT value FROM app_settings WHERE key = ?', MASCOT_SETTING_KEY).value, 'chits-ong');
  db.raw.close();
});

test('unknown saved choices fall back without overwriting a future costume ID', async () => {
  const db = database();
  await db.runAsync('INSERT INTO app_settings VALUES (?, ?, 0)', MASCOT_SETTING_KEY, 'future-chits');
  assert.equal(createMascotPreferenceStore(db).getSnapshot().variant, 'classic');
  assert.equal(db.getFirstSync('SELECT value FROM app_settings').value, 'future-chits');
  db.raw.close();
});

test('Classic SVG is untouched; Ong adds only one shared accessory inside the moving tilted body', () => {
  assert.equal(mascotSvg(original, 'classic'), original);
  const ong = mascotSvg(original, 'chits-ong');
  assert.equal(ong.replace(`${BANDANA_MARKUP}\n`, ''), original, 'every original face, limb, body and animation byte is retained');
  assert.ok(ong.indexOf(BANDANA_MARKUP) > ong.indexOf('translate(640 610) rotate(-7)'));
  assert.ok(ong.indexOf(BANDANA_MARKUP) < ong.indexOf('<g id="face">'));
  assert.equal(ong.split('id="chits-bandana"').length - 1, 1);
  assert.doesNotMatch(mascotSvg(original, 'chits-ong', true), /<style>|animation:/);
});

test('the shared renderers cover every in-app source asset usage', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(read('src/features/onboarding/components/onboarding-mascot.tsx'), /ChitsMascot as OnboardingMascot/);
  assert.match(read('src/features/onboarding/welcome/chits-peek-mascot.tsx'), /useMascotPreference/);
  assert.match(read('src/features/focus/focus-ui.tsx'), /<ChitsMascot still/);
  assert.match(read('src/components/desk/paper-desk.tsx'), /<ChitsMascot still/);
  assert.match(read('src/app/_layout.tsx'), /<MascotProvider>/);
  assert.match(read('src/app/settings.tsx'), /<MascotSettings \/>/);
});
