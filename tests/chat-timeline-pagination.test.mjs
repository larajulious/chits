import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function productionTimelineSql(withCursor) {
  const source = read('src/db/repositories.ts');
  const match = source.match(/const rows = await database\.getAllAsync<\{ entryKind:[\s\S]+?\}>\(`([\s\S]+?)`,\n\s+\.\.\.\(page\.before/);
  assert.ok(match, 'timeline query must remain discoverable for its SQLite regression test');
  return match[1]
    .replace('${eventPlaceholders}', '?, ?')
    .replace('${messageCursorClause}', withCursor ? 'AND (m.created_at, m.id) < (?, ?)' : '')
    .replace('${eventCursorClause}', withCursor ? 'AND (e.created_at, e.id) < (?, ?)' : '');
}

function page(database, limit, before = null) {
  const sql = productionTimelineSql(Boolean(before));
  const createdAt = before?.createdAt ?? null;
  const sortId = before?.sortId ?? null;
  const messageTieId = sortId?.startsWith('m:') ? sortId.slice(2) : '';
  const eventTieId = sortId?.startsWith('e:') ? sortId.slice(2) : '\uffff';
  const branchLimit = limit + 1;
  const parameters = [
    ...(before ? [createdAt, messageTieId] : []), branchLimit,
    'board_created', 'column_created',
    ...(before ? [createdAt, eventTieId] : []), branchLimit,
    branchLimit,
  ];
  const rows = database.prepare(sql).all(...parameters);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const oldest = items.at(-1);
  return { items, hasMore, nextCursor: oldest ? { createdAt: oldest.createdAt, sortId: oldest.sortId } : null };
}

test('mixed chat history uses an exclusive deterministic keyset cursor', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE messages (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, archived_at INTEGER, deleted_at INTEGER);
    CREATE TABLE timeline_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);

  const insertMessage = database.prepare('INSERT INTO messages VALUES (?, ?, ?, ?)');
  const insertEvent = database.prepare('INSERT INTO timeline_events VALUES (?, ?, ?)');
  for (let index = 0; index < 83; index += 1) insertMessage.run(`message-${String(index).padStart(3, '0')}`, 1_000 + Math.floor(index / 4), null, null);
  for (let index = 0; index < 38; index += 1) insertEvent.run(`event-${String(index).padStart(3, '0')}`, index % 2 ? 'column_created' : 'board_created', 1_000 + Math.floor(index / 3));
  insertMessage.run('archived', 9_999, 1, null);
  insertMessage.run('deleted', 9_999, null, 1);
  insertEvent.run('unsupported', 'reminder_created', 9_999);

  const seen = [];
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const result = page(database, 17, cursor);
    seen.push(...result.items);
    cursor = result.nextCursor;
    hasMore = result.hasMore;
  }

  assert.equal(seen.length, 121);
  assert.equal(new Set(seen.map((row) => row.sortId)).size, seen.length, 'page boundaries must never duplicate an item');
  assert.equal(seen.some((row) => ['archived', 'deleted', 'unsupported'].includes(row.messageId ?? row.eventId)), false);
  for (let index = 1; index < seen.length; index += 1) {
    const newer = seen[index - 1];
    const older = seen[index];
    assert.ok(newer.createdAt > older.createdAt || (newer.createdAt === older.createdAt && newer.sortId > older.sortId), 'created_at and composite id must descend deterministically');
  }

  const exhausted = page(database, 17, cursor);
  assert.deepEqual(exhausted.items, []);
  assert.equal(exhausted.hasMore, false);

  database.exec('CREATE INDEX idx_messages_timeline_cursor ON messages(deleted_at, archived_at, created_at DESC, id DESC); CREATE INDEX idx_timeline_events_cursor ON timeline_events(created_at DESC, id DESC, event_type);');
  const cursorSql = productionTimelineSql(true);
  const plan = database.prepare(`EXPLAIN QUERY PLAN ${cursorSql}`).all(1_010, 'message-010', 18, 'board_created', 'column_created', 1_010, '\uffff', 18, 18).map((row) => row.detail).join('\n');
  assert.match(plan, /idx_messages_timeline_cursor/);
  assert.match(plan, /idx_timeline_events_cursor/);
  assert.match(plan, /\(created_at,id\)<\(\?,\?\)/);
});

test('timeline migration and native list retain pagination safeguards', () => {
  const migrations = read('src/db/migrations.ts');
  const screen = read('src/app/(tabs)/chat.native.tsx');

  assert.match(migrations, /idx_messages_timeline_cursor[\s\S]+created_at DESC, id DESC/);
  assert.match(migrations, /idx_timeline_events_cursor[\s\S]+created_at DESC, id DESC/);
  assert.match(screen, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
  assert.match(screen, /if \(!hasMoreRef\.current \|\| loadingMore\.current/);
  assert.match(screen, /Loading older messages/);
  assert.match(screen, /Jump to latest message/);
  assert.doesNotMatch(screen, />\s*(Load more|Show older messages|Previous page)\s*</i);
});

test('10,000 mixed timeline items remain page-bounded and duplicate-free', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE messages (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, archived_at INTEGER, deleted_at INTEGER);
    CREATE TABLE timeline_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX idx_messages_timeline_cursor ON messages(deleted_at, archived_at, created_at DESC, id DESC);
    CREATE INDEX idx_timeline_events_cursor ON timeline_events(created_at DESC, id DESC, event_type);
    BEGIN;
  `);
  const insertMessage = database.prepare('INSERT INTO messages VALUES (?, ?, NULL, NULL)');
  const insertEvent = database.prepare('INSERT INTO timeline_events VALUES (?, ?, ?)');
  for (let index = 0; index < 7_500; index += 1) insertMessage.run(`m-${String(index).padStart(5, '0')}`, 10_000 + Math.floor(index / 5));
  for (let index = 0; index < 2_500; index += 1) insertEvent.run(`e-${String(index).padStart(5, '0')}`, index % 2 ? 'column_created' : 'board_created', 10_000 + Math.floor(index / 5));
  database.exec('COMMIT;');

  const ids = new Set();
  let cursor = null;
  let pages = 0;
  do {
    const result = page(database, 50, cursor);
    assert.ok(result.items.length <= 50, 'only one bounded page may enter memory per query');
    result.items.forEach((row) => ids.add(row.sortId));
    cursor = result.nextCursor;
    pages += 1;
    if (!result.hasMore) break;
  } while (pages < 201);

  assert.equal(pages, 200);
  assert.equal(ids.size, 10_000);
});
