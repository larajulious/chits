import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createRevisitRepository } = await loadModule('src/db/revisit-repository');

test('listing counts saved links on both ends and follows organization, unlinking, and deletion', async (t) => {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  const repo = createRevisitRepository(db);
  for (const id of ['a', 'b', 'c']) {
    await db.runAsync("INSERT INTO messages(id,text,type,created_at,updated_at) VALUES (?,?,'text',1,1)", id, id);
  }
  const counts = async () => Object.fromEntries((await repo.relationshipCounts()).map((row) => [row.noteKey, row.count]));
  assert.deepEqual(await counts(), {});
  await repo.link('thought:a', 'thought:b');
  await repo.link('thought:c', 'thought:a', 'reference');
  // Changing the relationship type must not count the same pair twice.
  await repo.link('thought:b', 'thought:a', 'follow-up');
  assert.deepEqual(await counts(), { 'thought:a': 2, 'thought:b': 1, 'thought:c': 1 });

  await db.execAsync(`
    INSERT INTO boards(id,name,created_at,updated_at) VALUES ('board','Board',1,1);
    INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('column','board','Notes',0,1,1);
    INSERT INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES ('card','board','column','Card',0,1,1);
    INSERT INTO card_messages(card_id,message_id,position) VALUES ('card','a',0);
  `);
  assert.deepEqual(await counts(), { 'card:card': 2, 'thought:b': 1, 'thought:c': 1 });
  await repo.unlink('card:card', 'thought:b');
  assert.deepEqual(await counts(), { 'card:card': 1, 'thought:c': 1 });
  await db.runAsync("UPDATE messages SET deleted_at = 2 WHERE id = 'c'");
  assert.deepEqual(await counts(), {});
});
