import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { service, recovery, migration, format, runtime } from './helpers/backup-runtime.mjs';

async function fixture(t, populated = true) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  if (populated) {
    db.raw.exec(`
      INSERT INTO messages VALUES ('message','Keep my words','text',123,456,789,1,NULL,1);
      INSERT INTO boards VALUES ('board','My board','star','#123456',123,456,789,1,99,1,0);
      INSERT INTO board_columns VALUES ('column','board','My column',3.5,123,456);
      INSERT INTO cards VALUES ('card','board','column','My card',2.5,789,123,456,1,99);
      INSERT INTO card_messages VALUES ('card','message',7.5);
      INSERT INTO card_comments VALUES ('comment','card','Keep comment',123,456,NULL);
      INSERT INTO timeline_events VALUES ('event','card_created',123,'message','card','board','{}','unique');
      INSERT INTO card_reminders VALUES ('card',4102444800000,'OLD-DEVICE-ID',123,456);
      INSERT INTO app_settings VALUES ('chat_title','My NoteSpace',123),('app_appearance','dark',123),('chat_color_theme','teal',123),('chat_draft_text','unfinished words',123),('chat_background','{"storagePath":"chits-attachments/backgrounds/photo.jpg","source":"device","deviceAssetId":"OLD-DEVICE","dim":0.6,"blur":true}',123);
    `);
    for (const [id, type, name] of [['photo','photo','photo.jpg'],['video','video','video.mp4'],['audio','audio','audio.m4a'],['pdf','file','document.pdf'],['file','file','file.bin']]) {
      const path = `chits-attachments/chat/${name}`;
      env.write(path, Buffer.from(`${type}:original bytes`));
      await db.runAsync('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'message', type, path, name, `${type}/test`, 20, 10, 20, 30, 123);
    }
    env.write('chits-attachments/cards/card/file.txt', 'Card file');
    await db.runAsync('INSERT INTO card_attachments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'card-file','card','file','chits-attachments/cards/card/file.txt','file.txt','text/plain',9,null,null,null,123,456,null);
    env.write('chits-attachments/backgrounds/photo.jpg', 'Background photo');
    env.write('chits-attachments/unreferenced-cache.tmp', 'Must not be exported');
  }
  return { env, db };
}
async function validateCreated(db) {
  const created = await service.createBackup(db);
  const checked = await service.validateBackup(created.uri);
  assert.equal(checked.valid, true, checked.reason);
  return { created, checked };
}
function content(db) {
  return Object.fromEntries(['messages','boards','board_columns','cards','card_messages','card_comments','timeline_events','attachments','card_attachments','app_settings'].map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
}

test('fresh installation creates one validated backup and restores an empty database', async (t) => {
  const { db, env } = await fixture(t, false);
  const { created, checked } = await validateCreated(db);
  assert.match(created.uri, /Chits-Backup-\d{4}-\d{2}-\d{2}-\d{4}\.chitsbackup$/);
  assert.equal(created.manifest.attachmentCount, 0);
  await service.restoreBackup(checked, db);
  const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db'));
  assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM messages').get().count, 0); restored.close();
});

test('round trip preserves content, IDs, ordering, privacy, archives, settings and every media byte under a new installation path', async (t) => {
  const { db, env } = await fixture(t);
  const before = content(db.raw);
  const { created, checked } = await validateCreated(db);
  assert.equal(created.manifest.files.length, 7); // Five chat files, a card file and the background.
  assert.equal(created.manifest.attachmentCount, 6);
  assert.equal(created.manifest.missingAttachments.length, 0);
  assert.ok(!created.manifest.files.some((file) => file.storagePath.includes('unreferenced')));
  await db.runAsync("UPDATE messages SET text = 'New current installation'");
  env.write('chits-attachments/chat/photo.jpg', 'Wrong current bytes');
  await service.restoreBackup(checked, db);
  const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db'));
  const after = content(restored);
  // Only the old device's photo asset identifier is removed from the setting.
  const background = before.app_settings.find((row) => row.key === 'chat_background');
  const data = JSON.parse(background.value); delete data.deviceAssetId; background.value = JSON.stringify(data);
  assert.deepEqual(after, before);
  assert.equal(restored.prepare('SELECT notification_id FROM card_reminders').get().notification_id, null);
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length, 0);
  for (const file of created.manifest.files) assert.equal(await env.native.hashFileAsync(`file:///chits-test-documents/${file.storagePath}`), file.sha256);
  assert.ok(!existsSync(join(env.documents, '.chits-restore'))); restored.close();
});

test('missing referenced files are explicitly reported and every available attachment still restores', async (t) => {
  const { db, env } = await fixture(t);
  await db.runAsync("UPDATE attachments SET storage_path = 'chits-attachments/missing.jpg' WHERE id = 'photo'");
  const { created, checked } = await validateCreated(db);
  assert.deepEqual(created.manifest.missingAttachments, [{ table: 'attachments', attachmentId: 'photo', expectedPath: 'chits-attachments/missing.jpg' }]);
  await service.restoreBackup(checked, db);
  assert.ok(existsSync(join(env.documents, 'chits-attachments/chat/video.mp4')));
  assert.ok(!existsSync(join(env.documents, 'chits-attachments/missing.jpg')));
});

test('invalid, truncated, future, hash-mismatched and incomplete backups are safely rejected', async (t) => {
  const { db, env } = await fixture(t);
  const original = content(db.raw);
  const invalid = join(env.location, 'invalid.chitsbackup'); writeFileSync(invalid, 'not a zip');
  assert.equal((await service.validateBackup(invalid)).valid, false);
  const { created, checked } = await validateCreated(db);
  await service.discardValidatedBackup(checked);
  const folder = join(env.location, 'tamper'); mkdirSync(folder);
  await env.archive.unzip(created.uri, folder, { entries: ['manifest.json','database.sqlite','attachments/'] });
  const manifestPath = join(folder, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  const bad = join(env.location, 'bad.chitsbackup');
  for (const mutate of [
    (value) => { value.backupVersion = 999; },
    (value) => { value.database.sha256 = 'f'.repeat(64); },
    (value) => { value.files.pop(); },
    (value) => { value.databaseSchemaVersion = 999; },
  ]) {
    const changed = structuredClone(manifest); mutate(changed); writeFileSync(manifestPath, JSON.stringify(changed));
    await env.archive.zip(folder, bad);
    assert.equal((await service.validateBackup(bad)).valid, false);
  }
  copyFileSync(env.filePath(created.uri), bad); truncateSync(bad, 100);
  assert.equal((await service.validateBackup(bad)).valid, false);
  assert.deepEqual(content(db.raw), original);
});

test('file copy and commit failures recover the exact pre-restore installation', async (t) => {
  const { db, env } = await fixture(t);
  const { checked } = await validateCreated(db);
  await db.runAsync("UPDATE messages SET text = 'Current data to protect'");
  env.write('chits-attachments/chat/photo.jpg', 'Current image to protect');
  const current = content(db.raw);
  let injected = false;
  env.fault = (method, args) => {
    if (!injected && method === 'move' && args.to === 'file:///chits-test-documents/chits-attachments/') { injected = true; throw new Error('Injected attachment swap failure'); }
  };
  await assert.rejects(service.restoreBackup(checked, db), (error) => error instanceof service.RestoreError && error.liveClosed && !error.dataChanged);
  env.fault = null;
  const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db'));
  assert.deepEqual(content(restored), current); restored.close();
  assert.equal(readFileSync(join(env.documents,'chits-attachments/chat/photo.jpg'),'utf8'), 'Current image to protect');
  assert.ok(!existsSync(join(env.documents, '.chits-restore')));
});

test('startup recovery remains repeatable when the app stops during both commit and recovery', async (t) => {
  const { db, env } = await fixture(t);
  const paths = recovery.restorePaths();
  await env.FS.makeDirectoryAsync(paths.root);
  const safety = await env.sqlite.openDatabaseAsync('safety.sqlite', {}, paths.root);
  await env.sqlite.backupDatabaseAsync({ sourceDatabase: db, destDatabase: safety }); await safety.closeAsync();
  await env.FS.copyAsync({ from: paths.attachments, to: paths.safetyAttachments });
  await recovery.writeRestoreJournal({ version:1, phase:'pending', hadAttachments:true, safetyDatabaseHash:await env.native.hashFileAsync(paths.safetyDatabase) });
  await db.closeAsync();
  await env.FS.deleteAsync(paths.database); await env.FS.deleteAsync(paths.attachments);
  let injected = false;
  env.fault = (method, args) => { if (!injected && method === 'move' && args.to === paths.attachments) { injected = true; throw new Error('Stopped recovery'); } };
  await assert.rejects(recovery.recoverInterruptedRestore());
  assert.ok(existsSync(env.filePath(paths.journal)));
  assert.ok(existsSync(env.filePath(paths.safetyDatabase)));
  env.fault = null;
  assert.equal(await recovery.recoverInterruptedRestore(), 'recovered');
  const restored = new DatabaseSync(env.filePath(paths.database));
  assert.equal(restored.prepare('SELECT text FROM messages').get().text, 'Keep my words'); restored.close();
  assert.equal(readFileSync(join(env.documents,'chits-attachments/chat/photo.jpg'),'utf8'),'photo:original bytes');
});

test('legacy v1 archive with schema 18 migrates absolute paths before restore', async (t) => {
  const { db, env } = await fixture(t, false);
  const legacyDir = join(env.location,'legacy'); mkdirSync(legacyDir);
  const legacy = await env.sqlite.openDatabaseAsync('database.sqlite', {}, legacyDir);
  // Build the actual schema through migration 18, including the original local_uri field.
  const source = readFileSync(new URL('../src/db/migrations.ts', import.meta.url),'utf8');
  const initialSql = source.match(/version: 1,[\s\S]+?execAsync\(`([\s\S]+?)`\)/)[1];
  legacy.raw.exec(initialSql);
  const migrationsSql = [...source.matchAll(/version: (\d+),[\s\S]+?await database\.execAsync\((['"`])([\s\S]+?)\2\);/g)];
  for (const match of migrationsSql) {
    const version = Number(match[1]); if (version < 2 || version > 18) continue;
    if (match[3].includes('${')) continue;
    legacy.raw.exec(match[3]);
  }
  legacy.raw.exec("PRAGMA user_version = 18; INSERT INTO messages VALUES ('old-message','Legacy words','photo',1,2,NULL,1,NULL,1);");
  await legacy.runAsync('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'old-photo','old-message','photo','file:///var/mobile/Containers/Data/Application/OLD/Documents/chits-attachments/chat/old.jpg','old.jpg','image/jpeg',3,null,10,10,1);
  await legacy.closeAsync();
  mkdirSync(join(legacyDir,'attachments/chat'),{recursive:true}); writeFileSync(join(legacyDir,'attachments/chat/old.jpg'),'old photo');
  writeFileSync(join(legacyDir,'metadata.json'), JSON.stringify({app:'Chits',backupVersion:1,schemaVersion:18,createdAt:'2026-01-01T00:00:00Z'}));
  const archive = join(env.location,'legacy.zip'); await env.archive.zip(legacyDir,archive);
  const checked = await service.validateBackup(archive); assert.equal(checked.valid,true,checked.reason);
  assert.equal(checked.manifest.missingAttachments.length,0);
  await service.restoreBackup(checked,db);
  const restored = new DatabaseSync(join(env.documents,'SQLite/chits.db'));
  assert.equal(restored.prepare('PRAGMA user_version').get().user_version,migration.LATEST_SCHEMA_VERSION);
  assert.equal(restored.prepare('SELECT storage_path FROM attachments').get().storage_path,'chits-attachments/chat/old.jpg'); restored.close();
  assert.equal(readFileSync(join(env.documents,'chits-attachments/chat/old.jpg'),'utf8'),'old photo');
});

test('document-provider URI intake and large media use native files, never JS/base64 payloads', async (t) => {
  const { db, env } = await fixture(t);
  // Sparse 256 MB media catches accidental JS readAsString/base64 paths. Archive operations stream on disk.
  const large = join(env.documents,'chits-attachments/chat/video.mp4'); truncateSync(large,256*1024*1024);
  const created = await service.createBackup(db);
  assert.equal(created.manifest.files.find((file)=>file.storagePath.endsWith('video.mp4')).size,256*1024*1024);
  copyFileSync(env.filePath(created.uri),join(env.location,'provider.chitsbackup'));
  const checked = await service.validateBackup('content://fixture/provider.chitsbackup'); assert.equal(checked.valid,true,checked.reason);
  await service.restoreBackup(checked,db);
  assert.equal(await env.native.hashFileAsync('file:///chits-test-documents/chits-attachments/chat/video.mp4'),created.manifest.files.find((file)=>file.storagePath.endsWith('video.mp4')).sha256);
});

test('unsafe archive names, duplicate entries, encryption and low disk space fail before extraction', () => {
  const entry = {path:'database.sqlite',size:10,compressedSize:10,isDirectory:false,isEncrypted:false};
  for (const path of ['../escape','/absolute','attachments/%2e%2e/escape','attachments/%2fescape','attachments\\escape','a\0b','C:/evil']) assert.throws(()=>format.validateArchiveEntries([{...entry,path}],1e9));
  assert.throws(()=>format.validateArchiveEntries([entry,entry],1e9));
  assert.throws(()=>format.validateArchiveEntries([{...entry,isEncrypted:true}],1e9));
  assert.throws(()=>format.validateArchiveEntries([entry],1),/enough free storage/);
});

test('failed attachment staging leaves the live connection usable and existing files untouched', async (t) => {
  const { db, env } = await fixture(t);
  const { checked } = await validateCreated(db);
  const current = content(db.raw);
  env.fault = (method, args) => { if (method === 'copy' && args.to.includes('.chits-restore/attachments/')) throw new Error('ENOSPC: no space left on device'); };
  await assert.rejects(service.restoreBackup(checked, db), (error) => error instanceof service.RestoreError && !error.liveClosed && !error.dataChanged && /free storage/.test(error.message));
  env.fault = null;
  assert.deepEqual(content(db.raw), current);
  assert.equal(readFileSync(join(env.documents,'chits-attachments/chat/photo.jpg'),'utf8'),'photo:original bytes');
});

test('a pending earlier safety journal is retained when another restore is attempted', async (t) => {
  const { db, env } = await fixture(t);
  const { checked } = await validateCreated(db);
  const paths = recovery.restorePaths(); await env.FS.makeDirectoryAsync(paths.root);
  env.write('.chits-restore/safety.sqlite', 'Keep prior safety data');
  await recovery.writeRestoreJournal({version:1,phase:'pending',hadAttachments:true,safetyDatabaseHash:'f'.repeat(64)});
  await assert.rejects(service.restoreBackup(checked,db), /earlier restore/);
  assert.equal(readFileSync(env.filePath(paths.safetyDatabase),'utf8'),'Keep prior safety data');
  assert.ok(existsSync(env.filePath(paths.journal)));
  assert.equal(db.raw.prepare('SELECT text FROM messages').get().text,'Keep my words');
});

test('a committed journal cleans up safety files without rolling back restored data', async (t) => {
  const { db, env } = await fixture(t);
  const paths = recovery.restorePaths(); await env.FS.makeDirectoryAsync(paths.root);
  await recovery.writeRestoreJournal({version:1,phase:'committed',hadAttachments:true,safetyDatabaseHash:'f'.repeat(64)});
  assert.equal(await recovery.recoverInterruptedRestore(),null);
  assert.equal(db.raw.prepare('SELECT text FROM messages').get().text,'Keep my words');
  assert.ok(!existsSync(env.filePath(paths.root)));
});

test('broken board/card relationships and missing required columns are rejected before taking a live snapshot', async (t) => {
  const { db, env } = await fixture(t);
  await db.execAsync('PRAGMA foreign_keys=OFF;');
  await db.runAsync("UPDATE cards SET column_id='missing-column'");
  await assert.rejects(service.createBackup(db), /broken data relationships/);
  assert.equal(db.raw.prepare('SELECT column_id FROM cards').get().column_id,'missing-column');
  await db.runAsync("UPDATE cards SET column_id='column'");
  await db.execAsync('ALTER TABLE card_comments DROP COLUMN text;');
  await assert.rejects(service.createBackup(db), /incomplete|incompatible/);
  assert.equal(db.raw.prepare('SELECT text FROM messages').get().text,'Keep my words');
  assert.ok(!existsSync(join(env.documents,'.chits-restore')));
});

test('failure to mark a commit durable rolls back the original installation', async (t) => {
  const { db, env } = await fixture(t);
  const { checked } = await validateCreated(db);
  await db.runAsync("UPDATE messages SET text='Safety version'");
  env.fault = (method,args) => { if (method==='journal' && args.phase==='committed') throw new Error('Unable to persist commit'); };
  await assert.rejects(service.restoreBackup(checked,db), (error)=>error.liveClosed && !error.dataChanged);
  env.fault = null;
  const restored = new DatabaseSync(join(env.documents,'SQLite/chits.db'));
  assert.equal(restored.prepare('SELECT text FROM messages').get().text,'Safety version'); restored.close();
});

test('the app theme travels with the backup, and backups made before themes restore as Default', async (t) => {
  const { resolveThemeIdentity, THEME_SETTING_KEY } = await import('../src/constants/chits-themes.ts');
  const themeIn = (env) => {
    const restored = new DatabaseSync(join(env.documents, 'SQLite/chits.db'));
    const row = restored.prepare('SELECT value FROM app_settings WHERE key = ?').get(THEME_SETTING_KEY);
    restored.close();
    return resolveThemeIdentity(row?.value);
  };

  const themed = await fixture(t);
  await themed.db.runAsync('INSERT INTO app_settings VALUES (?, ?, ?)', THEME_SETTING_KEY, 'calm', 123);
  const withTheme = await validateCreated(themed.db);
  await themed.db.runAsync('UPDATE app_settings SET value = ? WHERE key = ?', 'boss', THEME_SETTING_KEY);
  await service.restoreBackup(withTheme.checked, themed.db);
  assert.equal(themeIn(themed.env), 'calm');

  // An older backup has no theme row at all: restore still succeeds and replaces the current theme with Default.
  const legacy = await fixture(t);
  const withoutTheme = await validateCreated(legacy.db);
  await legacy.db.runAsync('INSERT INTO app_settings VALUES (?, ?, ?)', THEME_SETTING_KEY, 'boss', 123);
  await service.restoreBackup(withoutTheme.checked, legacy.db);
  assert.equal(themeIn(legacy.env), 'default');
});
