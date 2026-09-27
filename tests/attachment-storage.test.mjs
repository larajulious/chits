import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { normalizeStoredAttachmentPath } from '../src/services/attachment-path.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('legacy attachment locations normalize without retaining a sandbox UUID', () => {
  const cases = [
    ['chits-attachments/chat/photo.jpg', 'chits-attachments/chat/photo.jpg'],
    ['attachments/chat/photo.jpg', 'attachments/chat/photo.jpg'],
    ['file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/chits-attachments/chat/photo.jpg', 'chits-attachments/chat/photo.jpg'],
    ['/var/mobile/Containers/Data/Application/OLD-UUID/Documents/attachments/chat/photo.jpg', 'attachments/chat/photo.jpg'],
    ['file:///data/user/0/com.chits/files/chits-attachments/audio/note.m4a', 'chits-attachments/audio/note.m4a'],
  ];
  for (const [stored, expected] of cases) assert.equal(normalizeStoredAttachmentPath(stored), expected);
});

test('invalid and escaping attachment paths fail safely', () => {
  for (const stored of [null, '', 'file:///tmp/picker.jpg', 'content://provider/item', '../private.txt', 'attachments/../private.txt', 'attachments/%2e%2e/private.txt']) {
    assert.equal(normalizeStoredAttachmentPath(stored), null);
  }
});

test('schema migration and repositories persist relative storage paths', () => {
  const migrations = read('src/db/migrations.ts');
  const repositories = read('src/db/repositories.ts');
  const storage = read('src/services/attachment-storage.native.ts');
  const backup = read('src/services/backup-service.native.ts');

  assert.match(migrations, /version:\s*19[\s\S]+ADD COLUMN storage_path[\s\S]+normalizeStoredAttachmentPath/);
  assert.match(repositories, /INSERT INTO attachments[^\n]+storage_path/);
  assert.match(repositories, /INSERT INTO card_attachments[^\n]+storage_path/);
  assert.doesNotMatch(repositories, /AS localUri|attachment\.localUri|details\.localUri/);
  assert.match(storage, /resolveAttachmentUri\(storedPath/);
  assert.match(storage, /copyIntoAttachmentStorage[\s\S]+storagePath/);
  assert.match(backup, /SELECT id, storage_path FROM/);
  assert.doesNotMatch(backup, /nextUri|document directory.*UPDATE/i);
});

test('attachment table rebuild preserves rows and removes the absolute URI column', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL);
    INSERT INTO messages VALUES ('message-1');
    INSERT INTO cards VALUES ('card-1');
    CREATE TABLE attachments (id TEXT PRIMARY KEY NOT NULL, message_id TEXT NOT NULL, type TEXT NOT NULL, local_uri TEXT NOT NULL, original_name TEXT, mime_type TEXT, size INTEGER, duration INTEGER, width INTEGER, height INTEGER, created_at INTEGER NOT NULL, FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT);
    CREATE INDEX idx_attachments_message_id ON attachments(message_id);
    CREATE TABLE card_attachments (id TEXT PRIMARY KEY NOT NULL, card_id TEXT NOT NULL, type TEXT NOT NULL, local_uri TEXT NOT NULL, original_name TEXT, mime_type TEXT, size INTEGER, width INTEGER, height INTEGER, duration REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT);
    CREATE INDEX idx_card_attachments_card ON card_attachments(card_id, created_at ASC);
    INSERT INTO attachments VALUES ('attachment-1', 'message-1', 'photo', 'file:///var/mobile/Containers/Data/Application/OLD/Documents/chits-attachments/chat/photo.jpg', 'photo.jpg', 'image/jpeg', 42, NULL, 10, 10, 1);
    INSERT INTO card_attachments VALUES ('card-attachment-1', 'card-1', 'file', '/var/mobile/Containers/Data/Application/OLD/Documents/chits-attachments/cards/card-1/file.pdf', 'file.pdf', 'application/pdf', 84, NULL, NULL, NULL, 2, 2, NULL);
    ALTER TABLE attachments ADD COLUMN storage_path TEXT;
    ALTER TABLE card_attachments ADD COLUMN storage_path TEXT;
  `);
  for (const table of ['attachments', 'card_attachments']) {
    const rows = database.prepare(`SELECT id, local_uri FROM ${table}`).all();
    const update = database.prepare(`UPDATE ${table} SET storage_path = ? WHERE id = ?`);
    for (const row of rows) update.run(normalizeStoredAttachmentPath(row.local_uri) ?? '', row.id);
  }

  const migrations = read('src/db/migrations.ts');
  const rebuild = migrations.match(/await database\.execAsync\(`\n(      CREATE TABLE attachments_relative[\s\S]+?)\n    `\);/);
  assert.ok(rebuild, 'migration 19 table rebuild must remain discoverable');
  database.exec(rebuild[1]);

  assert.deepEqual(database.prepare('PRAGMA table_info(attachments)').all().map((column) => column.name), ['id', 'message_id', 'type', 'storage_path', 'original_name', 'mime_type', 'size', 'duration', 'width', 'height', 'created_at']);
  assert.deepEqual(database.prepare('PRAGMA table_info(card_attachments)').all().map((column) => column.name), ['id', 'card_id', 'type', 'storage_path', 'original_name', 'mime_type', 'size', 'width', 'height', 'duration', 'created_at', 'updated_at', 'deleted_at']);
  assert.equal(database.prepare('SELECT storage_path FROM attachments').get().storage_path, 'chits-attachments/chat/photo.jpg');
  assert.equal(database.prepare('SELECT storage_path FROM card_attachments').get().storage_path, 'chits-attachments/cards/card-1/file.pdf');
});
