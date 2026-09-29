import { normalizeStoredAttachmentPath } from './attachment-path';

export const BACKUP_VERSION = 2;
export type BackupFile = { storagePath: string; archivePath: string; size: number; sha256: string };
export type MissingAttachment = { attachmentId: string; table: 'attachments' | 'card_attachments' | 'app_settings'; expectedPath: string };
export type BackupManifest = {
  app: 'Chits'; backupVersion: number; databaseSchemaVersion: number; createdAt: string; appVersion: string;
  chatItemCount: number; boardCount: number; columnCount: number; cardCount: number; attachmentCount: number;
  database: { size: number; sha256: string };
  files: BackupFile[]; missingAttachments: MissingAttachment[];
};
export type LegacyMetadata = { app: 'Chits'; backupVersion: 1; createdAt: string; schemaVersion: number };
export class BackupError extends Error {}
export const INVALID_BACKUP = 'This file is not a valid Chits backup. Choose a .chitsbackup file created by Chits.';
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function portableMediaPath(value: string | null | undefined) {
  const path = normalizeStoredAttachmentPath(value);
  // Never allow a backup to overwrite SQLite, the recovery journal or other private files.
  return path && (path.startsWith('chits-attachments/') || path.startsWith('attachments/')) ? path : null;
}
export function archivePathForMedia(path: string) {
  if (portableMediaPath(path) !== path) throw new BackupError(INVALID_BACKUP);
  return `attachments/${path}`;
}
export function parseBackupMetadata(value: unknown, latestSchema: number): BackupManifest | LegacyMetadata {
  if (!object(value) || value.app !== 'Chits' || !count(value.backupVersion)) throw new BackupError(INVALID_BACKUP);
  if (value.backupVersion > BACKUP_VERSION) throw new BackupError('This backup was created by a newer version of Chits. Update Chits, then try again.');
  if (![1, BACKUP_VERSION].includes(value.backupVersion)) throw new BackupError('This backup format is not supported by this version of Chits.');
  const schema = value.backupVersion === 1 ? value.schemaVersion : value.databaseSchemaVersion;
  if (!count(schema) || schema < 1 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new BackupError('The backup information is invalid or incomplete.');
  if (schema > latestSchema) throw new BackupError('This backup was created by a newer version of Chits. Update Chits, then try again.');
  if (value.backupVersion === 1) return value as LegacyMetadata;
  if (typeof value.appVersion !== 'string' || !object(value.database) || !count(value.database.size) || !hash(value.database.sha256) || !Array.isArray(value.files) || !Array.isArray(value.missingAttachments)) throw new BackupError('The backup information is invalid or incomplete.');
  for (const key of ['chatItemCount', 'boardCount', 'columnCount', 'cardCount', 'attachmentCount']) if (!count(value[key])) throw new BackupError('The backup information is invalid or incomplete.');
  const paths = new Set<string>();
  const archivePaths = new Set<string>();
  for (const file of value.files) {
    if (!object(file) || typeof file.storagePath !== 'string' || !file.storagePath.startsWith('chits-attachments/') || portableMediaPath(file.storagePath) !== file.storagePath || file.archivePath !== archivePathForMedia(file.storagePath) || !count(file.size) || !hash(file.sha256) || paths.has(file.storagePath) || archivePaths.has(file.archivePath as string)) throw new BackupError('The backup file list is invalid.');
    paths.add(file.storagePath); archivePaths.add(file.archivePath as string);
  }
  const missing = new Set<string>();
  for (const item of value.missingAttachments) {
    if (!object(item) || typeof item.attachmentId !== 'string' || typeof item.expectedPath !== 'string' || !['attachments', 'card_attachments', 'app_settings'].includes(String(item.table))) throw new BackupError('The missing attachment report is invalid.');
    const key = `${item.table}:${item.attachmentId}`;
    if (missing.has(key)) throw new BackupError('The missing attachment report is invalid.');
    missing.add(key);
  }
  return value as BackupManifest;
}
export type ArchiveEntry = { path: string; size: number; compressedSize: number; isDirectory: boolean; isEncrypted: boolean };
export function validateArchiveEntries(entries: ArchiveEntry[], freeBytes: number) {
  if (!entries.length || entries.length > 100_000) throw new BackupError(INVALID_BACKUP);
  const paths = new Set<string>();
  let size = 0;
  for (const entry of entries) {
    const path = entry.path.replace(/\/$/, '');
    if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.includes(':') || entry.isEncrypted || paths.has(path) || !count(entry.size)) throw new BackupError('The backup archive is damaged or contains unsafe files.');
    for (const part of path.split('/')) {
      let decoded: string;
      try { decoded = decodeURIComponent(part); } catch { throw new BackupError(INVALID_BACKUP); }
      if (!part || ['.', '..'].includes(decoded) || /[/\\\0]/.test(decoded)) throw new BackupError('The backup archive contains unsafe file paths.');
    }
    paths.add(path);
    size += entry.size;
    if (!Number.isSafeInteger(size)) throw new BackupError(INVALID_BACKUP);
  }
  if (size + 16 * 1024 * 1024 > freeBytes) throw new BackupError('There is not enough free storage to open this backup. Free some space, then try again.');
  return size;
}
export function backupErrorMessage(cause: unknown, fallback: string) {
  if (cause instanceof BackupError) return cause.message;
  const details = cause instanceof Error ? cause.message : String(cause);
  if (/ENOSPC|no space|disk.*full|ERR_EXPORT_NO_SPACE/i.test(details)) return 'There is not enough free storage. Free some space, then try again.';
  if (/permission|access.*denied|ERR_EXPORT_PERMISSION/i.test(details)) return 'Chits could not access that file or folder. Choose another location, then try again.';
  return fallback;
}
