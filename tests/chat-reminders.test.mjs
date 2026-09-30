import assert from 'node:assert/strict';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createMessageRepository } = await loadModule('src/db/repositories.ts');

test('Chat loads its own pending reminders and clears removed or completed reminders', async (t) => {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chat-reminders.db');
  await migration.migrateDatabase(db);
  const repository = createMessageRepository(db);
  await db.runAsync("INSERT INTO messages (id, text, type, created_at, updated_at, pinned) VALUES ('thought', 'Call home', 'text', 1, 1, 1), ('photo', NULL, 'photo', 2, 2, 0), ('plain', 'No reminder', 'text', 3, 3, 0)");
  const future = Date.now() + 3_600_000;
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'thought', future);
  await db.runAsync("INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES ('photo', 1, 1, 1)");

  const thought = await repository.getActiveById('thought');
  assert.equal(thought.organization, null, 'a board is not required for a Chat reminder');
  assert.equal(thought.reminderAt, future);
  assert.equal((await repository.listPinned())[0].reminderAt, future);
  assert.equal((await repository.getActiveById('plain')).reminderAt, null);
  const page = await repository.listTimeline();
  assert.equal(page.items.find((item) => item.kind === 'message' && item.message.id === 'photo').message.reminderAt, 1, 'overdue reminders remain visible until completed or removed');

  await db.runAsync("UPDATE message_reminders SET completed_at = 10 WHERE message_id = 'photo'");
  await db.runAsync("DELETE FROM message_reminders WHERE message_id = 'thought'");
  const refreshed = await repository.getActiveByIds(['thought', 'photo', 'plain']);
  assert.equal(refreshed.length, 3);
  assert.ok(refreshed.every((message) => message.reminderAt === null));
  assert.ok(refreshed.every((message) => message.updatedAt === message.createdAt), 'reminders do not edit message text or timestamps');
});

test('Chat refreshes reminders across loaded history batches and excludes inactive messages', async (t) => {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chat-reminder-history.db');
  await migration.migrateDatabase(db);
  const repository = createMessageRepository(db);
  const ids = Array.from({ length: 205 }, (_, index) => `message-${index}`);
  for (const id of ids) await db.runAsync('INSERT INTO messages (id, text, type, created_at, updated_at) VALUES (?, ?, ?, 1, 1)', id, id, 'text');
  await db.runAsync("UPDATE messages SET archived_at = 1 WHERE id = 'message-0'");
  await db.runAsync("UPDATE messages SET deleted_at = 1 WHERE id = 'message-1'");
  await db.runAsync("INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES ('message-204', 123, 1, 1)");
  const refreshed = await repository.getActiveByIds(ids);
  assert.equal(refreshed.length, 203);
  assert.equal(refreshed.find((message) => message.id === 'message-204').reminderAt, 123);
  assert.deepEqual(await repository.getActiveByIds([]), []);
});
