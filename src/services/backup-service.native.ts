import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync, backupDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { zip, unzip } from 'react-native-zip-archive';

import { ChitsFiles } from '../../modules/chits-attachments';
import { LATEST_SCHEMA_VERSION, migrateDatabase } from '@/db/migrations';
import { normalizeStoredAttachmentPath } from '@/services/attachment-path';

const BACKUP_VERSION = 1;
const ATTACHMENTS_DIR_NAME = 'chits-attachments';
const DB_FILENAME = 'chits.db';

type BackupMetadata = { app: string; backupVersion: number; createdAt: string; schemaVersion: number };
export type BackupValidation =
  | { valid: true; extractedDir: string; metadata: BackupMetadata }
  | { valid: false; reason: string };

const INVALID_REASON = 'This file doesn’t appear to be a valid Chits backup.';

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

export type BackupSaveResult = { saved: true; location: string | null } | { saved: false };

/**
 * Puts a finished backup zip somewhere the user keeps it, then deletes the
 * temporary copy: straight into Downloads/Chits on Android 10+ (like Download),
 * otherwise the system save screen (iOS Files sheet, older Android "Save as").
 * Resolves { saved: false } if the user cancels — the backup then isn't kept
 * anywhere, so it must not be reported as created.
 */
export async function saveBackupFile(zipPath: string): Promise<BackupSaveResult> {
  const fileName = zipPath.split('/').pop() ?? 'chits-backup.zip';
  try {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 29) {
      const result = await ChitsFiles.saveToDownloadsAsync(zipPath, fileName, 'application/zip');
      return result.status === 'saved' ? { saved: true, location: 'Downloads/Chits' } : { saved: false };
    }
    const result = await ChitsFiles.exportAsync(zipPath, fileName, 'application/zip');
    return result.status === 'saved' ? { saved: true, location: null } : { saved: false };
  } finally {
    await FileSystem.deleteAsync(zipPath, { idempotent: true }).catch(() => undefined);
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
  // A newer app's database layout can't be safely opened by this version.
  if (typeof metadata.schemaVersion === 'number' && metadata.schemaVersion > LATEST_SCHEMA_VERSION) {
    return { valid: false, reason: 'This backup was made by a newer version of Chits. Update Chits, then restore it.' };
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

/** Thrown by restoreBackup; `liveClosed` means the app must be reset to reopen its database. */
export class RestoreError extends Error {
  constructor(message: string, readonly dataChanged: boolean, readonly liveClosed: boolean, readonly cause?: unknown) {
    super(message);
  }
}

/**
 * Replaces the live database and attachments with the ones in `extractedDir`
 * (already confirmed by validateBackup, and confirmed by the user).
 *
 * Stage first, swap last: the backup's database is copied beside the live one
 * and upgraded there, and its attachments are copied beside the live folder —
 * all while current data is untouched, so any failure up to this point (full
 * storage, a bad file) leaves everything exactly as it was. Only then is the
 * live connection closed (so it can't write to, or delete companion files of,
 * the restored database) and the staged copies renamed into place, keeping the
 * previous data until the swap succeeds so it can be rolled back.
 *
 * After it resolves the live connection is closed: the caller must reset the app.
 */
export async function restoreBackup(extractedDir: string, live: SQLiteDatabase): Promise<void> {
  const docDir = requireDir(FileSystem.documentDirectory, 'device storage');
  const sqliteDir = `${docDir}SQLite/`;
  const targetDbPath = `${sqliteDir}${DB_FILENAME}`;
  const stagedDbName = 'chits.restoring.db';
  const stagedDbPath = `${sqliteDir}${stagedDbName}`;
  const previousDbPath = `${sqliteDir}chits.previous.db`;
  const attachmentsTarget = `${docDir}${ATTACHMENTS_DIR_NAME}/`;
  const stagedAttachments = `${docDir}${ATTACHMENTS_DIR_NAME}.restoring/`;
  const previousAttachments = `${docDir}${ATTACHMENTS_DIR_NAME}.previous/`;
  const removeDb = async (path: string) => {
    for (const suffix of ['', '-wal', '-shm', '-journal']) await FileSystem.deleteAsync(`${path}${suffix}`, { idempotent: true }).catch(() => undefined);
  };

  // 1. Stage (current data untouched).
  try {
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true }).catch(() => undefined);
    await removeDb(stagedDbPath);
    await FileSystem.deleteAsync(stagedAttachments, { idempotent: true });
    await FileSystem.copyAsync({ from: `${extractedDir}database.sqlite`, to: stagedDbPath });
    // Bring older backups up to the current schema, with paths kept relative
    // (resolved against this installation's Documents directory at runtime).
    const staged = await openDatabaseAsync(stagedDbName, undefined, sqliteDir);
    try {
      await migrateDatabase(staged);
      for (const table of ['attachments', 'card_attachments'] as const) {
        const rows = await staged.getAllAsync<{ id: string; storage_path: string | null }>(`SELECT id, storage_path FROM ${table}`);
        for (const row of rows) {
          const storagePath = normalizeStoredAttachmentPath(row.storage_path) ?? '';
          await staged.runAsync(`UPDATE ${table} SET storage_path = ? WHERE id = ?`, storagePath, row.id);
        }
      }
      // Fold everything into the single database file so it can be renamed on its own.
      await staged.execAsync('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
    } finally {
      await staged.closeAsync();
    }
    const attachmentsSource = `${extractedDir}attachments/`;
    if ((await FileSystem.getInfoAsync(attachmentsSource)).exists) await FileSystem.copyAsync({ from: attachmentsSource, to: stagedAttachments });
    else await FileSystem.makeDirectoryAsync(stagedAttachments, { intermediates: true });
  } catch (cause) {
    await removeDb(stagedDbPath);
    await FileSystem.deleteAsync(stagedAttachments, { idempotent: true }).catch(() => undefined);
    throw new RestoreError('The backup could not be prepared.', false, false, cause);
  }

  // 2. Swap. Close the live connection first so nothing can write to or clean
  // up files under the paths being replaced.
  try {
    await live.closeAsync();
  } catch (cause) {
    throw new RestoreError('Chits could not release its database.', false, false, cause);
  }
  let movedDb = false;
  let movedAttachments = false;
  try {
    await removeDb(previousDbPath);
    await FileSystem.deleteAsync(`${targetDbPath}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${targetDbPath}-shm`, { idempotent: true });
    if ((await FileSystem.getInfoAsync(targetDbPath)).exists) { await FileSystem.moveAsync({ from: targetDbPath, to: previousDbPath }); movedDb = true; }
    await FileSystem.moveAsync({ from: stagedDbPath, to: targetDbPath });
    await FileSystem.deleteAsync(previousAttachments, { idempotent: true });
    if ((await FileSystem.getInfoAsync(attachmentsTarget)).exists) { await FileSystem.moveAsync({ from: attachmentsTarget, to: previousAttachments }); movedAttachments = true; }
    await FileSystem.moveAsync({ from: stagedAttachments, to: attachmentsTarget });
  } catch (cause) {
    // Roll back to the previous data.
    try {
      if (movedDb) { await removeDb(targetDbPath); await FileSystem.moveAsync({ from: previousDbPath, to: targetDbPath }); }
      if (movedAttachments) { await FileSystem.deleteAsync(attachmentsTarget, { idempotent: true }); await FileSystem.moveAsync({ from: previousAttachments, to: attachmentsTarget }); }
      await removeDb(stagedDbPath);
      await FileSystem.deleteAsync(stagedAttachments, { idempotent: true });
      throw new RestoreError('The backup could not be restored.', false, true, cause);
    } catch (rollbackError) {
      if (rollbackError instanceof RestoreError) throw rollbackError;
      throw new RestoreError('The backup could not be restored and your previous data could not be fully put back.', true, true, cause);
    }
  }

  // 3. Clean up the previous data and the extracted backup.
  await removeDb(previousDbPath);
  await FileSystem.deleteAsync(previousAttachments, { idempotent: true }).catch(() => undefined);
  await FileSystem.deleteAsync(extractedDir, { idempotent: true }).catch(() => undefined);
}

export async function discardValidatedBackup(extractedDir: string): Promise<void> {
  await FileSystem.deleteAsync(extractedDir, { idempotent: true }).catch(() => undefined);
}
