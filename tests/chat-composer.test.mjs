import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const { createMessageRepository } = await loadModule('src/db/repositories.ts');
const { saveChatComposer, readChatDraft, writeChatDraft } = await loadModule('src/services/chat-composer.ts');

async function setup(t) {
  const env = runtime();
  t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chat-composer.db');
  await migration.migrateDatabase(db);
  return { db, repository: createMessageRepository(db), env };
}

test('save draft, resume, save again and send all update one chat message', async (t) => {
  const { db, repository } = await setup(t);
  const first = await saveChatComposer(repository, { text: ' First draft ', editing: null, attachment: null });
  await writeChatDraft(db, ' First draft ', first.id);
  assert.equal((await repository.getActiveById(first.id)).text, 'First draft');
  const restored = await readChatDraft(db, repository);
  assert.equal(restored.text, ' First draft ');
  assert.equal(restored.editing.id, first.id);
  const next = await saveChatComposer(repository, { text: 'Second draft', editing: restored.editing, attachment: null });
  await writeChatDraft(db, next.text, next.id);
  const sent = await saveChatComposer(repository, { text: 'Final text', editing: next, attachment: null });
  await writeChatDraft(db, '', null);
  assert.equal(sent.id, first.id);
  assert.equal(sent.createdAt, first.createdAt);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM messages')).count, 1);
  assert.equal((await repository.getActiveById(first.id)).text, 'Final text');
  assert.deepEqual(await readChatDraft(db, repository), { text: '', editing: null });
});

test('attachment draft saves once and later description edits preserve its file', async (t) => {
  const { db, repository } = await setup(t);
  const attachment = { type: 'file', storagePath: 'chits-attachments/chat/note.pdf', originalName: 'note.pdf', mimeType: 'application/pdf', size: 123, duration: null, width: null, height: null };
  const first = await saveChatComposer(repository, { text: '', editing: null, attachment });
  await writeChatDraft(db, '', first.id);
  const restored = await readChatDraft(db, repository);
  assert.equal(restored.editing.id, first.id, 'empty attachment descriptions still restore their editing target');
  const described = await saveChatComposer(repository, { text: 'Description', editing: restored.editing, attachment: null });
  const cleared = await saveChatComposer(repository, { text: '', editing: described, attachment: null });
  assert.equal(cleared.id, first.id);
  assert.equal(cleared.attachments[0].id, first.attachments[0].id);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM attachments')).count, 1);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM messages')).count, 1);
  assert.equal((await repository.getActiveById(first.id)).text, '');
});

test('blank text cannot create a message or erase a saved text-only thought', async (t) => {
  const { db, repository } = await setup(t);
  assert.equal(await saveChatComposer(repository, { text: ' \n ', editing: null, attachment: null }), null);
  const first = await repository.createText('Keep this');
  assert.equal(await saveChatComposer(repository, { text: '', editing: first, attachment: null }), null);
  assert.equal((await repository.getActiveById(first.id)).text, 'Keep this');
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM messages')).count, 1);
});

test('failed updates preserve saved draft and retry targets the original message', async (t) => {
  const { db, repository, env } = await setup(t);
  const first = await repository.createText('Original');
  await writeChatDraft(db, 'Original', first.id);
  env.fault = (method, sql) => { if (method === 'sql' && sql.startsWith('UPDATE messages SET text')) throw new Error('Disk full'); };
  await assert.rejects(saveChatComposer(repository, { text: 'Changed', editing: first, attachment: null }), /Disk full/);
  env.fault = null;
  assert.equal((await repository.getActiveById(first.id)).text, 'Original');
  const resumed = await readChatDraft(db, repository);
  const retried = await saveChatComposer(repository, { text: 'Changed', editing: resumed.editing, attachment: null });
  assert.equal(retried.id, first.id);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM messages')).count, 1);
});

test('draft settings keep text and target together if the write fails', async (t) => {
  const { db, repository, env } = await setup(t);
  const first = await repository.createText('Saved');
  await writeChatDraft(db, 'Saved', first.id);
  env.fault = (method, sql) => { if (method === 'sql' && sql.startsWith('INSERT INTO app_settings')) throw new Error('Disk full'); };
  await assert.rejects(writeChatDraft(db, '', null), /Disk full/);
  env.fault = null;
  const restored = await readChatDraft(db, repository);
  assert.equal(restored.text, 'Saved');
  assert.equal(restored.editing.id, first.id);
});
