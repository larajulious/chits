import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createBoardRepository, createCardSubtaskRepository } = await loadModule('src/db/repositories');

test('subtasks persist text, completion and order without changing card status, and follow card deletion', async (t) => {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('subtasks.db');
  await migration.migrateDatabase(db);
  db.raw.exec(`
    INSERT INTO boards (id, name, created_at, updated_at) VALUES ('board', 'Board', 1, 1);
    INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('column', 'board', 'To do', 0, 1, 1), ('next', 'board', 'Next', 1, 1, 1);
    INSERT INTO cards (id, board_id, column_id, title, position, created_at, updated_at) VALUES ('card', 'board', 'column', 'Card', 0, 1, 1);
  `);
  const subtasks = createCardSubtaskRepository(db);
  await assert.rejects(subtasks.add('card', '   '));
  const first = await subtasks.add('card', '  Prepare screenshots  ');
  const second = await subtasks.add('card', 'Upload build');
  assert.equal(first.title, 'Prepare screenshots');
  assert.equal(second.position, 1);
  await subtasks.toggle('card', first.id);
  await subtasks.rename('card', second.id, 'Upload new build');
  await subtasks.reorder('card', [second.id, first.id]);
  assert.deepEqual((await subtasks.list('card')).map(({ title, isCompleted, position }) => ({ title, isCompleted, position })), [
    { title: 'Upload new build', isCompleted: false, position: 0 },
    { title: 'Prepare screenshots', isCompleted: true, position: 1 },
  ]);
  assert.ok((await subtasks.list('card'))[1].completedAt);
  assert.equal(db.raw.prepare('SELECT archived_at FROM cards WHERE id = ?').get('card').archived_at, null);
  await subtasks.toggle('card', first.id);
  assert.equal((await subtasks.list('card'))[1].completedAt, null);
  const summaries = await createBoardRepository(db).listAllCardSummaries();
  assert.equal(summaries[0].subtaskCount, 2);
  assert.equal(summaries[0].completedSubtaskCount, 0);
  await createBoardRepository(db).moveCard('card', 'next', 0);
  assert.equal((await subtasks.list('card')).length, 2);
  await db.runAsync('DELETE FROM cards WHERE id = ?', 'card');
  assert.deepEqual(await subtasks.list('card'), []);
});
