import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { DAY, REVISIT_DEFAULTS, canonicalPair, connectionScore, discoverConnections, indexNote, keywords, pairKey, reviewSuggestion } from '../src/services/revisit-engine.ts';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';

const { createRevisitRepository } = await loadModule('src/db/revisit-repository');
const { REVISIT_SCHEMA } = await loadModule('src/db/revisit-schema');
const { getRevisitReport, getNoteConnections } = await loadModule('src/services/revisit-service');
const { createMessageRepository, createCardSubtaskRepository } = await loadModule('src/db/repositories');
const now = Date.now();
const note = (changes = {}) => ({ key: 'thought:a', title: 'GoGo wallet currency improvements', text: 'GoGo wallet currency conversion rounding reconciliation', createdAt: now - 40 * DAY, updatedAt: now - 30 * DAY, editedAt: now - 30 * DAY, progressAt: now - 30 * DAY, openedAt: null, revisitedAt: null, snoozedUntil: null, dismissedAt: null, dismissalCount: 0, excluded: false, pinned: false, boardId: null, reminderAt: null, total: 0, completed: 0, ...changes });
const task = (text, checked = false, id = 'g') => ({ type: 'text', text, list: { kind: 'checklist', id, checked } });
async function fixture(t, count = 0) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  const repo = createRevisitRepository(db);
  for (let i = 0; i < count; i++) await addMessage(db, `m${i}`);
  return { env, db, repo };
}
async function addMessage(db, id, text = 'GoGo wallet currency conversion rounding reconciliation', blocks = null) {
  await db.runAsync('INSERT INTO messages(id,text,type,created_at,updated_at,content_json) VALUES (?,?,\'text\',?,?,?)', id, text, now - 40 * DAY, now - 30 * DAY, blocks && JSON.stringify(blocks));
}
async function addCard(db, id = 'c') {
  await db.execAsync(`INSERT OR IGNORE INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1);
    INSERT OR IGNORE INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('col','b','Note',0,1,1);`);
  await db.runAsync('INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES (?,\'b\',\'col\',\'GoGo wallet currency improvements\',0,?,?)', id, now - 40 * DAY, now - 30 * DAY);
}

test('eligibility uses edits, opens, work, reminders and meaningful words, not age alone', () => {
  assert.equal(reviewSuggestion(note(), now).kind, 'worth');
  assert.equal(reviewSuggestion(note({ total: 5, completed: 2 }), now).kind, 'progress');
  for (const changes of [
    { editedAt: now }, { openedAt: now - DAY }, { revisitedAt: now - DAY }, { excluded: true },
    { snoozedUntil: now + DAY }, { reminderAt: now + DAY }, { text: '', title: 'Image' },
    { total: 3, completed: 3 }, { total: 3, completed: 1, progressAt: now - DAY },
  ]) assert.equal(reviewSuggestion(note(changes), now), null, JSON.stringify(changes));
  assert.ok(reviewSuggestion(note({ reminderAt: now - DAY }), now));
  assert.ok(reviewSuggestion(note({ text: '', pinned: true }), now));
});
test('threshold boundaries, snooze expiry, dismissal cooldowns and configurable ranking', () => {
  assert.equal(reviewSuggestion(note({ editedAt: now - 14 * DAY + 1 }), now), null);
  assert.ok(reviewSuggestion(note({ editedAt: now - 14 * DAY }), now));
  assert.ok(reviewSuggestion(note({ snoozedUntil: now }), now));
  assert.equal(reviewSuggestion(note({ dismissedAt: now - 89 * DAY, dismissalCount: 1 }), now), null);
  assert.equal(reviewSuggestion(note({ dismissedAt: now - 100 * DAY, dismissalCount: 2 }), now), null);
  const plain = reviewSuggestion(note(), now).score;
  assert.ok(reviewSuggestion(note({ pinned: true }), now).score > plain);
  assert.ok(reviewSuggestion(note({ editedAt: now - 180 * DAY, dismissedAt: now - 200 * DAY, dismissalCount: 1 }), now).score < reviewSuggestion(note({ editedAt: now - 180 * DAY }), now).score);
  assert.equal(reviewSuggestion(note(), now, { ...REVISIT_DEFAULTS, inactivityDays: 31 }), null);
});
test('normalization handles punctuation, compatibility Unicode, CJK, accents and generic terms', () => {
  assert.deepEqual(keywords('ＷＡＬＬＥＴ, wallet! Update notes IMPORTANT'), ['wallet']);
  assert.ok(keywords('台灣錢包貨幣設計').includes('錢包'));
  assert.deepEqual(keywords('café CAFÉ 💡 123'), ['café']);
  assert.equal(keywords('update notes important task').length, 0);
  assert.equal(keywords('💡🧾').length, 0);
  assert.ok(keywords('x '.repeat(100000)).length <= REVISIT_DEFAULTS.maxTerms);
});
test('similarity rejects board-only/generic overlaps and explains distinctive matches', () => {
  const a = indexNote(note({ boardId: 'same' }));
  const b = indexNote(note({ key: 'thought:b', boardId: 'same' }));
  const result = connectionScore(a, b, new Map(), 2);
  assert.ok(result.confidence >= REVISIT_DEFAULTS.confidenceThreshold);
  assert.ok(result.terms.includes('wallet'));
  const unrelated = indexNote(note({ key: 'thought:c', title: 'Garden seedlings', text: 'Tomato watering sunlight', boardId: 'same' }));
  assert.equal(connectionScore(a, unrelated, new Map(), 2), null);
  const generic = indexNote(note({ title: 'Important notes update', text: 'new notes important update', key: 'thought:g' }));
  assert.equal(connectionScore(generic, generic, new Map(), 2), null);
});
test('pair identity is canonical, collision safe, rejects self-links and filters rejected pairs', () => {
  assert.deepEqual(canonicalPair('b', 'a'), ['a', 'b']);
  assert.throws(() => canonicalPair('a', 'a'));
  assert.notEqual(pairKey('a:b', 'c'), pairKey('a', 'b:c'));
  const indexed = [indexNote(note()), indexNote(note({ key: 'thought:b' }))];
  assert.equal([...discoverConnections(indexed, new Set())].at(-1).length, 1);
  assert.equal([...discoverConnections(indexed, new Set([pairKey('thought:a', 'thought:b')]))].at(-1).length, 0);
  assert.deepEqual([...discoverConnections([], new Set())].at(-1), []);
  assert.deepEqual([...discoverConnections(indexed.slice(0, 1), new Set())].at(-1), []);
});

test('migration is additive, repeatable and initializes existing content conservatively', async (t) => {
  const { db } = await fixture(t);
  await addMessage(db, 'a', 'Keep original words', [task('Keep state', true)]);
  const before = await db.getFirstAsync('SELECT * FROM messages');
  await db.execAsync(REVISIT_SCHEMA);
  await migration.migrateDatabase(db);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM messages'), before);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 27);
  assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length, 0);
});
test('a real schema-26 upgrade preserves checklist bytes and initializes its existing notes', async (t) => {
  const { db } = await fixture(t);
  const triggers = await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'revisit_%'");
  for (const trigger of triggers) await db.execAsync(`DROP TRIGGER ${trigger.name}`);
  await db.execAsync('DROP TABLE revisit_events; DROP TABLE note_relationships; DROP TABLE revisit_rejections; DROP TABLE revisit_notes; DROP TABLE revisit_revision; PRAGMA user_version = 26;');
  await addMessage(db, 'old', 'Original', [task('Still unchecked')]);
  const before = await db.getFirstAsync('SELECT * FROM messages');
  await migration.migrateDatabase(db);
  assert.deepEqual(await db.getFirstAsync('SELECT * FROM messages'), before);
  const restored = await createRevisitRepository(db).get('thought:old');
  assert.equal(restored.total, 1); assert.equal(restored.completed, 0);
  assert.equal(restored.progressAt, before.updated_at);
});
test('linked cards aggregate inline and card subtasks exactly once and exclude hidden/archived sources', async (t) => {
  const { db, repo } = await fixture(t);
  await addMessage(db, 'a', 'Checklist', [task('Done', true), task('Next')]);
  await addCard(db);
  await db.runAsync('INSERT INTO card_messages VALUES (?,?,0)', 'c', 'a');
  const tasks = createCardSubtaskRepository(db);
  await tasks.add('c', 'Card action');
  let notes = await repo.page();
  assert.equal(notes.length, 1); assert.equal(notes[0].key, 'card:c');
  assert.equal(notes[0].total, 3); assert.equal(notes[0].completed, 1);
  await db.runAsync('UPDATE messages SET is_hidden_content = 1 WHERE id = ?', 'a');
  assert.equal((await repo.page()).length, 0);
  await db.runAsync('UPDATE messages SET is_hidden_content = 0 WHERE id = ?', 'a');
  await db.runAsync('UPDATE boards SET archived_at = ? WHERE id = ?', now, 'b');
  assert.equal((await repo.page()).length, 0);
});
test('meaningful progress survives opens/pins; toggles, reorder, rename, add and remove invalidate progress', async (t) => {
  const { db, repo } = await fixture(t);
  await addMessage(db, 'a', 'Task', [task('First'), task('Second', true)]);
  const original = await repo.get('thought:a');
  await repo.opened('thought:a', now);
  await db.runAsync('UPDATE messages SET pinned = 1,updated_at = ? WHERE id = ?', now, 'a');
  assert.equal((await repo.get('thought:a')).progressAt, original.progressAt);
  assert.equal((await repo.get('thought:a')).editedAt, original.editedAt);
  for (const blocks of [[task('First', true), task('Second', true)], [task('Second', true), task('First', true)], [task('Renamed', true), task('First', true)], [task('Added'), task('Renamed', true), task('First', true)], [task('Added')]]) {
    await db.runAsync('UPDATE messages SET content_json = ?,updated_at = ? WHERE id = ?', JSON.stringify(blocks), now, 'a');
    assert.equal((await repo.get('thought:a')).progressAt, now);
  }
  const progress = (await repo.get('thought:a')).progressAt;
  await db.runAsync('UPDATE messages SET content_json = ?,updated_at = ? WHERE id = ?', JSON.stringify([task('Added'), { type: 'image', attachmentId: 'photo' }]), now + 100, 'a');
  assert.equal((await repo.get('thought:a')).progressAt, progress, 'image insertion is not checklist progress');
  await db.runAsync('UPDATE messages SET content_json = ? WHERE id = ?', '["malformed",5,null]', 'a');
  assert.equal((await repo.get('thought:a')).total, 0);
});
test('snoozes, repeated dismissals, exclusions, review history and preferences persist across connections', async (t) => {
  const { db, env, repo } = await fixture(t, 1);
  await repo.review('thought:m0', 'dismiss', undefined, now);
  await repo.review('thought:m0', 'dismiss', undefined, now + 1);
  await repo.review('thought:m0', 'snooze', now + DAY, now);
  await repo.setPreferences({ enabled: false, inactivityDays: 30 });
  const reopened = await env.sqlite.openDatabaseAsync('chits.db');
  const next = createRevisitRepository(reopened);
  assert.equal((await next.get('thought:m0')).dismissalCount, 2);
  assert.equal((await next.get('thought:m0')).snoozedUntil, now + DAY);
  assert.deepEqual(await next.preferences(), { enabled: false, inactivityDays: 30 });
  await next.review('thought:m0', 'exclude'); assert.equal((await next.get('thought:m0')).excluded, true);
  await next.review('thought:m0', 'include'); assert.equal((await next.get('thought:m0')).excluded, false);
  assert.equal((await db.getAllAsync('SELECT * FROM revisit_events')).length, 5);
  await assert.rejects(repo.review('thought:m0', 'snooze', now - 1, now));
  await assert.rejects(repo.setPreferences({ enabled: true, inactivityDays: 0 }));
});
test('relationship operations prevent duplicates, allow relinking, and cascade on soft and hard deletion', async (t) => {
  const { db, repo } = await fixture(t, 3);
  await repo.link('thought:m1', 'thought:m0'); await repo.link('thought:m0', 'thought:m1', 'reference');
  assert.equal((await repo.relationships()).length, 1);
  assert.equal((await repo.relationships())[0].relationship_type, 'reference');
  await repo.unlink('thought:m1', 'thought:m0');
  assert.equal((await repo.rejections()).length, 1);
  await repo.link('thought:m0', 'thought:m1');
  assert.equal((await repo.rejections()).length, 0);
  await assert.rejects(repo.link('thought:m0', 'thought:m0'));
  await assert.rejects(repo.link('thought:m0', 'thought:missing'));
  await repo.link('thought:m1', 'thought:m2');
  await db.runAsync('UPDATE messages SET deleted_at = ? WHERE id = ?', now, 'm1');
  assert.equal((await repo.relationships()).length, 0);
  await db.runAsync('DELETE FROM messages WHERE id = ?', 'm0');
  assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length, 0);
});
test('relationship writes and review actions roll back fully on failure', async (t) => {
  const { db, env, repo } = await fixture(t, 2);
  await repo.reject('thought:m0', 'thought:m1');
  env.fault = (method, sql) => { if (method === 'sql' && String(sql).includes('INSERT INTO note_relationships')) throw new Error('injected write error'); };
  await assert.rejects(repo.link('thought:m0', 'thought:m1'));
  env.fault = null;
  assert.equal((await repo.rejections()).length, 1); assert.equal((await repo.relationships()).length, 0);
  env.fault = (method, sql) => { if (method === 'sql' && String(sql).includes('INSERT INTO revisit_events')) throw new Error('injected review error'); };
  await assert.rejects(repo.review('thought:m0', 'dismiss'));
  env.fault = null;
  assert.equal((await repo.get('thought:m0')).dismissalCount, 0);
});
test('organizing a thought carries accepted links, rejected pairs and review decisions onto its card', async (t) => {
  const { db, repo } = await fixture(t, 3);
  await repo.link('thought:m0', 'thought:m1', 'reference');
  await repo.reject('thought:m0', 'thought:m2');
  await repo.review('thought:m0', 'snooze', now + DAY);
  await addCard(db);
  await db.runAsync('INSERT INTO card_messages VALUES (?,?,0)', 'c', 'm0');
  const links = await repo.relationships('card:c');
  assert.equal(links.length, 1); assert.equal(links[0].relationship_type, 'reference');
  assert.equal((await repo.relationships('thought:m0')).length, 0);
  assert.equal((await repo.get('card:c')).snoozedUntil, now + DAY);
  assert.ok((await repo.rejections()).some((pair) => pair.note_a === 'card:c'));
  assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length, 0);
});
test('explicit completion preserves all formatting/attachments, rejects stale plans and rolls back failures', async (t) => {
  const { db, env, repo } = await fixture(t);
  const invalid = { type: 'text', text: 'Not a saved checkbox', list: { kind: 'checklist', checked: false } };
  const content = [{ type: 'text', text: 'Intro', list: { kind: 'bullet', id: 'b' } }, task('One'), { type: 'image', attachmentId: 'photo' }, task('Two', true), invalid];
  await addMessage(db, 'a', 'Keep text', content);
  const stale = await repo.completionPlan('thought:a');
  await db.runAsync('UPDATE messages SET content_json = ?, updated_at = ? WHERE id = ?', JSON.stringify([...content, task('Three')]), now, 'a');
  await assert.rejects(repo.complete(stale), /changed/);
  const plan = await repo.completionPlan('thought:a'); assert.equal(plan.count, 2);
  env.fault = (method, sql) => { if (method === 'sql' && String(sql).includes('UPDATE messages SET content_json')) throw new Error('interrupted'); };
  await assert.rejects(repo.complete(plan)); env.fault = null;
  assert.equal((await repo.get('thought:a')).completed, 1);
  await repo.complete(plan);
  const row = await db.getFirstAsync('SELECT text,content_json FROM messages');
  assert.equal(row.text, 'Keep text');
  const blocks = JSON.parse(row.content_json);
  assert.deepEqual(blocks[0], content[0]); assert.deepEqual(blocks[2], content[2]);
  assert.deepEqual(blocks[4], invalid);
  assert.equal((await repo.get('thought:a')).completed, 3);
});
test('card completion covers both saved checklist systems and rejects archived or hidden notes', async (t) => {
  const { db, repo } = await fixture(t);
  await addMessage(db, 'a', 'Checklist', [task('Inline')]); await addCard(db);
  await db.runAsync('INSERT INTO card_messages VALUES (?,?,0)', 'c', 'a');
  await createCardSubtaskRepository(db).add('c', 'Subtask');
  const plan = await repo.completionPlan('card:c'); assert.equal(plan.count, 2);
  await repo.complete(plan); assert.equal((await repo.get('card:c')).completed, 2);
  await db.runAsync('UPDATE messages SET is_hidden_content = 1');
  await assert.rejects(repo.completionPlan('card:c'));
});
test('backup/restore round trip retains new metadata without duplicate links', async (t) => {
  const { db, env, repo } = await fixture(t, 3);
  await repo.link('thought:m0', 'thought:m1', 'follow-up');
  await repo.reject('thought:m1', 'thought:m2');
  await repo.review('thought:m0', 'snooze', now + DAY);
  await repo.setPreferences({ enabled: false, inactivityDays: 7 });
  const created = await service.createBackup(db);
  const checked = await service.validateBackup(created.uri); assert.equal(checked.valid, true, checked.reason);
  await service.restoreBackup(checked, db);
  const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db')); t.after(() => restored.close());
  assert.equal(restored.prepare('SELECT count(*) AS n FROM note_relationships').get().n, 1);
  assert.equal(restored.prepare('SELECT relationship_type FROM note_relationships').get().relationship_type, 'follow-up');
  assert.equal(restored.prepare('SELECT count(*) AS n FROM revisit_rejections').get().n, 1);
  assert.equal(restored.prepare('SELECT snoozed_until FROM revisit_notes WHERE message_id = ?').get('m0').snoozed_until, now + DAY);
  assert.equal(restored.prepare('SELECT count(*) AS n FROM revisit_events').get().n, 1);
  assert.equal(JSON.parse(restored.prepare("SELECT value FROM app_settings WHERE key = 'revisit_preferences'").get().value).enabled, false);
  assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length, 0);
});
test('reports are cached, expire and invalidate on content, checklist and rejection changes', async (t) => {
  const { db, repo } = await fixture(t, 2);
  const first = await getRevisitReport(db, now);
  assert.equal(typeof first.fts5Supported, 'boolean');
  assert.equal(first.reviews.length, 2); assert.equal(first.connections.length, 1);
  assert.equal(await getRevisitReport(db, now), first);
  await repo.reject('thought:m0', 'thought:m1');
  assert.equal((await getRevisitReport(db, now)).connections.length, 0);
  await repo.review('thought:m0', 'snooze', now + DAY, now);
  assert.equal((await getRevisitReport(db, now)).reviews.length, 1);
  assert.equal((await getRevisitReport(db, now + DAY)).reviews.length, 2);
  await repo.setPreferences({ enabled: false, inactivityDays: 14 });
  const disabled = await getRevisitReport(db, now); assert.equal(disabled.reviews.length, 0); assert.equal(disabled.connections.length, 0);
});
test('interrupted recommendation work never commits a stale or hidden-note report', async (t) => {
  const { db } = await fixture(t, 2);
  const original = db.getAllAsync.bind(db);
  let changed = false;
  db.getAllAsync = async (sql, ...args) => {
    const result = await original(sql, ...args);
    if (!changed && sql.includes('FROM revisit_notes n')) {
      changed = true;
      await db.runAsync('UPDATE messages SET is_hidden_content = 1 WHERE id = ?', 'm0');
    }
    return result;
  };
  await assert.rejects(getRevisitReport(db, now), /changed/);
  const retried = await getRevisitReport(db, now);
  assert.equal(retried.notes.length, 1); assert.equal(retried.notes[0].key, 'thought:m1');
});
test('empty, image-only, untitled, multilingual and oversized notes remain safe', async (t) => {
  const { db, repo } = await fixture(t);
  assert.equal((await getRevisitReport(db, now)).notes.length, 0);
  await addMessage(db, 'image', null, [{ type: 'image', attachmentId: 'photo' }]);
  await addMessage(db, 'unicode', '台灣錢包貨幣設計 '.repeat(5000));
  const image = await repo.get('thought:image'); assert.equal(image.total, 0); assert.equal(reviewSuggestion(image, now), null);
  assert.ok((await getRevisitReport(db, now)).notes.some((item) => item.key === 'thought:unicode'));
});
test('focused discovery is bidirectional, caches results and works when FTS5 is unavailable', async (t) => {
  const { db, repo } = await fixture(t, 2);
  await addMessage(db, 'garden', 'Tomato seedlings watering compost sunlight');
  const read = db.getFirstAsync.bind(db);
  db.getFirstAsync = async (sql, ...args) => sql.includes('sqlite_compileoption_used') ? { enabled: 0 } : read(sql, ...args);
  const focused = await getNoteConnections(db, 'thought:m1', now);
  assert.equal(focused.length, 1);
  assert.ok([focused[0].a.key, focused[0].b.key].includes('thought:m0'));
  assert.equal(await getNoteConnections(db, 'thought:m1', now), focused);
  assert.equal((await getRevisitReport(db, now)).fts5Supported, false);
  await repo.reject('thought:m0', 'thought:m1');
  assert.equal((await getNoteConnections(db, 'thought:m1', now)).length, 0);
});
test('large text is bounded while all 2000 actual checklist states remain counted', async (t) => {
  const { db, repo } = await fixture(t);
  const blocks = Array.from({ length: 2000 }, (_, i) => task(`Action ${i}`, i % 2 === 0));
  await addMessage(db, 'large', 'Large meaningful research content '.repeat(30000), blocks);
  const result = await repo.get('thought:large');
  assert.equal(result.total, 2000); assert.equal(result.completed, 1000);
  assert.equal(result.text.length, 12000);
  blocks[1999].list.checked = true;
  await db.runAsync('UPDATE messages SET content_json = ?,updated_at = ?', JSON.stringify(blocks), now);
  assert.equal((await repo.get('thought:large')).completed, 1001);
});
test('100, 1000 and 5000-note workloads have bounded candidate work and warm-cache reads', async (t) => {
  const { db } = await fixture(t);
  let inserted = 0;
  for (const size of [100, 1000, 5000]) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (let i = inserted; i < size; i++) await addMessage(tx, `bench-${String(i).padStart(5, '0')}`, `Project${i} subject${i} distinctive${i} research${i} wallet currency decisions`);
    });
    inserted = size;
    const started = performance.now(); const report = await getRevisitReport(db, now);
    const cold = performance.now() - started;
    const cachedStart = performance.now(); assert.equal(await getRevisitReport(db, now), report);
    const warm = performance.now() - cachedStart;
    assert.equal(report.notes.length, size); assert.ok(report.reviews.length <= 3); assert.ok(report.connections.length <= 3);
    assert.ok(cold < 15000, `unexpected desktop regression: ${cold}ms`);
    t.diagnostic(`${size} notes: cold ${cold.toFixed(1)} ms; cached ${warm.toFixed(2)} ms (Node SQLite, not device timing)`);
  }
});
