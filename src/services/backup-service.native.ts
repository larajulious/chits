import { tr } from '@/localization/runtime';
import Constants from 'expo-constants';
import * as FS from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { listContents, NO_COMPRESSION, unzip, zip } from 'react-native-zip-archive';

import { LATEST_SCHEMA_VERSION, migrateDatabase } from '@/db/migrations';
import { TEMPLATE_COLUMNS } from '@/db/template-schema';
import { normalizeTemplateDocument } from './note-templates';
import { REVISIT_COLUMNS } from '@/db/revisit-schema';
import { FOCUS_COLUMNS } from '@/db/focus-schema';
import { ChitsFiles } from '../../modules/chits-attachments';
import { archivePathForMedia, BACKUP_VERSION, BackupError, backupErrorMessage, invalidBackupMessage, parseBackupMetadata, portableMediaPath, validateArchiveEntries, type BackupFile, type BackupManifest, type MissingAttachment } from './backup-format';
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
const currentTables = [...requiredTables, 'timeline_events', 'app_settings', 'card_comments', 'card_attachments', 'card_reminders', 'space_placements', 'message_reminders', 'card_subtasks', 'calendar_entries', ...Object.keys(REVISIT_COLUMNS), ...Object.keys(TEMPLATE_COLUMNS), ...Object.keys(FOCUS_COLUMNS)];
const MARGIN = 16 * 1024 * 1024;
function directory(value: string | null) {
  if (!value) throw new BackupError(tr("attachmentstorage.chitsCouldNotAccessPrivateDeviceStorage"));
  return value;
}
function temporaryDirectory(prefix: string) {
  return `${directory(FS.cacheDirectory)}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
}
function report(progress: Progress | undefined, label: string, completed?: number, total?: number) { progress?.({ label, completed, total }); }
async function requireSpace(bytes: number) {
  if (await FS.getFreeDiskStorageAsync() < bytes + MARGIN) throw new BackupError(tr("backupservice.thereIsNotEnoughFreeStorageFreeSome"));
}
async function fileDetails(uri: string) {
  const info = await FS.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new BackupError(tr("backupservice.aRequiredBackupFileIsMissingOrUnreadable"));
  return { size: info.size, sha256: await ChitsFiles.hashFileAsync(uri) };
}
async function verifyFile(uri: string, expected: { size: number; sha256: string }) {
  const details = await fileDetails(uri);
  if (details.size !== expected.size || details.sha256 !== expected.sha256) throw new BackupError(tr("backupservice.thisBackupIsDamagedOneOrMoreFiles"));
}
async function copyFile(from: string, to: string) {
  await FS.makeDirectoryAsync(to.slice(0, to.lastIndexOf('/') + 1), { intermediates: true });
  await FS.copyAsync({ from, to });
}
async function tableExists(db: SQLiteDatabase, table: string) {
  return !!await db.getFirstAsync('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', 'table', table);
}
async function validateDatabase(db: SQLiteDatabase, expectedSchema?: number, current = false, checkRelationships = true) {
  const integrity = await db.getAllAsync<Record<string, string>>('PRAGMA integrity_check');
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new BackupError(tr("backupservice.theBackupDatabaseIsDamagedAndCannotBe"));
  const schema = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (schema < 1 || schema > LATEST_SCHEMA_VERSION || (expectedSchema !== undefined && schema !== expectedSchema)) throw new BackupError(tr("backupservice.theBackupDatabaseVersionDoesNotMatchIts"));
  const tables = current ? currentTables : [...requiredTables, ...(schema >= 4 ? ['timeline_events'] : []), ...(schema >= 8 ? ['app_settings'] : []), ...(schema >= 16 ? ['card_comments'] : []), ...(schema >= 17 ? ['card_attachments'] : []), ...(schema >= 20 ? ['card_reminders'] : []), ...(schema >= 21 ? ['space_placements'] : []), ...(schema >= 22 ? ['message_reminders'] : []), ...(schema >= 23 ? ['card_subtasks'] : []), ...(schema >= 26 ? ['calendar_entries'] : [])];
  if (!current && schema >= 28) tables.push(...Object.keys(TEMPLATE_COLUMNS));
  if (!current && schema >= 29) tables.push(...Object.keys(FOCUS_COLUMNS));
  if (!current && schema >= 27) tables.push(...Object.keys(REVISIT_COLUMNS));
  for (const table of tables) if (!await tableExists(db, table)) throw new BackupError(tr("backupservice.theBackupDatabaseIsIncompleteARequiredPart"));
  const columns: Record<string, string[]> = {
    ...REVISIT_COLUMNS,
    ...TEMPLATE_COLUMNS,
    ...FOCUS_COLUMNS,
    messages: ['id', 'text', 'type', 'created_at', 'updated_at', 'archived_at', 'pinned', 'deleted_at', ...(schema >= 18 ? ['is_hidden_content'] : []), ...(schema >= 24 ? ['content_json'] : [])],
    attachments: ['id', 'message_id', 'type', schema >= 19 ? 'storage_path' : 'local_uri', 'original_name', 'mime_type', 'size', 'duration', 'width', 'height', 'created_at'],
    boards: ['id', 'name', 'icon', 'accent', 'created_at', 'updated_at', 'archived_at', ...(schema >= 2 ? ['pinned'] : []), ...(schema >= 3 ? ['last_opened_at'] : []), ...(schema >= 6 ? ['show_next_column_peek'] : []), ...(schema >= 7 ? ['show_column_navigator'] : [])],
    board_columns: ['id', 'board_id', 'name', 'position', 'created_at', 'updated_at'],
    cards: ['id', 'board_id', 'column_id', 'title', 'position', 'archived_at', 'created_at', 'updated_at', ...(schema >= 2 ? ['pinned'] : []), ...(schema >= 3 ? ['last_opened_at'] : [])],
    card_messages: ['card_id', 'message_id', 'position'],
    timeline_events: ['id', 'event_type', 'created_at', 'related_message_id', 'related_card_id', 'related_board_id', 'metadata_json', ...(schema >= 5 ? ['dedupe_key'] : [])],
    app_settings: ['key', 'value', 'updated_at'],
    card_comments: ['id', 'card_id', 'text', 'created_at', 'updated_at', 'deleted_at'],
    card_attachments: ['id', 'card_id', 'type', schema >= 19 ? 'storage_path' : 'local_uri', 'original_name', 'mime_type', 'size', 'width', 'height', 'duration', 'created_at', 'updated_at', 'deleted_at'],
    card_reminders: ['card_id', 'scheduled_at', 'notification_id', 'created_at', 'updated_at', ...(schema >= 22 ? ['completed_at'] : [])],
    message_reminders: ['message_id', 'scheduled_at', 'notification_id', 'completed_at', 'created_at', 'updated_at'],
    card_subtasks: ['id', 'card_id', 'title', 'is_completed', 'position', 'created_at', 'updated_at', 'completed_at'],
    calendar_entries: ['id', 'message_id', 'card_id', 'date_key', 'start_minute', 'end_minute', 'reminder_offset', 'created_at', 'updated_at'],
    space_placements: ['id', 'message_id', 'card_id', 'space_id', 'x', 'y', 'rotation', 'color', 'z_index', 'pinned_at', 'updated_at', ...(schema >= 25 ? ['paper_style'] : [])],
  };
  for (const table of tables) {
    const actual = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((row) => row.name));
    if (columns[table].some((column) => !actual.has(column))) throw new BackupError(tr("backupservice.theBackupDatabaseIsIncompleteOrHasAn"));
  }
  if (schema >= 29) {
    const active = await db.getFirstAsync<{ count: number }>("SELECT count(*) AS count FROM focus_sessions WHERE status IN ('running','paused')");
    if ((active?.count ?? 0) > 1) throw new BackupError(tr('backupservice.theBackupContainsBrokenDataRelationshipsAndCannot'));
  }
  if (schema >= 28) {
    for (const row of await db.getAllAsync<{ document_json: string; document_version: number }>('SELECT document_json, document_version FROM note_templates')) {
      try {
        if (row.document_version !== 1) throw new Error();
        normalizeTemplateDocument(JSON.parse(row.document_json));
      } catch { throw new BackupError(invalidBackupMessage()); }
    }
  }
  if (checkRelationships) {
    if ((await db.getAllAsync('PRAGMA foreign_key_check')).length) throw new BackupError(tr("backupservice.theBackupContainsBrokenDataRelationshipsAndCannot"));
    const wrongColumns = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM cards c JOIN board_columns bc ON bc.id = c.column_id WHERE c.board_id != bc.board_id');
    if (wrongColumns?.count) throw new BackupError(tr("backupservice.theBackupContainsCardsAssignedToTheWrong"));
    const relations = [['attachments', 'message_id', 'messages'], ['board_columns', 'board_id', 'boards'], ['cards', 'board_id', 'boards'], ['cards', 'column_id', 'board_columns'], ['card_messages', 'card_id', 'cards'], ['card_messages', 'message_id', 'messages'], ...(schema >= 16 ? [['card_comments', 'card_id', 'cards']] : []), ...(schema >= 17 ? [['card_attachments', 'card_id', 'cards']] : []), ...(schema >= 20 ? [['card_reminders', 'card_id', 'cards']] : []), ...(schema >= 21 ? [['space_placements', 'message_id', 'messages'], ['space_placements', 'card_id', 'cards']] : []), ...(schema >= 22 ? [['message_reminders', 'message_id', 'messages']] : []), ...(schema >= 23 ? [['card_subtasks', 'card_id', 'cards']] : []), ...(schema >= 26 ? [['calendar_entries', 'message_id', 'messages'], ['calendar_entries', 'card_id', 'cards']] : [])];
    if (schema >= 27) relations.push(['revisit_notes','message_id','messages'], ['revisit_notes','card_id','cards']);
    for (const [child, key, parent] of relations) {
      if (await db.getFirstAsync(`SELECT 1 FROM ${child} c LEFT JOIN ${parent} p ON p.id = c.${key} WHERE c.${key} IS NOT NULL AND p.id IS NULL LIMIT 1`)) throw new BackupError(tr("backupservice.theBackupContainsBrokenDataRelationshipsAndCannot"));
    }
    if (schema >= 27) {
      for (const table of ['note_relationships','revisit_rejections']) {
        if (await db.getFirstAsync(`SELECT 1 FROM ${table} r LEFT JOIN revisit_notes a ON a.note_key = r.note_a LEFT JOIN revisit_notes b ON b.note_key = r.note_b WHERE a.note_key IS NULL OR b.note_key IS NULL OR r.note_a >= r.note_b LIMIT 1`)) throw new BackupError(tr("backupservice.theBackupContainsBrokenNoteConnections"));
      }
      if (await db.getFirstAsync('SELECT 1 FROM revisit_events e LEFT JOIN revisit_notes n ON n.note_key = e.note_key WHERE n.note_key IS NULL LIMIT 1')) throw new BackupError(tr("backupservice.theBackupContainsBrokenReviewHistory"));
    }
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
        if (sources.has(storagePath) && sources.get(storagePath) !== source) throw new BackupError(tr("backupservice.twoAttachmentsReferToConflictingFileLocationsYour"));
        sources.set(storagePath, source);
      }
      if (storagePath !== row.storage_path) await db.runAsync(`UPDATE ${table} SET storage_path = ? WHERE id = ?`, storagePath, row.id);
    }
  }
  for (const key of ['chat_background', 'custom_header_photo']) {
    const background = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
    if (background) {
      try {
        const data = JSON.parse(background.value);
        if (data && typeof data.storagePath === 'string') {
          const source = portableMediaPath(data.storagePath);
          const storagePath = canonicalPath(data.storagePath) ?? '';
          if (source && storagePath) {
            if (sources.has(storagePath) && sources.get(storagePath) !== source) throw new BackupError(tr("backupservice.aSavedPhotoRefersToAConflictingFile"));
            sources.set(storagePath, source);
          }
          data.storagePath = storagePath;
          delete data.deviceAssetId; // A photo-library identifier belongs to the old installation.
          await db.runAsync('UPDATE app_settings SET value = ? WHERE key = ?', JSON.stringify(data), key);
        }
      } catch { throw new BackupError(tr("backupservice.theSavedPhotoInformationCouldNotBeRead")); }
    }
  }
  await db.execAsync('UPDATE card_reminders SET notification_id = NULL;');
  await db.execAsync('UPDATE message_reminders SET notification_id = NULL;');
  return sources;
}
async function repairSnapshotRelationships(db: SQLiteDatabase) {
  await db.execAsync(`
    DELETE FROM attachments WHERE NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = attachments.message_id);
    DELETE FROM card_messages WHERE NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = card_messages.card_id) OR NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = card_messages.message_id);
    DELETE FROM card_comments WHERE NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = card_comments.card_id);
    DELETE FROM card_attachments WHERE NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = card_attachments.card_id);
    DELETE FROM card_reminders WHERE NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = card_reminders.card_id);
    DELETE FROM card_subtasks WHERE NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = card_subtasks.card_id);
    DELETE FROM message_reminders WHERE NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = message_reminders.message_id);
    DELETE FROM space_placements WHERE (message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = space_placements.message_id)) OR (card_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = space_placements.card_id));
    DELETE FROM calendar_entries WHERE (message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = calendar_entries.message_id)) OR (card_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = calendar_entries.card_id));
    UPDATE cards SET board_id = (SELECT board_columns.board_id FROM board_columns WHERE board_columns.id = cards.column_id)
      WHERE EXISTS (SELECT 1 FROM board_columns JOIN boards ON boards.id = board_columns.board_id WHERE board_columns.id = cards.column_id)
        AND board_id != (SELECT board_columns.board_id FROM board_columns WHERE board_columns.id = cards.column_id);
    DELETE FROM card_messages WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM card_comments WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM card_attachments WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM card_reminders WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM card_subtasks WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM space_placements WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM calendar_entries WHERE card_id IN (SELECT cards.id FROM cards LEFT JOIN boards ON boards.id = cards.board_id LEFT JOIN board_columns ON board_columns.id = cards.column_id WHERE boards.id IS NULL OR board_columns.id IS NULL);
    DELETE FROM cards WHERE NOT EXISTS (SELECT 1 FROM boards WHERE boards.id = cards.board_id) OR NOT EXISTS (SELECT 1 FROM board_columns WHERE board_columns.id = cards.column_id);
    DELETE FROM board_columns WHERE NOT EXISTS (SELECT 1 FROM boards WHERE boards.id = board_columns.board_id);
  `);
  // Only private snapshots are repaired. Live notes and relationships are never
  // removed by validation; old backups get these tables during migration.
  if (await tableExists(db, 'revisit_notes')) await db.execAsync(`
    DELETE FROM revisit_notes WHERE (message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages WHERE id = message_id AND deleted_at IS NULL))
      OR (card_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cards WHERE id = card_id));
    DELETE FROM note_relationships WHERE NOT EXISTS (SELECT 1 FROM revisit_notes WHERE note_key = note_a) OR NOT EXISTS (SELECT 1 FROM revisit_notes WHERE note_key = note_b);
    DELETE FROM revisit_rejections WHERE NOT EXISTS (SELECT 1 FROM revisit_notes WHERE note_key = note_a) OR NOT EXISTS (SELECT 1 FROM revisit_notes WHERE note_key = note_b);
    DELETE FROM revisit_events WHERE NOT EXISTS (SELECT 1 FROM revisit_notes WHERE note_key = revisit_events.note_key);
  `);
}
async function references(db: SQLiteDatabase): Promise<Reference[]> {
  const rows: Reference[] = [];
  for (const table of ['attachments', 'card_attachments'] as const) {
    for (const row of await db.getAllAsync<{ id: string; storage_path: string }>(`SELECT id, storage_path FROM ${table}`)) rows.push({ attachmentId: row.id, table, storagePath: row.storage_path });
  }
  for (const key of ['chat_background', 'custom_header_photo']) {
    const background = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
    if (background) {
      const data = JSON.parse(background.value);
      if (data && typeof data.storagePath === 'string') rows.push({ attachmentId: key, table: 'app_settings', storagePath: data.storagePath });
    }
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
  for (const key of Object.keys(actualCounts) as (keyof typeof actualCounts)[]) if (manifest[key] !== actualCounts[key]) throw new BackupError(tr("backupservice.theBackupContentsDoNotMatchItsBackup"));
  const files = new Set(manifest.files.map((file) => file.storagePath));
  const missing = new Map(manifest.missingAttachments.map((item) => [`${item.table}:${item.attachmentId}`, item]));
  const usedFiles = new Set<string>();
  for (const ref of await references(db)) {
    const key = `${ref.table}:${ref.attachmentId}`;
    if (files.has(ref.storagePath)) {
      if (missing.has(key)) throw new BackupError(tr("backupservice.theMissingAttachmentReportConflictsWithTheBackup"));
      usedFiles.add(ref.storagePath);
    } else {
      const item = missing.get(key);
      if (!item || item.expectedPath !== (ref.storagePath || '(unavailable)')) throw new BackupError(tr("backupservice.theBackupIsIncompleteAReferencedAttachmentWas"));
      missing.delete(key);
    }
  }
  if (missing.size || usedFiles.size !== files.size) throw new BackupError(tr("backupservice.theBackupFileListDoesNotMatchIts"));
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
  return { app: 'Chits' as const, backupVersion: 1, databaseSchemaVersion: LATEST_SCHEMA_VERSION, createdAt, appVersion: tr("backupservice.unknown"), ...await counts(db), database: { size: 0, sha256: '' }, files, missingAttachments };
}

/** A native SQLite snapshot + referenced files, never a JS/base64 media payload. */
export async function createBackup(database: SQLiteDatabase, progress?: Progress): Promise<CreatedBackup> {
  const end = beginBackupOperation();
  const staging = temporaryDirectory('chits-backup');
  let uri: string | null = null;
  try {
    report(progress, tr("backup.preparingBackup"));
    await pauseReminderSync();
    // Barrier behind pending SQLite writes, then a WAL-aware online snapshot.
    await database.getFirstAsync('SELECT 1');
    await database.withExclusiveTransactionAsync(async (tx) => { await tx.execAsync('UPDATE app_settings SET value = value WHERE 0;'); });
    await validateDatabase(database, LATEST_SCHEMA_VERSION, true, false);
    await FS.makeDirectoryAsync(staging, { intermediates: true });
    report(progress, tr("backupservice.collectingData"));
    await snapshot(database, staging);
    const db = await openDatabaseAsync('database.sqlite', { useNewConnection: true }, staging);
    let manifest: BackupManifest;
    try {
      await repairSnapshotRelationships(db);
      const sources = await normalizeSnapshot(db);
      const refs = await references(db);
      const files: BackupFile[] = [];
      const missingAttachments: MissingAttachment[] = [];
      const available = new Map<string, boolean>();
      let copied = 0;
      for (const ref of refs) {
        report(progress, tr("backupservice.copyingAttachments"), copied++, refs.length);
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
    report(progress, tr("backupservice.creatingBackupFile"));
    await zip(staging, uri, { compressionLevel: NO_COMPRESSION });
    report(progress, tr("backupservice.verifyingBackup"));
    const validated = await validateBackup(uri);
    if (!validated.valid) throw new BackupError(validated.reason);
    await discardValidatedBackup(validated);
    const archiveInfo = await FS.getInfoAsync(uri);
    if (!archiveInfo.exists) throw new BackupError(tr("backupservice.theFinishedBackupFileCouldNotBeFound"));
    return { uri, manifest, size: archiveInfo.size };
  } catch (cause) {
    if (uri) await discardCreatedBackup(uri);
    console.warn('[backup] create failed', cause);
    throw new BackupError(backupErrorMessage(cause, tr("backupservice.chitsCouldNotCreateACompleteBackupYour")));
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
    report(progress, tr("backupservice.checkingBackup"));
    await FS.makeDirectoryAsync(workDir, { intermediates: true });
    const selected = `${workDir}selected.chitsbackup`;
    await FS.copyAsync({ from: fileUri, to: selected }); // Own a stable file:// copy, including provider content:// sources.
    const selectedInfo = await FS.getInfoAsync(selected);
    if (!selectedInfo.exists || selectedInfo.isDirectory) throw new BackupError(invalidBackupMessage());
    const entries = await listContents(selected);
    validateArchiveEntries(entries, await FS.getFreeDiskStorageAsync());
    const metadataEntry = entries.find((entry) => !entry.isDirectory && entry.path === 'manifest.json') ?? entries.find((entry) => !entry.isDirectory && /^(?:[^/]+\/)?metadata\.json$/.test(entry.path));
    if (!metadataEntry || metadataEntry.size > 8 * 1024 * 1024) throw new BackupError(tr("backupservice.theBackupInformationIsMissingOrInvalid"));
    const prefix = metadataEntry.path.slice(0, -metadataEntry.path.split('/').pop()!.length);
    if (!entries.some((entry) => entry.path === `${prefix}database.sqlite` && !entry.isDirectory && entry.size > 0)) throw new BackupError(tr("backupservice.theBackupIsMissingItsChitsDatabase"));
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
      for (const file of originalManifest!.files) if (entryMap.get(`${prefix}${file.archivePath}`)?.size !== file.size) throw new BackupError(tr("backupservice.theBackupIsIncompleteOrDamagedAnAttachment"));
    }
    await unzip(selected, extracted, { entries: wanted });
    if (originalManifest) {
      await verifyFile(`${root}database.sqlite`, originalManifest.database);
      for (let index = 0; index < originalManifest.files.length; index++) {
        report(progress, tr("backupservice.checkingBackup"), index + 1, originalManifest.files.length);
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
      catch (cause) { console.warn('[backup] migration failed', cause); throw new BackupError(tr("backupservice.thisBackupCouldNotBeUpgradedToThe")); }
      // Check declared references before normalizing so omissions cannot be hidden by a migration.
      if (originalManifest) await checkManifestReferences(db, originalManifest);
      // A restored timer must never start itself or count time since the
      // backup was made. Keep the saved counters and require explicit resume.
      await db.runAsync("UPDATE focus_sessions SET status = 'unfinished',ended_at = checkpoint_at WHERE status IN ('running','paused')");
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
    return { valid: false, reason: backupErrorMessage(cause, tr("backupservice.thisBackupCouldNotBeOpenedItMay")) };
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
    report(progress, tr("backup.preparingRestore"));
    await pauseReminderSync();
    if ((await FS.getInfoAsync(paths.journal)).exists) throw new BackupError(tr("backupservice.chitsNeedsToRecoverAnEarlierRestoreFirst"));
    await FS.deleteAsync(paths.root, { idempotent: true });
    await FS.makeDirectoryAsync(paths.root, { intermediates: true });
    ownsStaging = true;
    if (await ChitsFiles.hashFileAsync(`${backup.preparedDir}database.sqlite`) !== backup.preparedDatabaseHash) throw new BackupError(tr("backupservice.theCheckedBackupHasChangedChooseTheBackup"));
    await copyFile(`${backup.preparedDir}database.sqlite`, paths.stagedDatabase);
    await FS.makeDirectoryAsync(paths.stagedAttachments, { intermediates: true });
    report(progress, tr("backupservice.restoringAttachments"));
    for (let index = 0; index < backup.manifest.files.length; index++) {
      const file = backup.manifest.files[index];
      if (!file.storagePath.startsWith('chits-attachments/')) throw new BackupError(tr("backupservice.theBackupContainsAnUnsupportedAttachmentPath"));
      const target = `${paths.stagedAttachments}${file.storagePath.slice('chits-attachments/'.length)}`;
      await copyFile(`${backup.extractedDir}${file.archivePath}`, target);
      await verifyFile(target, file);
      report(progress, tr("backupservice.restoringAttachments"), index + 1, backup.manifest.files.length);
    }
    const staged = await openDatabaseAsync('database.sqlite', { useNewConnection: true }, paths.root);
    try { await validateDatabase(staged, LATEST_SCHEMA_VERSION, true); await checkManifestReferences(staged, backup.manifest); await finalizeDatabase(staged); }
    finally { await staged.closeAsync(); }
    report(progress, tr("backup.preparingRestore"));
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
    report(progress, tr("backupservice.restoringData"));
    await removeDatabaseFiles(paths.database);
    await FS.moveAsync({ from: paths.stagedDatabase, to: paths.database });
    await FS.deleteAsync(paths.attachments, { idempotent: true });
    await FS.moveAsync({ from: paths.stagedAttachments, to: paths.attachments });
    report(progress, tr("backupservice.finishingRestore"));
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
      catch (recoveryCause) { throw new RestoreError(backupErrorMessage(recoveryCause, tr("backupservice.yourSafetyCopyHasBeenKeptReopenChits")), true, liveClosed, cause); }
    } else if (ownsStaging) {
      await FS.deleteAsync(paths.root, { idempotent: true }).catch(() => undefined);
    }
    throw new RestoreError(backupErrorMessage(cause, tr("backup.theBackupCouldNotBeRestoredYourPrevious")), false, liveClosed, cause);
  } finally {
    if (!liveClosed) resumeReminderSync();
    end();
  }
}
export async function discardValidatedBackup(backup: ValidatedBackup): Promise<void> {
  if (backup.workDir.startsWith(`${directory(FS.cacheDirectory)}chits-restore-check-`)) await FS.deleteAsync(backup.workDir, { idempotent: true }).catch(() => undefined);
}
