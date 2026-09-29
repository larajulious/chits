import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as FS from 'expo-file-system/legacy';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { listContents, NO_COMPRESSION, unzip, zip } from 'react-native-zip-archive';

import { ChitsFiles } from '../../modules/chits-attachments';
import { LATEST_SCHEMA_VERSION, migrateDatabase } from '@/db/migrations';
import { BACKUP_VERSION, BackupError, INVALID_BACKUP, archivePathForMedia, backupErrorMessage, parseBackupMetadata, portableMediaPath, validateArchiveEntries, type BackupFile, type BackupManifest, type MissingAttachment } from './backup-format';
import { beginBackupOperation, type BackupProgress } from './backup-operation';
import { recoverInterruptedRestore, removeDatabaseFiles, restorePaths, writeRestoreJournal, type RestoreJournal } from './backup-recovery.native';
import { pauseReminderSync, resumeReminderSync } from './reminders';

export { backupErrorMessage } from './backup-format';
export type { BackupManifest } from './backup-format';
type Progress = (progress: BackupProgress) => void;
type Reference = { attachmentId: string; table: MissingAttachment['table']; storagePath: string };
export type CreatedBackup = { uri: string; manifest: BackupManifest; size: number };
export type ValidatedBackup = { valid: true; workDir: string; extractedDir: string; preparedDir: string; manifest: BackupManifest; preparedDatabaseHash: string; size: number };
export type BackupValidation = ValidatedBackup | { valid: false; reason: string };
const requiredTables = ['messages', 'attachments', 'boards', 'board_columns', 'cards', 'card_messages'];
const currentTables = [...requiredTables, 'timeline_events', 'app_settings', 'card_comments', 'card_attachments', 'card_reminders'];
const MARGIN = 16 * 1024 * 1024;
function directory(value: string | null) {
  if (!value) throw new BackupError('Chits could not access private device storage.');
  return value;
}
function temporaryDirectory(prefix: string) {
  return `${directory(FS.cacheDirectory)}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
}
function report(progress: Progress | undefined, label: string, completed?: number, total?: number) { progress?.({ label, completed, total }); }
async function requireSpace(bytes: number) {
  if (await FS.getFreeDiskStorageAsync() < bytes + MARGIN) throw new BackupError('There is not enough free storage. Free some space, then try again.');
}
async function fileDetails(uri: string) {
  const info = await FS.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new BackupError('A required backup file is missing or unreadable.');
  return { size: info.size, sha256: await ChitsFiles.hashFileAsync(uri) };
}
async function verifyFile(uri: string, expected: { size: number; sha256: string }) {
  const details = await fileDetails(uri);
  if (details.size !== expected.size || details.sha256 !== expected.sha256) throw new BackupError('This backup is damaged. One or more files failed verification.');
}
async function copyFile(from: string, to: string) {
  await FS.makeDirectoryAsync(to.slice(0, to.lastIndexOf('/') + 1), { intermediates: true });
  await FS.copyAsync({ from, to });
}
async function tableExists(db: SQLiteDatabase, table: string) {
  return !!await db.getFirstAsync('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', 'table', table);
}
async function validateDatabase(db: SQLiteDatabase, expectedSchema?: number, current = false) {
  const integrity = await db.getAllAsync<Record<string, string>>('PRAGMA integrity_check');
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new BackupError('The backup database is damaged and cannot be restored.');
  const schema = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (schema < 1 || schema > LATEST_SCHEMA_VERSION || (expectedSchema !== undefined && schema !== expectedSchema)) throw new BackupError('The backup database version does not match its backup information.');
  const tables = current ? currentTables : [...requiredTables, ...(schema >= 4 ? ['timeline_events'] : []), ...(schema >= 8 ? ['app_settings'] : []), ...(schema >= 16 ? ['card_comments'] : []), ...(schema >= 17 ? ['card_attachments'] : []), ...(schema >= 20 ? ['card_reminders'] : [])];
  for (const table of tables) if (!await tableExists(db, table)) throw new BackupError('The backup database is incomplete. A required part of your Chits data is missing.');
  const columns: Record<string, string[]> = {
    messages: ['id', 'text', 'type', 'created_at', 'updated_at', 'archived_at', 'pinned', 'deleted_at', ...(schema >= 18 ? ['is_hidden_content'] : [])],
    attachments: ['id', 'message_id', 'type', schema >= 19 ? 'storage_path' : 'local_uri', 'original_name', 'mime_type', 'size', 'duration', 'width', 'height', 'created_at'],
    boards: ['id', 'name', 'icon', 'accent', 'created_at', 'updated_at', 'archived_at', ...(schema >= 2 ? ['pinned'] : []), ...(schema >= 3 ? ['last_opened_at'] : []), ...(schema >= 6 ? ['show_next_column_peek'] : []), ...(schema >= 7 ? ['show_column_navigator'] : [])],
    board_columns: ['id', 'board_id', 'name', 'position', 'created_at', 'updated_at'],
    cards: ['id', 'board_id', 'column_id', 'title', 'position', 'archived_at', 'created_at', 'updated_at', ...(schema >= 2 ? ['pinned'] : []), ...(schema >= 3 ? ['last_opened_at'] : [])],
    card_messages: ['card_id', 'message_id', 'position'],
    timeline_events: ['id', 'event_type', 'created_at', 'related_message_id', 'related_card_id', 'related_board_id', 'metadata_json', ...(schema >= 5 ? ['dedupe_key'] : [])],
    app_settings: ['key', 'value', 'updated_at'],
    card_comments: ['id', 'card_id', 'text', 'created_at', 'updated_at', 'deleted_at'],
    card_attachments: ['id', 'card_id', 'type', schema >= 19 ? 'storage_path' : 'local_uri', 'original_name', 'mime_type', 'size', 'width', 'height', 'duration', 'created_at', 'updated_at', 'deleted_at'],
    card_reminders: ['card_id', 'scheduled_at', 'notification_id', 'created_at', 'updated_at'],
  };
  for (const table of tables) {
    const actual = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((row) => row.name));
    if (columns[table].some((column) => !actual.has(column))) throw new BackupError('The backup database is incomplete or has an incompatible layout.');
  }
  if ((await db.getAllAsync('PRAGMA foreign_key_check')).length) throw new BackupError('The backup contains broken data relationships and cannot be restored.');
  const wrongColumns = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM cards c JOIN board_columns bc ON bc.id = c.column_id WHERE c.board_id != bc.board_id');
  if (wrongColumns?.count) throw new BackupError('The backup contains cards assigned to the wrong board.');
  const relations = [['attachments', 'message_id', 'messages'], ['board_columns', 'board_id', 'boards'], ['cards', 'board_id', 'boards'], ['cards', 'column_id', 'board_columns'], ['card_messages', 'card_id', 'cards'], ['card_messages', 'message_id', 'messages'], ...(schema >= 16 ? [['card_comments', 'card_id', 'cards']] : []), ...(schema >= 17 ? [['card_attachments', 'card_id', 'cards']] : []), ...(schema >= 20 ? [['card_reminders', 'card_id', 'cards']] : [])];
  for (const [child, key, parent] of relations) {
    if (await db.getFirstAsync(`SELECT 1 FROM ${child} c LEFT JOIN ${parent} p ON p.id = c.${key} WHERE p.id IS NULL LIMIT 1`)) throw new BackupError('The backup contains broken data relationships and cannot be restored.');
  }
  // Compile required reads: a database with same-named, empty placeholder tables is invalid.
  await db.getAllAsync('SELECT m.id, m.text, m.type, m.created_at, m.updated_at, m.archived_at, m.pinned, m.deleted_at, a.id, a.message_id, a.type, a.original_name, a.mime_type, a.size, a.created_at FROM messages m LEFT JOIN attachments a ON a.message_id = m.id LIMIT 0');
  await db.getAllAsync('SELECT b.id, b.name, b.icon, b.accent, bc.id, bc.position, c.id, c.title, c.position, cm.position FROM boards b LEFT JOIN board_columns bc ON bc.board_id = b.id LEFT JOIN cards c ON c.column_id = bc.id LEFT JOIN card_messages cm ON cm.card_id = c.id LIMIT 0');
  return schema;
}
async function counts(db: SQLiteDatabase) {
  const count = async (table: string) => (await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))?.count ?? 0;
  return { chatItemCount: await count('messages'), boardCount: await count('boards'), columnCount: await count('board_columns'), cardCount: await count('cards'), attachmentCount: await count('attachments') + await count('card_attachments') };
}
function canonicalPath(value: string) {
  const normalized = portableMediaPath(value);
  return normalized?.startsWith('attachments/') ? `chits-attachments/legacy/${normalized.slice('attachments/'.length)}` : normalized;
}
// Changes only a private database snapshot. IDs, timestamps, content and ordering are retained.
async function normalizeSnapshot(db: SQLiteDatabase) {
  const sources = new Map<string, string>();
  for (const table of ['attachments', 'card_attachments'] as const) {
    const rows = await db.getAllAsync<{ id: string; storage_path: string }>(`SELECT id, storage_path FROM ${table}`);
    for (const row of rows) {
      const source = portableMediaPath(row.storage_path);
      const storagePath = canonicalPath(row.storage_path) ?? '';
      if (source && storagePath) {
        if (sources.has(storagePath) && sources.get(storagePath) !== source) throw new BackupError('Two attachments refer to conflicting file locations. Your current data has not been changed.');
        sources.set(storagePath, source);
      }
      if (storagePath !== row.storage_path) await db.runAsync(`UPDATE ${table} SET storage_path = ? WHERE id = ?`, storagePath, row.id);
    }
  }
  const background = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'chat_background'");
  if (background) {
    try {
      const data = JSON.parse(background.value);
      if (data && typeof data.storagePath === 'string') {
        const source = portableMediaPath(data.storagePath);
        const storagePath = canonicalPath(data.storagePath) ?? '';
        if (source && storagePath) {
          if (sources.has(storagePath) && sources.get(storagePath) !== source) throw new BackupError('The chat background refers to a conflicting file location. Your current data has not been changed.');
          sources.set(storagePath, source);
        }
        data.storagePath = storagePath;
        delete data.deviceAssetId; // A photo-library identifier belongs to the old installation.
        await db.runAsync("UPDATE app_settings SET value = ? WHERE key = 'chat_background'", JSON.stringify(data));
      }
    } catch { throw new BackupError('The saved chat background information could not be read.'); }
  }
  await db.execAsync('UPDATE card_reminders SET notification_id = NULL;');
  return sources;
}
async function references(db: SQLiteDatabase): Promise<Reference[]> {
  const rows: Reference[] = [];
  for (const table of ['attachments', 'card_attachments'] as const) {
    for (const row of await db.getAllAsync<{ id: string; storage_path: string }>(`SELECT id, storage_path FROM ${table}`)) rows.push({ attachmentId: row.id, table, storagePath: row.storage_path });
  }
  const background = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'chat_background'");
  if (background) {
    const data = JSON.parse(background.value);
    if (data && typeof data.storagePath === 'string') rows.push({ attachmentId: 'chat_background', table: 'app_settings', storagePath: data.storagePath });
  }
  return rows;
}
async function finalizeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
}
async function snapshot(source: SQLiteDatabase, dir: string, name = 'database.sqlite') {
  const dest = await openDatabaseAsync(name, { useNewConnection: true }, dir);
  try { await backupDatabaseAsync({ sourceDatabase: source, destDatabase: dest }); await finalizeDatabase(dest); }
  finally { await dest.closeAsync(); }
}
async function checkManifestReferences(db: SQLiteDatabase, manifest: BackupManifest) {
  const actualCounts = await counts(db);
  for (const key of Object.keys(actualCounts) as (keyof typeof actualCounts)[]) if (manifest[key] !== actualCounts[key]) throw new BackupError('The backup contents do not match its backup information.');
  const files = new Set(manifest.files.map((file) => file.storagePath));
  const missing = new Map(manifest.missingAttachments.map((item) => [`${item.table}:${item.attachmentId}`, item]));
  const usedFiles = new Set<string>();
  for (const ref of await references(db)) {
    const key = `${ref.table}:${ref.attachmentId}`;
    if (files.has(ref.storagePath)) {
      if (missing.has(key)) throw new BackupError('The missing attachment report conflicts with the backup files.');
      usedFiles.add(ref.storagePath);
    } else {
      const item = missing.get(key);
      if (!item || item.expectedPath !== (ref.storagePath || '(unavailable)')) throw new BackupError('The backup is incomplete. A referenced attachment was not included.');
      missing.delete(key);
    }
  }
  if (missing.size || usedFiles.size !== files.size) throw new BackupError('The backup file list does not match its data.');
}
async function legacyManifest(db: SQLiteDatabase, dir: string, createdAt: string) {
  const files: BackupFile[] = [];
  const missingAttachments: MissingAttachment[] = [];
  const seen = new Map<string, boolean>();
  for (const ref of await references(db)) {
    let available = seen.get(ref.storagePath);
    if (available === undefined) {
      const source = ref.storagePath.startsWith('chits-attachments/') ? `${dir}attachments/${ref.storagePath.slice('chits-attachments/'.length)}` : '';
      const info = source ? await FS.getInfoAsync(source) : { exists: false };
      available = info.exists && 'isDirectory' in info && !info.isDirectory;
      if (available) files.push({ storagePath: ref.storagePath, archivePath: `attachments/${ref.storagePath.slice('chits-attachments/'.length)}`, ...await fileDetails(source) });
      seen.set(ref.storagePath, available);
    }
    if (!available) missingAttachments.push({ attachmentId: ref.attachmentId, table: ref.table, expectedPath: ref.storagePath || '(unavailable)' });
  }
  return { app: 'Chits' as const, backupVersion: 1, databaseSchemaVersion: LATEST_SCHEMA_VERSION, createdAt, appVersion: 'Unknown', ...await counts(db), database: { size: 0, sha256: '' }, files, missingAttachments };
}

/** A native SQLite snapshot + referenced files, never a JS/base64 media payload. */
export async function createBackup(database: SQLiteDatabase, progress?: Progress): Promise<CreatedBackup> {
  const end = beginBackupOperation();
  const staging = temporaryDirectory('chits-backup');
  let uri: string | null = null;
  try {
    report(progress, 'Preparing backup…');
    await pauseReminderSync();
    // Barrier behind pending SQLite writes, then a WAL-aware online snapshot.
    await database.getFirstAsync('SELECT 1');
    await database.withExclusiveTransactionAsync(async (tx) => { await tx.execAsync('UPDATE app_settings SET value = value WHERE 0;'); });
    await validateDatabase(database, LATEST_SCHEMA_VERSION, true);
    await FS.makeDirectoryAsync(staging, { intermediates: true });
    report(progress, 'Collecting data…');
    await snapshot(database, staging);
    const db = await openDatabaseAsync('database.sqlite', { useNewConnection: true }, staging);
    let manifest: BackupManifest;
    try {
      const sources = await normalizeSnapshot(db);
      const refs = await references(db);
      const files: BackupFile[] = [];
      const missingAttachments: MissingAttachment[] = [];
      const available = new Map<string, boolean>();
      let copied = 0;
      for (const ref of refs) {
        report(progress, 'Copying attachments…', copied++, refs.length);
        if (!available.has(ref.storagePath)) {
          const sourcePath = sources.get(ref.storagePath);
          const from = sourcePath ? `${directory(FS.documentDirectory)}${sourcePath}` : null;
          const info = from ? await FS.getInfoAsync(from) : { exists: false };
          if (!from || !info.exists || !('isDirectory' in info) || info.isDirectory) available.set(ref.storagePath, false);
          else {
            const archivePath = archivePathForMedia(ref.storagePath);
            await requireSpace('size' in info ? info.size : 0);
            await copyFile(from, `${staging}${archivePath}`);
            files.push({ storagePath: ref.storagePath, archivePath, ...await fileDetails(`${staging}${archivePath}`) });
            available.set(ref.storagePath, true);
          }
        }
        if (!available.get(ref.storagePath)) missingAttachments.push({ attachmentId: ref.attachmentId, table: ref.table, expectedPath: ref.storagePath || '(unavailable)' });
      }
      await validateDatabase(db, LATEST_SCHEMA_VERSION, true);
      await finalizeDatabase(db);
      manifest = { app: 'Chits', backupVersion: BACKUP_VERSION, databaseSchemaVersion: LATEST_SCHEMA_VERSION, createdAt: new Date().toISOString(), appVersion: Constants.expoConfig?.version ?? '1.0.0', ...await counts(db), database: { size: 0, sha256: '' }, files, missingAttachments };
    } finally { await db.closeAsync(); }
    manifest.database = await fileDetails(`${staging}database.sqlite`);
    await FS.writeAsStringAsync(`${staging}manifest.json`, JSON.stringify(manifest));
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const name = `Chits-Backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.chitsbackup`;
    // Unique parent prevents successive backups made in the same minute colliding.
    // Android can evict cache files while the user is in the save picker.
    // Keep the verified export in private Documents until saved or dismissed.
    const output = `${directory(FS.documentDirectory)}.chits-backup-export-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
    await FS.makeDirectoryAsync(output, { intermediates: true });
    uri = `${output}${name}`;
    await requireSpace(manifest.database.size + manifest.files.reduce((sum, file) => sum + file.size, 0));
    report(progress, 'Creating backup file…');
    await zip(staging, uri, { compressionLevel: NO_COMPRESSION });
    report(progress, 'Verifying backup…');
    const validated = await validateBackup(uri);
    if (!validated.valid) throw new BackupError(validated.reason);
    await discardValidatedBackup(validated);
    const archiveInfo = await FS.getInfoAsync(uri);
    if (!archiveInfo.exists) throw new BackupError('The finished backup file could not be found.');
    return { uri, manifest, size: archiveInfo.size };
  } catch (cause) {
    if (uri) await discardCreatedBackup(uri);
    console.warn('[backup] create failed', cause);
    throw new BackupError(backupErrorMessage(cause, 'Chits could not create a complete backup. Your current data has not been changed.'));
  } finally {
    await FS.deleteAsync(staging, { idempotent: true }).catch(() => undefined);
    resumeReminderSync(); end();
  }
}

export async function saveBackupFile(uri: string): Promise<boolean> {
  // Both platforms use the user's chosen Files/Documents provider, including cloud providers.
  const result = await ChitsFiles.exportAsync(uri, uri.split('/').pop() ?? 'Chits.chitsbackup', 'application/octet-stream');
  return result.status === 'saved';
}
export async function discardCreatedBackup(uri: string) {
  const documents = directory(FS.documentDirectory);
  if (uri.startsWith(`${documents}.chits-backup-export-`)) await FS.deleteAsync(uri.slice(0, uri.lastIndexOf('/') + 1), { idempotent: true }).catch(() => undefined);
}

export async function validateBackup(fileUri: string, progress?: Progress): Promise<BackupValidation> {
  const workDir = temporaryDirectory('chits-restore-check');
  try {
    report(progress, 'Checking backup…');
    await FS.makeDirectoryAsync(workDir, { intermediates: true });
    const selected = `${workDir}selected.chitsbackup`;
    await FS.copyAsync({ from: fileUri, to: selected }); // Own a stable file:// copy, including provider content:// sources.
    const selectedInfo = await FS.getInfoAsync(selected);
    if (!selectedInfo.exists || selectedInfo.isDirectory) throw new BackupError(INVALID_BACKUP);
    const entries = await listContents(selected);
    validateArchiveEntries(entries, await FS.getFreeDiskStorageAsync());
    const metadataEntry = entries.find((entry) => !entry.isDirectory && entry.path === 'manifest.json') ?? entries.find((entry) => !entry.isDirectory && /^(?:[^/]+\/)?metadata\.json$/.test(entry.path));
    if (!metadataEntry || metadataEntry.size > 8 * 1024 * 1024) throw new BackupError('The backup information is missing or invalid.');
    const prefix = metadataEntry.path.slice(0, -metadataEntry.path.split('/').pop()!.length);
    if (!entries.some((entry) => entry.path === `${prefix}database.sqlite` && !entry.isDirectory && entry.size > 0)) throw new BackupError('The backup is missing its Chits database.');
    const extracted = `${workDir}extracted/`;
    await FS.makeDirectoryAsync(extracted, { intermediates: true });
    // Read small metadata first so future versions are rejected before copying media.
    await unzip(selected, extracted, { entries: [metadataEntry.path] });
    const root = `${extracted}${prefix}`;
    const metadata = parseBackupMetadata(JSON.parse(await FS.readAsStringAsync(`${extracted}${metadataEntry.path}`)), LATEST_SCHEMA_VERSION);
    const modern = metadata.backupVersion === BACKUP_VERSION;
    const originalManifest = modern ? metadata as BackupManifest : null;
    const wanted = modern ? [`${prefix}database.sqlite`, ...originalManifest!.files.map((file) => `${prefix}${file.archivePath}`)] : [`${prefix}database.sqlite`, `${prefix}attachments/`];
    if (modern) {
      const entryMap = new Map(entries.map((entry) => [entry.path, entry]));
      for (const file of originalManifest!.files) if (entryMap.get(`${prefix}${file.archivePath}`)?.size !== file.size) throw new BackupError('The backup is incomplete or damaged. An attachment is missing.');
    }
    await unzip(selected, extracted, { entries: wanted });
    if (originalManifest) {
      await verifyFile(`${root}database.sqlite`, originalManifest.database);
      for (let index = 0; index < originalManifest.files.length; index++) {
        report(progress, 'Checking backup…', index + 1, originalManifest.files.length);
        const file = originalManifest.files[index];
        await verifyFile(`${root}${file.archivePath}`, file);
      }
    }
    const probe = await openDatabaseAsync('database.sqlite', { useNewConnection: true }, root);
    try { await validateDatabase(probe, modern ? (metadata as BackupManifest).databaseSchemaVersion : (metadata as { schemaVersion: number }).schemaVersion); }
    finally { await probe.closeAsync(); }
    const preparedDir = `${workDir}prepared/`;
    await copyFile(`${root}database.sqlite`, `${preparedDir}database.sqlite`);
    const db = await openDatabaseAsync('database.sqlite', { useNewConnection: true }, preparedDir);
    let manifest: BackupManifest;
    try {
      try { await migrateDatabase(db); }
      catch (cause) { console.warn('[backup] migration failed', cause); throw new BackupError('This backup could not be upgraded to the current version of Chits. Your current data has not been changed.'); }
      // Check declared references before normalizing so omissions cannot be hidden by a migration.
      if (originalManifest) await checkManifestReferences(db, originalManifest);
      await normalizeSnapshot(db);
      await validateDatabase(db, LATEST_SCHEMA_VERSION, true);
      manifest = originalManifest ?? await legacyManifest(db, root, metadata.createdAt);
      await finalizeDatabase(db);
    } finally { await db.closeAsync(); }
    const preparedDatabaseHash = await ChitsFiles.hashFileAsync(`${preparedDir}database.sqlite`);
    // No need to keep a second copy of the selected archive during confirmation.
    await FS.deleteAsync(selected, { idempotent: true });
    return { valid: true, workDir, extractedDir: root, preparedDir, manifest, preparedDatabaseHash, size: selectedInfo.size };
  } catch (cause) {
    console.warn('[backup] validation failed', cause);
    await FS.deleteAsync(workDir, { idempotent: true }).catch(() => undefined);
    return { valid: false, reason: backupErrorMessage(cause, 'This backup could not be opened. It may be damaged or is not a Chits backup.') };
  }
}

export class RestoreError extends BackupError {
  constructor(message: string, readonly dataChanged: boolean, readonly liveClosed: boolean, readonly cause?: unknown) { super(message); }
}
export async function restoreBackup(backup: ValidatedBackup, live: SQLiteDatabase, progress?: Progress): Promise<void> {
  const paths = restorePaths();
  const end = beginBackupOperation();
  let liveClosed = false;
  let commitStarted = false;
  let ownsStaging = false;
  try {
    report(progress, 'Preparing restore…');
    await pauseReminderSync();
    if ((await FS.getInfoAsync(paths.journal)).exists) throw new BackupError('Chits needs to recover an earlier restore first. Close and reopen Chits, then try again.');
    await FS.deleteAsync(paths.root, { idempotent: true });
    await FS.makeDirectoryAsync(paths.root, { intermediates: true });
    ownsStaging = true;
    if (await ChitsFiles.hashFileAsync(`${backup.preparedDir}database.sqlite`) !== backup.preparedDatabaseHash) throw new BackupError('The checked backup has changed. Choose the backup file again.');
    await copyFile(`${backup.preparedDir}database.sqlite`, paths.stagedDatabase);
    await FS.makeDirectoryAsync(paths.stagedAttachments, { intermediates: true });
    report(progress, 'Restoring attachments…');
    for (let index = 0; index < backup.manifest.files.length; index++) {
      const file = backup.manifest.files[index];
      if (!file.storagePath.startsWith('chits-attachments/')) throw new BackupError('The backup contains an unsupported attachment path.');
      const target = `${paths.stagedAttachments}${file.storagePath.slice('chits-attachments/'.length)}`;
      await copyFile(`${backup.extractedDir}${file.archivePath}`, target);
      await verifyFile(target, file);
      report(progress, 'Restoring attachments…', index + 1, backup.manifest.files.length);
    }
    const staged = await openDatabaseAsync('database.sqlite', { useNewConnection: true }, paths.root);
    try { await validateDatabase(staged, LATEST_SCHEMA_VERSION, true); await checkManifestReferences(staged, backup.manifest); await finalizeDatabase(staged); }
    finally { await staged.closeAsync(); }
    report(progress, 'Preparing restore…');
    await live.getFirstAsync('SELECT 1');
    await live.withExclusiveTransactionAsync(async (tx) => { await tx.execAsync('UPDATE app_settings SET value = value WHERE 0;'); });
    // A complete safety snapshot exists BEFORE the first live file is touched.
    await snapshot(live, paths.root, 'safety.sqlite');
    const hadAttachments = (await FS.getInfoAsync(paths.attachments)).exists;
    if (hadAttachments) await FS.copyAsync({ from: paths.attachments, to: paths.safetyAttachments });
    const journal: RestoreJournal = { version: 1, phase: 'pending', hadAttachments, safetyDatabaseHash: await ChitsFiles.hashFileAsync(paths.safetyDatabase) };
    await writeRestoreJournal(journal);
    liveClosed = true;
    await live.closeAsync();
    commitStarted = true;
    report(progress, 'Restoring data…');
    await removeDatabaseFiles(paths.database);
    await FS.moveAsync({ from: paths.stagedDatabase, to: paths.database });
    await FS.deleteAsync(paths.attachments, { idempotent: true });
    await FS.moveAsync({ from: paths.stagedAttachments, to: paths.attachments });
    report(progress, 'Finishing restore…');
    const reopened = await openDatabaseAsync('chits.db', { useNewConnection: true });
    try {
      await validateDatabase(reopened, LATEST_SCHEMA_VERSION, true);
      await checkManifestReferences(reopened, backup.manifest);
      for (const file of backup.manifest.files) await verifyFile(`${directory(FS.documentDirectory)}${file.storagePath}`, file);
    } finally { await reopened.closeAsync(); }
    await writeRestoreJournal({ ...journal, phase: 'committed' });
    await Image.clearMemoryCache().catch(() => undefined);
    await Image.clearDiskCache().catch(() => undefined);
    // Cleanup cannot turn a completed commit into a failed restore.
    await FS.deleteAsync(paths.root, { idempotent: true }).catch(() => undefined);
    await discardValidatedBackup(backup);
  } catch (cause) {
    console.warn('[backup] restore failed', cause);
    if (commitStarted) {
      try { await recoverInterruptedRestore(); }
      catch (recoveryCause) { throw new RestoreError(backupErrorMessage(recoveryCause, 'Your safety copy has been kept. Reopen Chits to recover your previous data.'), true, liveClosed, cause); }
    } else if (ownsStaging) {
      await FS.deleteAsync(paths.root, { idempotent: true }).catch(() => undefined);
    }
    throw new RestoreError(backupErrorMessage(cause, 'The backup could not be restored. Your previous Chits data has been kept.'), false, liveClosed, cause);
  } finally {
    if (!liveClosed) resumeReminderSync();
    end();
  }
}
export async function discardValidatedBackup(backup: ValidatedBackup): Promise<void> {
  if (backup.workDir.startsWith(`${directory(FS.cacheDirectory)}chits-restore-check-`)) await FS.deleteAsync(backup.workDir, { idempotent: true }).catch(() => undefined);
}
