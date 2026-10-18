import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { loadModule, runtime, migration, service } from './helpers/backup-runtime.mjs';
const model = await loadModule('src/services/header-photo');
const repository = await loadModule('src/db/header-photo');
const photo = { storagePath: 'chits-attachments/headers/photo.jpg', width: 2048, height: 1536, x: 0.2, y: 0.7, zoom: 1.5, overlay: 0.65 };
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  await db.runAsync('INSERT INTO app_settings VALUES (?, ?, ?)', 'app_appearance', 'dark', 123);
  return { env, db };
}
test('header settings reject external, traversal and non-header paths and invalid dimensions', () => {
  for (const path of ['https://example.com/a.jpg', 'file:///cache/photo.jpg', 'chits-attachments/headers/../a.jpg', 'chits-attachments/headers/%2e%2e/a.jpg', 'chits-attachments/chat/shared.jpg']) assert.equal(model.parseHeaderPhoto(JSON.stringify({ ...photo, storagePath: path })), null);
  for (const size of [0, -1, null, '2048']) assert.equal(model.parseHeaderPhoto(JSON.stringify({ ...photo, width: size })), null);
  assert.equal(model.parseHeaderPhoto('{invalid'), null);
});
test('header settings constrain crop and shading to safe finite bounds', () => {
  assert.deepEqual(model.parseHeaderPhoto(JSON.stringify({ ...photo, x: -10, y: 20, zoom: 0, overlay: 0 })), { ...photo, x: 0, y: 1, zoom: 1, overlay: 0.6 });
  assert.equal(model.parseHeaderPhoto(JSON.stringify({ ...photo, zoom: 200 })).zoom, 3);
});
test('crop fills portrait and landscape headers without exposed edges at all positions and zooms', () => {
  for (const [imageWidth, imageHeight] of [[2048,1536],[1365,2048]]) for (const [width,height] of [[393,126],[852,110],[320,180]]) for (const x of [0,0.5,1]) for (const y of [0,0.5,1]) for (const zoom of [1,1.5,3]) {
    const frame = model.headerPhotoFrame({ ...photo, width: imageWidth, height: imageHeight, x, y, zoom }, width, height);
    assert.ok(frame.left <= 0 && frame.top <= 0);
    assert.ok(frame.left + frame.width >= width - 0.00001 && frame.top + frame.height >= height - 0.00001);
  }
});
test('apply, replace and remove persist independently of theme settings; shared files cannot be cleaned up', async (t) => {
  const { db } = await fixture(t);
  assert.equal(await repository.writeHeaderPhoto(db, photo), null);
  assert.equal(await repository.headerPhotoCanDelete(db, photo.storagePath), false);
  assert.deepEqual(await repository.writeHeaderPhoto(db, { ...photo, storagePath: 'chits-attachments/headers/replacement.jpg' }), photo);
  assert.equal(await repository.headerPhotoCanDelete(db, photo.storagePath), true);
  await db.runAsync('INSERT INTO app_settings VALUES (?, ?, ?)', 'chat_background', JSON.stringify({ storagePath: photo.storagePath }), 123);
  assert.equal(await repository.headerPhotoCanDelete(db, photo.storagePath), false);
  assert.equal(await repository.headerPhotoCanDelete(db, 'chits-attachments/chat/shared.jpg'), false);
  await repository.writeHeaderPhoto(db, null);
  assert.equal((await db.getFirstAsync("SELECT value FROM app_settings WHERE key = 'app_appearance'")).value, 'dark');
});
test('failed settings commit preserves the previous header and its reference', async (t) => {
  const { env, db } = await fixture(t);
  await repository.writeHeaderPhoto(db, photo);
  env.fault = (kind, sql) => { if (kind === 'sql' && sql.includes('INSERT INTO app_settings')) throw new Error('disk full'); };
  await assert.rejects(repository.writeHeaderPhoto(db, { ...photo, storagePath: 'chits-attachments/headers/new.jpg' }), /disk full/);
  env.fault = null;
  assert.deepEqual(model.parseHeaderPhoto((await db.getFirstAsync('SELECT value FROM app_settings WHERE key = ?', model.HEADER_PHOTO_KEY)).value), photo);
});
test('portable backup restores header bytes, crop, overlay and existing theme preferences', async (t) => {
  const { env, db } = await fixture(t);
  env.write(photo.storagePath, 'header image bytes');
  await repository.writeHeaderPhoto(db, photo);
  const created = await service.createBackup(db);
  assert.deepEqual(created.manifest.files.map((file) => file.storagePath), [photo.storagePath]);
  const checked = await service.validateBackup(created.uri);
  assert.equal(checked.valid, true, checked.reason);
  await repository.writeHeaderPhoto(db, null);
  env.write(photo.storagePath, 'new installation bytes');
  await service.restoreBackup(checked, db);
  const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db')); t.after(() => restored.close());
  assert.deepEqual(model.parseHeaderPhoto(restored.prepare('SELECT value FROM app_settings WHERE key = ?').get(model.HEADER_PHOTO_KEY).value), photo);
  assert.equal(restored.prepare("SELECT value FROM app_settings WHERE key = 'app_appearance'").get().value, 'dark');
  assert.equal(readFileSync(join(env.documents, photo.storagePath), 'utf8'), 'header image bytes');
});
test('missing header image is reported and restores recoverable settings without a fabricated file', async (t) => {
  const { db } = await fixture(t);
  await repository.writeHeaderPhoto(db, photo);
  const created = await service.createBackup(db);
  assert.deepEqual(created.manifest.missingAttachments, [{ attachmentId: model.HEADER_PHOTO_KEY, table: 'app_settings', expectedPath: photo.storagePath }]);
  assert.equal((await service.validateBackup(created.uri)).valid, true);
});
test('cleanup protects header copies referenced by attachments and legacy setting paths', async (t) => {
  const { db } = await fixture(t);
  await db.runAsync("INSERT INTO messages (id, text, type, created_at, updated_at) VALUES ('note', 'Keep', 'text', 1, 1)");
  await db.runAsync('INSERT INTO attachments (id, message_id, type, storage_path, created_at) VALUES (?, ?, ?, ?, ?)', 'shared', 'note', 'photo', photo.storagePath, 1);
  assert.equal(await repository.headerPhotoCanDelete(db, photo.storagePath), false);
  await db.runAsync("DELETE FROM attachments WHERE id = 'shared'");
  await db.runAsync('INSERT INTO app_settings VALUES (?, ?, ?)', 'another_photo_setting', JSON.stringify({ storagePath: `file:///old/Documents/${photo.storagePath}` }), 123);
  assert.equal(await repository.headerPhotoCanDelete(db, photo.storagePath), false);
});
test('backup normalizes a legacy absolute header reference only in its private snapshot', async (t) => {
  const { env, db } = await fixture(t);
  env.write(photo.storagePath, 'portable photo');
  const legacy = JSON.stringify({ ...photo, storagePath: `file:///old/Documents/${photo.storagePath}` });
  await db.runAsync('INSERT INTO app_settings VALUES (?, ?, ?)', model.HEADER_PHOTO_KEY, legacy, 123);
  const created = await service.createBackup(db);
  assert.equal((await db.getFirstAsync('SELECT value FROM app_settings WHERE key = ?', model.HEADER_PHOTO_KEY)).value, legacy);
  const checked = await service.validateBackup(created.uri);
  assert.equal(checked.valid, true, checked.reason);
  await service.restoreBackup(checked, db);
  const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db')); t.after(() => restored.close());
  assert.deepEqual(JSON.parse(restored.prepare('SELECT value FROM app_settings WHERE key = ?').get(model.HEADER_PHOTO_KEY).value), photo);
});
