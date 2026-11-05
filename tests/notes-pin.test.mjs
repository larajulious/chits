import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createBoardRepository, createMessageRepository } = await loadModule('src/db/repositories');

async function setup(t) {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('notes-pin.db');
  await migration.migrateDatabase(db);
  await db.execAsync(`
    INSERT INTO boards (id, name, pinned, created_at, updated_at) VALUES ('board', 'Notes', 1, 1, 1);
    INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('column', 'board', 'Notes', 0, 1, 1);
    INSERT INTO cards (id, board_id, column_id, title, position, created_at, updated_at)
      VALUES ('card', 'board', 'column', 'A saved note', 0, 1, 1), ('other-card', 'board', 'column', 'Another note', 1, 1, 1);
    INSERT INTO messages (id, text, type, pinned, created_at, updated_at)
      VALUES ('first', 'Keep these words', 'text', 0, 1, 1), ('second', 'More words', 'text', 0, 2, 2), ('other', 'Unrelated thought', 'text', 1, 3, 3);
    INSERT INTO card_messages (card_id, message_id, position) VALUES ('card', 'first', 0), ('card', 'second', 1);
  `);
  return { env, db, boards: createBoardRepository(db), messages: createMessageRepository(db) };
}

for (const [cardPin, thoughtPin] of [[1, 0], [0, 1], [1, 1]]) {
  test(`Unpin clears the displayed note pin (card=${cardPin}, thought=${thoughtPin}) after reloading`, async (t) => {
    const { db, boards, messages } = await setup(t);
    await db.runAsync("UPDATE cards SET pinned = ? WHERE id = 'card'", cardPin);
    await db.runAsync("UPDATE messages SET pinned = ? WHERE id = 'first'", thoughtPin);
    assert.equal((await boards.listAllCardSummaries()).find((card) => card.id === 'card').pinned, 1);
    await boards.setPinned('card', 'card', false);
    const reloaded = createBoardRepository(db);
    assert.equal((await reloaded.listAllCardSummaries()).find((card) => card.id === 'card').pinned, 0);
    assert.equal((await messages.getActiveById('first')).pinned, false);
    assert.equal((await messages.getActiveById('first')).text, 'Keep these words');
    assert.equal((await messages.getActiveById('other')).pinned, true, 'unrelated pins are preserved');
    assert.equal((await db.getFirstAsync("SELECT COUNT(*) AS count FROM card_messages WHERE card_id = 'card'")).count, 2);
  });
}

test('Unpin clears every pinned thought in a merged card and preserves unpinned thoughts', async (t) => {
  const { db, boards, messages } = await setup(t);
  await messages.setPinned('first', true);
  await messages.setPinned('second', true);
  await boards.setPinned('card', 'other-card', true);
  await boards.setPinned('card', 'card', false);
  assert.deepEqual((await messages.listPinned()).map((message) => message.id), ['other']);
  const rows = await boards.listAllCardSummaries();
  assert.equal(rows.find((card) => card.id === 'card').pinned, 0);
  assert.equal(rows.find((card) => card.id === 'other-card').pinned, 1);
  assert.equal((await messages.getActiveById('second')).text, 'More words');
});

test('a failed source-thought update rolls back the card pin too', async (t) => {
  const { env, db, boards, messages } = await setup(t);
  await boards.setPinned('card', 'card', true);
  await messages.setPinned('first', true);
  env.fault = (method, sql) => { if (method === 'sql' && sql.startsWith('UPDATE messages SET pinned = 0')) throw new Error('Disk full'); };
  await assert.rejects(boards.setPinned('card', 'card', false), /Disk full/);
  env.fault = null;
  assert.equal((await db.getFirstAsync("SELECT pinned FROM cards WHERE id = 'card'")).pinned, 1);
  assert.equal((await messages.getActiveById('first')).pinned, true);
});

test('board Unpin leaves card and thought pins alone; unorganized thoughts unpin independently', async (t) => {
  const { boards, messages } = await setup(t);
  await boards.setPinned('card', 'card', true);
  await messages.setPinned('first', true);
  await boards.setPinned('board', 'board', false);
  assert.equal((await boards.listAllCardSummaries()).find((card) => card.id === 'card').pinned, 1);
  assert.equal((await messages.getActiveById('first')).pinned, true);
  await messages.setPinned('other', false);
  assert.equal((await messages.listUnorganizedSummaries()).find((message) => message.id === 'other').pinned, 0);
});
