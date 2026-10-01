import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';

// Execute the production repositories with real SQLite, replacing Expo's async
// bridge with a small adapter. Local TS imports are bundled into module URLs.
const moduleUrls = new Map();
function moduleUrl(path) {
  if (moduleUrls.has(path)) return moduleUrls.get(path);
  let code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/from ['"](\.\.?\/[^'"]+)['"]/g, (_match, specifier) => `from '${moduleUrl(resolve(dirname(path), `${specifier}.ts`))}'`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  moduleUrls.set(path, url);
  return url;
}
const root = new URL('../', import.meta.url);
const production = await import(moduleUrl(new URL('src/db/repositories.ts', root).pathname));
const settings = await import(moduleUrl(new URL('src/db/chat-background.ts', root).pathname));
const model = await import(moduleUrl(new URL('src/services/chat-background.ts', root).pathname));
const photoPath = 'chits-attachments/chat/photo.jpg';
const cardPath = 'chits-attachments/cards/card/photo.jpg';
const image = { storagePath: photoPath, source: 'attachment', attachmentId: 'photo', dim: 0.35, blur: false };

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE messages (id TEXT PRIMARY KEY, text TEXT);
    CREATE TABLE attachments (id TEXT PRIMARY KEY, message_id TEXT REFERENCES messages(id), type TEXT, storage_path TEXT);
    CREATE TABLE cards (id TEXT PRIMARY KEY);
    CREATE TABLE card_attachments (id TEXT PRIMARY KEY, card_id TEXT REFERENCES cards(id), type TEXT, storage_path TEXT, deleted_at INTEGER);
    CREATE TABLE card_comments (id TEXT PRIMARY KEY, card_id TEXT);
    CREATE TABLE card_messages (card_id TEXT, message_id TEXT);
    CREATE TABLE card_reminders (card_id TEXT);
    CREATE TABLE card_subtasks (id TEXT PRIMARY KEY, card_id TEXT REFERENCES cards(id));
    INSERT INTO messages VALUES ('message', 'Keep my original words'), ('message-2', 'Second photo');
    INSERT INTO attachments VALUES ('photo', 'message', 'photo', 'chits-attachments/chat/photo.jpg'), ('photo-2', 'message-2', 'photo', 'chits-attachments/chat/second.jpg');
    INSERT INTO cards VALUES ('card');
    INSERT INTO card_attachments VALUES ('card-photo', 'card', 'photo', 'chits-attachments/cards/card/photo.jpg', NULL);
  `);
  let writes = 0;
  const database = {
    async getFirstAsync(sql, ...args) { return sqlite.prepare(sql).get(...args) ?? null; },
    async getAllAsync(sql, ...args) { return sqlite.prepare(sql).all(...args); },
    async runAsync(sql, ...args) { writes++; return sqlite.prepare(sql).run(...args); },
    async withExclusiveTransactionAsync(action) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await action(database); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, database, writes: () => writes };
}

test('background style survives a fresh read and reselecting the same image performs no extra write', async () => {
  const { database, writes } = fixture();
  await settings.writeChatBackground(database, { ...image, dim: 0.6, blur: true });
  assert.deepEqual(await settings.readChatBackground(database), { ...image, dim: 0.6, blur: true });
  const count = writes();
  await settings.writeChatBackground(database, { ...image, dim: 0.6, blur: true });
  assert.equal(writes(), count);
});

test('removing a background preserves every original photo and all message text', async () => {
  const { sqlite, database } = fixture();
  await settings.writeChatBackground(database, image);
  assert.deepEqual(await settings.removeChatBackground(database), image);
  assert.equal(await settings.readChatBackground(database), null);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get().count, 2);
  assert.equal(sqlite.prepare('SELECT text FROM messages WHERE id = ?').get('message').text, 'Keep my original words');
});

test('deleting the active attachment clears its background atomically and preserves its source text', async () => {
  const { sqlite, database } = fixture();
  await settings.writeChatBackground(database, image);
  const paths = await production.createAttachmentRepository(database).delete({ id: 'photo', storagePath: photoPath });
  assert.deepEqual(paths, [photoPath]);
  assert.equal(await settings.readChatBackground(database), null);
  assert.equal(sqlite.prepare('SELECT text FROM messages WHERE id = ?').get('message').text, 'Keep my original words');
  assert.ok(sqlite.prepare('SELECT * FROM attachments WHERE id = ?').get('photo-2'));
});

test('deleting another photo leaves the background intact; a stale deletion changes nothing', async () => {
  const { database } = fixture();
  await settings.writeChatBackground(database, image);
  const repository = production.createAttachmentRepository(database);
  await repository.delete({ id: 'photo-2', storagePath: 'chits-attachments/chat/second.jpg' });
  assert.deepEqual(await settings.readChatBackground(database), image);
  await assert.rejects(repository.delete({ id: 'photo', storagePath: 'chits-attachments/chat/wrong.jpg' }));
  assert.deepEqual(await settings.readChatBackground(database), image);
});

test('card attachment and whole-card deletion both restore the default background', async () => {
  for (const wholeCard of [false, true]) {
    const { database } = fixture();
    await settings.writeChatBackground(database, { ...image, storagePath: cardPath, attachmentId: 'card-photo' });
    const repository = production.createBoardRepository(database);
    if (wholeCard) assert.deepEqual(await repository.deleteCard('card'), [cardPath]);
    else assert.equal(await repository.deleteCardAttachment('card-photo'), cardPath);
    assert.equal(await settings.readChatBackground(database), null);
  }
});

test('deleting a card deletes its thoughts too, but moving it back to Unorganized keeps them', async () => {
  const { sqlite, database } = fixture();
  sqlite.exec(`INSERT INTO cards VALUES ('other'); INSERT INTO card_messages VALUES ('card', 'message'), ('card', 'message-2'), ('other', 'message-2');`);
  const repository = production.createBoardRepository(database);
  assert.deepEqual(await repository.deleteCard('card'), [cardPath, photoPath]);
  // A thought also organized into another card stays with that card.
  assert.deepEqual(sqlite.prepare('SELECT id FROM messages').all().map((row) => row.id), ['message-2']);
  assert.deepEqual(sqlite.prepare('SELECT id FROM attachments').all().map((row) => row.id), ['photo-2']);
  assert.deepEqual(sqlite.prepare('SELECT card_id FROM card_messages').all().map((row) => row.card_id), ['other']);

  const detached = fixture();
  detached.sqlite.exec(`INSERT INTO card_messages VALUES ('card', 'message')`);
  assert.deepEqual(await production.createBoardRepository(detached.database).detachCard('card'), [cardPath]);
  assert.equal(detached.sqlite.prepare('SELECT COUNT(*) AS count FROM messages').get().count, 2);
  assert.equal(detached.sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get().count, 2);
});

test('shared physical files stay available until their final attachment reference is deleted', async () => {
  const { sqlite, database } = fixture();
  sqlite.prepare('UPDATE card_attachments SET storage_path = ? WHERE id = ?').run(photoPath, 'card-photo');
  await settings.writeChatBackground(database, image);
  assert.deepEqual(await production.createMessageRepository(database).deletePermanently('message'), []);
  assert.equal(await settings.readChatBackground(database), null);
  assert.deepEqual(await production.createBoardRepository(database).deleteCard('card'), [photoPath]);
});

test('a removed photo cannot overwrite the active background', async () => {
  const { database } = fixture();
  await settings.writeChatBackground(database, image);
  await assert.rejects(settings.writeChatBackground(database, { ...image, attachmentId: 'missing' }), /no longer available/);
  assert.deepEqual(await settings.readChatBackground(database), image);
});

test('device backgrounds have portable private paths; malformed values cannot own an original attachment', async () => {
  const { database } = fixture();
  const device = { storagePath: 'chits-attachments/backgrounds/device.jpg', source: 'device', attachmentId: null, deviceAssetId: 'system-photo-id', dim: 0.4, blur: true };
  await settings.writeChatBackground(database, device);
  assert.deepEqual(await settings.readChatBackground(database), device);
  assert.equal(model.parseChatBackground(JSON.stringify({ ...device, storagePath: photoPath })), null);
  assert.equal(model.parseChatBackground('broken JSON'), null);
  assert.equal(model.parseChatBackground(JSON.stringify({ ...device, storagePath: 'chits-attachments/../private.jpg' })), null);
  assert.equal(model.parseChatBackground(JSON.stringify({ ...image, storagePath: 'file:///old/Documents/chits-attachments/chat/photo.jpg' })).storagePath, photoPath);
  assert.equal(model.backgroundDim(10), 0.85);
  assert.equal(model.backgroundDim(-1), 0);
  assert.equal(model.backgroundDim(Number.NaN), 0.35);
  assert.throws(() => model.attachmentBackgroundImage({ id: 'video', type: 'video', storagePath: photoPath }));
});

test('reselecting a device photo reuses its asset even when the system picker omits assetId', async () => {
  const { database } = fixture();
  const device = { storagePath: 'chits-attachments/backgrounds/device.jpg', source: 'device', attachmentId: null, deviceAssetId: 'system-photo-id', deviceImageHash: 'a'.repeat(32), dim: 0.35, blur: false };
  await settings.writeChatBackground(database, device);
  const saved = await settings.readChatBackground(database);
  assert.deepEqual(saved, device);
  assert.equal(model.deviceBackgroundMatches(saved, 'system-photo-id'), true);
  assert.equal(model.deviceBackgroundMatches(saved, null, 'a'.repeat(32)), true);
  assert.equal(model.deviceBackgroundMatches(saved, null, 'b'.repeat(32)), false);
  assert.equal(model.deviceBackgroundMatches(saved, null, null), false);
  assert.equal(model.deviceBackgroundMatches(image, 'system-photo-id', 'a'.repeat(32)), false);
});
