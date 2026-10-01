import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createBoardRepository } = await loadModule('src/db/repositories');

test('board search returns only matching cards with column context across card content', async (t) => {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  db.raw.exec(`
    INSERT INTO boards (id, name, created_at, updated_at) VALUES ('home', 'Home', 1, 1), ('work', 'Work', 1, 1);
    INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at)
      VALUES ('todo', 'home', 'To do', 0, 1, 1), ('done', 'home', 'Done', 1, 1, 1), ('other', 'work', 'To do', 0, 1, 1);
    INSERT INTO cards (id, board_id, column_id, title, position, created_at, updated_at)
      VALUES ('title', 'home', 'todo', 'Alpha', 0, 1, 1),
        ('body', 'home', 'todo', 'Second', 1, 1, 1),
        ('file', 'home', 'done', 'Third', 0, 1, 1),
        ('direct-file', 'home', 'done', 'Fourth', 1, 1, 1),
        ('hidden', 'home', 'todo', 'Private title', 3, 1, 1),
        ('outside', 'work', 'other', 'Alpha', 0, 1, 1),
        ('archived', 'home', 'todo', 'Alpha', 2, 1, 1);
    UPDATE cards SET archived_at = 2 WHERE id = 'archived';
    INSERT INTO messages (id, text, type, created_at, updated_at)
      VALUES ('body-message', 'A blue sentence', 'text', 1, 1),
        ('file-message', 'Attached', 'file', 1, 1),
        ('hidden-message', 'Secret words', 'text', 1, 1);
    UPDATE messages SET is_hidden_content = 1 WHERE id = 'hidden-message';
    INSERT INTO card_messages (card_id, message_id, position)
      VALUES ('body', 'body-message', 0), ('file', 'file-message', 0), ('hidden', 'hidden-message', 0);
    INSERT INTO attachments (id, message_id, type, storage_path, original_name, created_at)
      VALUES ('attachment', 'file-message', 'file', 'file.pdf', 'invoice.pdf', 1);
    INSERT INTO card_attachments (id, card_id, type, storage_path, original_name, created_at, updated_at)
      VALUES ('card-attachment', 'direct-file', 'file', 'direct.pdf', 'receipt.pdf', 1, 1);
  `);
  const search = createBoardRepository(db).search;
  assert.deepEqual((await search('Alpha', false, 'home')).map((row) => row.id), ['title']);
  assert.deepEqual((await search('blue', false, 'home')).map((row) => row.id), ['body']);
  assert.deepEqual((await search('invoice', false, 'home')).map((row) => row.id), ['file']);
  assert.deepEqual((await search('receipt', false, 'home')).map((row) => row.id), ['direct-file']);
  assert.deepEqual((await search('Done', false, 'home')).map((row) => row.id).sort(), ['direct-file', 'file']);
  assert.deepEqual((await search('Secret', false, 'home')).map((row) => row.id), []);
  assert.deepEqual((await search('Private', false, 'home')).map((row) => row.id), []);
  assert.equal((await search('To do', false, 'home')).find((row) => row.id === 'hidden')?.title, 'Hidden Chit');
  assert.deepEqual((await search('Alpha', true, 'home')).map((row) => row.id).sort(), ['archived', 'title']);
  assert.equal((await search('invoice', false, 'home'))[0].context, 'Home · Done');
});
