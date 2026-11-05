import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasReader } from '../src/services/canvas-read.ts';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('a transient SDK 57 statement lock retries without publishing an empty graph or reporting a failure', async () => {
  const graph = [{ note_a: 'thought:a', note_b: 'thought:b', relationship_type: 'reference' }];
  const values = []; const errors = []; const waits = []; let calls = 0;
  const reader = createCanvasReader({ read: async () => {
    if (++calls < 3) throw new Error("Call to function 'NativeStatement.finalizeAsync' has been rejected: database is locked");
    return graph;
  }, onValue: (value) => values.push(value), onError: (error) => errors.push(error), wait: async (ms) => { waits.push(ms); } });
  await reader.refresh();
  assert.equal(calls, 3); assert.deepEqual(values, [graph]); assert.deepEqual(errors, []); assert.deepEqual(waits, [40, 120]);
});

test('SQLite busy and locked error codes are retried, but retries remain bounded', async () => {
  for (const error of [{ code: 5 }, { code: 6 }, { code: 'SQLITE_BUSY' }, { message: 'database table is locked' }]) {
    const errors = []; let calls = 0;
    const reader = createCanvasReader({ read: async () => { calls++; throw error; }, onValue: () => assert.fail('must not publish failed reads'), onError: (value) => errors.push(value), wait: async () => {} });
    await reader.refresh(); assert.equal(calls, 4); assert.deepEqual(errors, [error]);
  }
});

test('a permanent error is reported once and a manual retry can recover', async () => {
  const error = new Error('no such table: note_relationships'); const errors = []; const values = []; let calls = 0;
  const reader = createCanvasReader({ read: async () => { if (++calls === 1) throw error; return ['recovered']; }, onValue: (value) => values.push(value), onError: (value) => errors.push(value), wait: async () => assert.fail('not a transient lock') });
  await reader.refresh(); assert.equal(calls, 1); assert.deepEqual(errors, [error]);
  await reader.refresh(); assert.deepEqual(values, [['recovered']]);
});

test('an older in-flight refresh cannot restore a relationship removed by a newer refresh', async () => {
  const first = deferred(); const second = deferred(); const values = []; let calls = 0;
  const reader = createCanvasReader({ read: () => ++calls === 1 ? first.promise : second.promise, onValue: (value) => values.push(value), onError: assert.fail });
  const oldRefresh = reader.refresh(); const newRefresh = reader.refresh();
  second.resolve([]); await newRefresh; first.resolve(['old pair']); await oldRefresh;
  assert.deepEqual(values, [[]]);
});

test('unmount cancels both a pending result and a pending failure', async () => {
  for (const reject of [false, true]) {
    const read = deferred(); const reader = createCanvasReader({ read: () => read.promise, onValue: () => assert.fail('unmounted'), onError: () => assert.fail('unmounted') });
    const request = reader.refresh(); reader.cancel();
    if (reject) read.reject(new Error('database is locked')); else read.resolve(['old pair']);
    await request;
  }
});

test('unmount during backoff prevents the next query and a later focused mount can refresh', async () => {
  const wait = deferred(); const values = []; let calls = 0;
  const reader = createCanvasReader({ read: async () => { if (++calls === 1) throw new Error('database is locked'); return ['fresh']; }, onValue: (value) => values.push(value), onError: assert.fail, wait: () => wait.promise });
  const oldRefresh = reader.refresh(); await Promise.resolve(); reader.cancel(); wait.resolve(); await oldRefresh;
  assert.equal(calls, 1); assert.deepEqual(values, []);
  await reader.refresh(); assert.deepEqual(values, [['fresh']]);
});

test('a failed refresh retains the last successfully loaded graph', async () => {
  let current = null; let calls = 0;
  const reader = createCanvasReader({ read: async () => { if (++calls > 1) throw new Error('database is locked'); return ['existing pair']; }, onValue: (value) => { current = value; }, onError: () => {}, wait: async () => {} });
  await reader.refresh(); await reader.refresh(); assert.deepEqual(current, ['existing pair']);
});

test('retrying canvas bootstrap preserves saved positions and a show-all preference', async (t) => {
  const env = runtime(); t.after(() => env.cleanup()); const db = await env.sqlite.openDatabaseAsync('chits.db'); await migration.migrateDatabase(db);
  await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES ('a','Keep me','text',1,2)");
  const { createNoteCanvasRepository } = await loadModule('src/db/note-canvas-repository'); const repo = createNoteCanvasRepository(db);
  const positions = new Map([['thought:a', { x: 8040, y: -3200, z: 12 }]]); await repo.savePlacements([...positions]);
  await repo.savePrefs({ miniMap: false, hintDone: true, connections: 'all', views: { all: { x: -8000, y: 3200, zoom: 1 } } });
  // A second SQLite connection holds the same kind of write that overlaps
  // mounting the canvas. The first bootstrap really fails with SQLITE_BUSY.
  const blocker = await env.sqlite.openDatabaseAsync('chits.db');
  await db.execAsync('PRAGMA busy_timeout = 0'); await blocker.execAsync('BEGIN IMMEDIATE');
  await blocker.runAsync("INSERT INTO app_settings VALUES ('qa_layout_switch','board',0)");
  let backoffs = 0;
  const values = []; const reader = createCanvasReader({ read: () => repo.load(), onValue: (value) => values.push(value), onError: assert.fail, wait: async () => { backoffs++; await blocker.execAsync('COMMIT'); } });
  await reader.refresh(); assert.equal(backoffs, 1); assert.equal(values.length, 1); assert.deepEqual(values[0].positions, positions); assert.equal(values[0].prefs.connections, 'all');
  assert.equal((await db.getFirstAsync("SELECT text FROM messages WHERE id='a'")).text, 'Keep me');
});
