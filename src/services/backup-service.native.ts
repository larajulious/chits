import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync, backupDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { zip, unzip } from 'react-native-zip-archive';

import { migrateDatabase } from '@/db/migrations';

const BACKUP_VERSION = 1;
const ATTACHMENTS_DIR_NAME = 'chits-attachments';
const DB_FILENAME = 'chits.db';

type BackupMetadata = { app: string; backupVersion: number; createdAt: string; schemaVersion: number };
export type BackupValidation =
  | { valid: true; extractedDir: string; metadata: BackupMetadata }
  | { valid: false; reason: string };

const INVALID_REASON = 'This file doesn’t appear to be a valid Chits backup.';

// A stored local_uri's path below `chits-attachments/` — for a flat message
// attachment that's just the filename, but for a card attachment (nested under
// `chits-attachments/cards/{cardId}/`) it preserves that subfolder too, so
// restoring rebuilds the same directory structure rather than flattening it.
function relativeToAttachmentsRoot(localUri: string): string | null {
  const marker = `${ATTACHMENTS_DIR_NAME}/`;
  const index = localUri.indexOf(marker);
  if (index < 0) return null;
  return localUri.slice(index + marker.length);
}

function timestampSlug(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function requireDir(dir: string | null, what: string): string {
  if (!dir) throw new Error(`Chits could not access ${what}.`);
  return dir;
}

/** metadata.json sits either at the zip root or one level under it, depending on
 * how the archive tool nested things — check both rather than assuming. */
async function findBackupRoot(extractDir: string): Promise<string | null> {
  if ((await FileSystem.getInfoAsync(`${extractDir}metadata.json`)).exists) return extractDir;
  const entries = await FileSystem.readDirectoryAsync(extractDir).catch(() => []);
  for (const entry of entries) {
    const candidate = `${extractDir}${entry}/`;
    if ((await FileSystem.getInfoAsync(`${candidate}metadata.json`)).exists) return candidate;
  }
  return null;
}

/**
 * Builds one portable backup archive: a consistent SQLite snapshot, the whole
 * attachments folder, and a small metadata file. Returns the zip's file:// path
 * (in the cache directory — the caller is expected to share/save it, since it is
 * not retained as backup "history").
 */
export async function createBackup(database: SQLiteDatabase): Promise<string> {
  const docDir = requireDir(FileSystem.documentDirectory, 'device storage');
  const cacheDir = requireDir(FileSystem.cacheDirectory, 'device storage');
  const stagingDir = `${cacheDir}chits-backup-staging/`;
  await FileSystem.deleteAsync(stagingDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });
  try {
    // A raw file copy of chits.db could catch it mid-write (WAL mode means the
    // latest committed data may not even be in the main file yet). SQLite's own
    // backup API produces a correct, consistent snapshot regardless of concurrent
    // activity — this is the actual point of using it over FileSystem.copyAsync.
    const destDb = await openDatabaseAsync('database.sqlite', undefined, stagingDir);
    try {
      await backupDatabaseAsync({ sourceDatabase: database, destDatabase: destDb });
    } finally {
      await destDb.closeAsync();
    }

    const attachmentsSource = `${docDir}${ATTACHMENTS_DIR_NAME}/`;
    const attachmentsTarget = `${stagingDir}attachments/`;
    if ((await FileSystem.getInfoAsync(attachmentsSource)).exists) {
      await FileSystem.copyAsync({ from: attachmentsSource, to: attachmentsTarget });
    } else {
      await FileSystem.makeDirectoryAsync(attachmentsTarget, { intermediates: true });
    }

    // Structural info only — the database already holds all the actual content.
    const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const metadata: BackupMetadata = { app: 'Chits', backupVersion: BACKUP_VERSION, createdAt: new Date().toISOString(), schemaVersion: versionRow?.user_version ?? 0 };
    const metadataPath = `${stagingDir}metadata.json`;
    await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata));

    const zipTarget = `${cacheDir}chits-backup-${timestampSlug(new Date())}.zip`;
    await FileSystem.deleteAsync(zipTarget, { idempotent: true });
    // Passing each staged item individually (rather than the staging dir itself)
    // makes each one a top-level zip entry under its own already-correct name,
    // regardless of how the underlying zip tool would otherwise nest a folder.
    await zip([`${stagingDir}database.sqlite`, attachmentsTarget, metadataPath], zipTarget);
    return zipTarget;
  } finally {
    await FileSystem.deleteAsync(stagingDir, { idempotent: true }).catch(() => undefined);
  }
}

/**
 * Extracts and checks a candidate backup file WITHOUT touching any current data.
 * On success, `extractedDir` is left on disk (caller passes it to restoreBackup,
 * or is responsible for deleting it if the user cancels).
 */
export async function validateBackup(fileUri: string): Promise<BackupValidation> {
  let cacheDir: string;
  try {
    cacheDir = requireDir(FileSystem.cacheDirectory, 'device storage');
  } catch (cause) {
    return { valid: false, reason: cause instanceof Error ? cause.message : INVALID_REASON };
  }
  const extractDir = `${cacheDir}chits-restore-validate/`;
  await FileSystem.deleteAsync(extractDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(extractDir, { intermediates: true });
  try {
    await unzip(fileUri, extractDir);
  } catch {
    return { valid: false, reason: INVALID_REASON };
  }
  const root = await findBackupRoot(extractDir);
  if (!root) return { valid: false, reason: INVALID_REASON };
  if (!(await FileSystem.getInfoAsync(`${root}database.sqlite`)).exists) return { valid: false, reason: INVALID_REASON };
  let metadata: BackupMetadata;
  try {
    metadata = JSON.parse(await FileSystem.readAsStringAsync(`${root}metadata.json`));
  } catch {
    return { valid: false, reason: INVALID_REASON };
  }
  if (metadata.app !== 'Chits' || metadata.backupVersion !== BACKUP_VERSION) {
    return { valid: false, reason: 'This backup was made by a version of Chits that isn’t supported here.' };
  }
  // Confirm the extracted file actually opens as a real SQLite database, not just
  // a same-named file.
  try {
    const probe = await openDatabaseAsync('database.sqlite', undefined, root);
    try { await probe.getFirstAsync('SELECT 1'); } finally { await probe.closeAsync(); }
  } catch {
    return { valid: false, reason: INVALID_REASON };
  }
  return { valid: true, extractedDir: root, metadata };
}

/**
 * Replaces the live database and attachments with the ones in `extractedDir`
 * (the directory validateBackup already confirmed is a real, openable backup).
 * Only call this after validateBackup has succeeded and the user has confirmed —
 * everything here is destructive to the current data.
 */
export async function restoreBackup(extractedDir: string): Promise<void> {
  const docDir = requireDir(FileSystem.documentDirectory, 'device storage');
  const sqliteDir = `${docDir}SQLite/`;
  await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true }).catch(() => undefined);
  const targetDbPath = `${sqliteDir}${DB_FILENAME}`;
  // Clear WAL/SHM sidecars for the CURRENT db so leftover uncommitted pages from
  // it can't shadow the restored file's content once reopened.
  await FileSystem.deleteAsync(`${targetDbPath}-wal`, { idempotent: true });
  await FileSystem.deleteAsync(`${targetDbPath}-shm`, { idempotent: true });
  await FileSystem.deleteAsync(targetDbPath, { idempotent: true });
  await FileSystem.copyAsync({ from: `${extractedDir}database.sqlite`, to: targetDbPath });

  const attachmentsTarget = `${docDir}${ATTACHMENTS_DIR_NAME}/`;
  await FileSystem.deleteAsync(attachmentsTarget, { idempotent: true });
  const attachmentsSource = `${extractedDir}attachments/`;
  if ((await FileSystem.getInfoAsync(attachmentsSource)).exists) {
    await FileSystem.copyAsync({ from: attachmentsSource, to: attachmentsTarget });
  } else {
    await FileSystem.makeDirectoryAsync(attachmentsTarget, { intermediates: true });
  }

  // Bring a backup made by an older Chits version up to the current schema, then
  // point every attachment at THIS device's current document directory — a
  // backup's stored absolute paths are not guaranteed to still resolve (this
  // matters most across devices/reinstalls, but rewriting is cheap and always
  // correct even in the common same-device case).
  const restored = await openDatabaseAsync(DB_FILENAME, undefined, sqliteDir);
  try {
    await migrateDatabase(restored);
    const rows = await restored.getAllAsync<{ id: string; local_uri: string }>('SELECT id, local_uri FROM attachments');
    for (const row of rows) {
      const relative = relativeToAttachmentsRoot(row.local_uri);
      if (!relative) continue;
      const nextUri = `${attachmentsTarget}${relative}`;
      if (nextUri !== row.local_uri) await restored.runAsync('UPDATE attachments SET local_uri = ? WHERE id = ?', nextUri, row.id);
    }
    // Card attachments live in a nested subfolder of the same attachments root —
    // rewritten the same way so a restore on a new device/reinstall still resolves.
    const cardAttachmentRows = await restored.getAllAsync<{ id: string; local_uri: string }>('SELECT id, local_uri FROM card_attachments');
    for (const row of cardAttachmentRows) {
      const relative = relativeToAttachmentsRoot(row.local_uri);
      if (!relative) continue;
      const nextUri = `${attachmentsTarget}${relative}`;
      if (nextUri !== row.local_uri) await restored.runAsync('UPDATE card_attachments SET local_uri = ? WHERE id = ?', nextUri, row.id);
    }
  } finally {
    await restored.closeAsync();
  }

  await FileSystem.deleteAsync(extractedDir, { idempotent: true }).catch(() => undefined);
}

export async function discardValidatedBackup(extractedDir: string): Promise<void> {
  await FileSystem.deleteAsync(extractedDir, { idempotent: true }).catch(() => undefined);
}
