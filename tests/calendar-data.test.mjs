import assert from 'node:assert/strict';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const calendar = await loadModule('src/features/calendar/calendar-data.ts');

test('Calendar reads card and Chat reminders from their source rows once, including Space context', async (t) => {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('calendar.db');
  await migration.migrateDatabase(db);
  await db.runAsync("INSERT INTO boards (id, name, created_at, updated_at) VALUES ('b', 'Work', 1, 1)");
  await db.runAsync("INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('col', 'b', 'Notes', 0, 1, 1)");
  await db.runAsync("INSERT INTO cards (id, board_id, column_id, title, position, created_at, updated_at) VALUES ('c', 'b', 'col', 'Pay electricity', 0, 1, 1)");
  await db.runAsync("INSERT INTO messages (id, text, type, created_at, updated_at) VALUES ('m', 'Call Mom', 'text', 1, 1), ('hidden', 'secret phrase', 'text', 2, 2)");
  await db.runAsync('INSERT INTO card_reminders (card_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'c', new Date(2026, 9, 15, 9).getTime());
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'm', new Date(2026, 9, 15, 18).getTime());
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'hidden', new Date(2026, 9, 16, 9).getTime());
  await db.runAsync("UPDATE messages SET is_hidden_content = 1 WHERE id = 'hidden'");
  await db.runAsync("INSERT INTO space_placements (id, message_id, space_id, x, y, rotation, color, z_index, pinned_at, updated_at) VALUES ('placement', 'm', 'fridge', 0, 0, 0, '#fff', 1, 1, 1)");

  const items = await calendar.getCalendarItems(db);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => [item.kind, item.id, item.source]), [['card', 'c', 'Board · Work'], ['message', 'm', 'Space · Fridge'], ['message', 'hidden', 'Chat']]);
  assert.equal(items[2].title, 'Hidden note');
  assert.equal(items[2].searchText, '');
  assert.equal(calendar.getRemindersForDate(items, new Date(2026, 9, 15)).length, 2);
  assert.equal(calendar.getRemindersForRange(items, new Date(2026, 9, 15), new Date(2026, 9, 16)).length, 2);
  assert.equal(calendar.getOverdueReminders(items, new Date(2026, 9, 15, 12).getTime()).length, 1);
  assert.equal(calendar.localDayKey(calendar.addLocalDays(new Date(2026, 2, 7), 2)), '2026-03-09');
  await db.runAsync("UPDATE message_reminders SET completed_at = 99 WHERE message_id = 'm'");
  assert.equal((await calendar.getCalendarItems(db)).length, 2);
  await db.runAsync("DELETE FROM messages WHERE id = 'm'");
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM message_reminders')).count, 1);
});

test('migration adds completion and message reminders while retaining existing card schedules', async (t) => {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('upgrade.db');
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE cards (id TEXT PRIMARY KEY);
    CREATE TABLE messages (id TEXT PRIMARY KEY);
    CREATE TABLE card_reminders (card_id TEXT PRIMARY KEY, scheduled_at INTEGER NOT NULL, notification_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE);
    INSERT INTO cards VALUES ('old-card');
    INSERT INTO card_reminders VALUES ('old-card', 1000, 'old-notification', 1, 1);
    PRAGMA user_version = 21;
  `);
  await migration.migrateDatabase(db);
  assert.deepEqual({ ...await db.getFirstAsync('SELECT scheduled_at, notification_id, completed_at FROM card_reminders') }, { scheduled_at: 1000, notification_id: 'old-notification', completed_at: null });
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, migration.LATEST_SCHEMA_VERSION);
  assert.ok(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'message_reminders'"));
});
