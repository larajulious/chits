import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createBoardRepository } = await loadModule('src/db/repositories');

// Real migrated schema (every foreign key and cascade), real repository code.
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec(`
    INSERT INTO boards (id, name, created_at, updated_at) VALUES ('doomed', 'Home projects', 1, 1), ('keeper', 'Work', 1, 1);
    INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('todo', 'doomed', 'To do', 0, 1, 1), ('done', 'doomed', 'Done', 1, 1, 1), ('work-col', 'keeper', 'Inbox', 0, 1, 1);
    INSERT INTO cards (id, board_id, column_id, title, position, archived_at, created_at, updated_at) VALUES
      ('door', 'doomed', 'todo', 'Fix the door', 0, NULL, 1, 1),
      ('old', 'doomed', 'done', 'Archived card', 0, 5, 1, 1),
      ('work', 'keeper', 'work-col', 'Work card', 0, NULL, 1, 1);
    INSERT INTO messages (id, text, type, created_at, updated_at) VALUES ('only-here', 'Buy hinges', 'text', 1, 1), ('shared', 'Also on Work', 'text', 1, 1), ('old-note', 'Archived thought', 'text', 1, 1), ('work-note', 'Work thought', 'text', 1, 1), ('loose', 'Unorganized thought', 'text', 1, 1);
    INSERT INTO card_messages (card_id, message_id, position) VALUES ('door', 'only-here', 0), ('door', 'shared', 1), ('old', 'old-note', 0), ('work', 'shared', 0), ('work', 'work-note', 1);
    INSERT INTO attachments (id, message_id, type, storage_path, created_at) VALUES ('hinge-photo', 'only-here', 'photo', 'chits-attachments/chat/hinge.jpg', 1), ('reused', 'only-here', 'photo', 'chits-attachments/chat/reused.jpg', 1), ('reused-elsewhere', 'work-note', 'photo', 'chits-attachments/chat/reused.jpg', 1);
    INSERT INTO card_attachments (id, card_id, type, storage_path, created_at, updated_at) VALUES ('plan', 'door', 'file', 'chits-attachments/cards/door/plan.pdf', 1, 1);
    INSERT INTO card_comments (id, card_id, text, created_at, updated_at) VALUES ('c1', 'door', 'Check the screws', 1, 1), ('c2', 'old', 'Old comment', 1, 1), ('c3', 'work', 'Keep me', 1, 1);
    INSERT INTO card_subtasks (id, card_id, title, position, created_at, updated_at) VALUES ('s1', 'door', 'Buy oil', 0, 1, 1);
    INSERT INTO card_reminders (card_id, scheduled_at, created_at, updated_at) VALUES ('door', 4102444800000, 1, 1), ('work', 4102444800000, 1, 1);
    INSERT INTO space_placements (id, message_id, card_id, space_id, x, y, rotation, color, z_index, pinned_at, updated_at) VALUES ('on-fridge', NULL, 'door', 'fridge', 0.2, 0.3, 1, '#FFE58A', 1, 1, 1), ('work-on-desk', NULL, 'work', 'desk', 0.5, 0.5, 0, '#FFE58A', 1, 1, 1);
    INSERT INTO calendar_entries (id, card_id, date_key, created_at, updated_at) VALUES ('door-day', 'door', '2026-11-12', 1, 1), ('work-day', 'work', '2026-11-13', 1, 1);
    INSERT INTO timeline_events (id, event_type, created_at, related_board_id, metadata_json) VALUES ('made-doomed', 'board_created', 1, 'doomed', '{"boardName":"Home projects"}'), ('col-doomed', 'column_created', 1, 'doomed', '{}'), ('made-keeper', 'board_created', 1, 'keeper', '{"boardName":"Work"}');
  `);
  return db;
}

const ids = (db, sql) => db.raw.prepare(sql).all().map((row) => row.id);
const count = (db, sql) => db.raw.prepare(sql).get().count;

test('deleting a board removes its columns and every card the way Delete card does, archived cards too', async (t) => {
  const db = await fixture(t);
  const removable = await createBoardRepository(db).deleteBoard('doomed');

  // Files to unlink: only paths nothing else still uses.
  assert.deepEqual([...removable].sort(), ['chits-attachments/cards/door/plan.pdf', 'chits-attachments/chat/hinge.jpg']);
  assert.deepEqual(ids(db, 'SELECT id FROM boards ORDER BY id'), ['keeper']);
  assert.deepEqual(ids(db, 'SELECT id FROM board_columns ORDER BY id'), ['work-col']);
  assert.deepEqual(ids(db, 'SELECT id FROM cards ORDER BY id'), ['work']);
  // Thoughts only on this board go (from Chat too); one also on another board's card stays there.
  assert.deepEqual(ids(db, 'SELECT id FROM messages ORDER BY id'), ['loose', 'shared', 'work-note']);
  assert.deepEqual(db.raw.prepare('SELECT card_id, message_id FROM card_messages ORDER BY message_id').all().map((row) => `${row.card_id}:${row.message_id}`), ['work:shared', 'work:work-note']);
  assert.deepEqual(ids(db, 'SELECT id FROM attachments ORDER BY id'), ['reused-elsewhere']);
  // Nothing of the deleted cards is left behind anywhere.
  for (const table of ['card_attachments', 'card_comments', 'card_subtasks', 'card_reminders', 'space_placements', 'calendar_entries']) {
    assert.equal(count(db, `SELECT COUNT(*) AS count FROM ${table} WHERE card_id IN ('door', 'old')`), 0, table);
  }
  // Its Chat lines ("board created", "column created") go too; other boards' stay.
  assert.deepEqual(ids(db, 'SELECT id FROM timeline_events ORDER BY id'), ['made-keeper']);
  assert.equal(count(db, "SELECT COUNT(*) AS count FROM card_comments WHERE card_id = 'work'"), 1);
  assert.equal(count(db, "SELECT COUNT(*) AS count FROM card_reminders WHERE card_id = 'work'"), 1);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM pragma_foreign_key_check'), 0);
});

test('a board that is already gone fails without touching anything else', async (t) => {
  const db = await fixture(t);
  const boards = createBoardRepository(db);
  await boards.deleteBoard('doomed');
  await assert.rejects(boards.deleteBoard('doomed'), /no longer available/);
  assert.deepEqual(ids(db, 'SELECT id FROM cards ORDER BY id'), ['work']);
});
