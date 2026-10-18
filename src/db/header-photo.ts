import { normalizeStoredAttachmentPath } from '../services/attachment-path';
import type { SQLiteDatabase } from 'expo-sqlite';
import { HEADER_PHOTO_KEY, parseHeaderPhoto, type HeaderPhoto } from '../services/header-photo';

export async function writeHeaderPhoto(database: SQLiteDatabase, next: HeaderPhoto | null) {
  const normalized = next ? parseHeaderPhoto(JSON.stringify(next)) : null;
  if (next && !normalized) throw new Error('This header photo could not be saved.');
  let previous: HeaderPhoto | null = null;
  await database.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', HEADER_PHOTO_KEY);
    previous = parseHeaderPhoto(row?.value);
    if (normalized) await tx.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', HEADER_PHOTO_KEY, JSON.stringify(normalized), Date.now());
    else await tx.runAsync('DELETE FROM app_settings WHERE key = ?', HEADER_PHOTO_KEY);
  });
  return previous as HeaderPhoto | null;
}

/** Only dedicated header copies may be removed, and only after clearing references. */
export async function headerPhotoCanDelete(database: SQLiteDatabase, path: string) {
  if (!path.startsWith('chits-attachments/headers/') || !parseHeaderPhoto(JSON.stringify({ storagePath: path, width: 1, height: 1 }))) return false;
  const legacySuffix = `%/${path}`;
  const row = await database.getFirstAsync<{ count: number }>('SELECT (SELECT COUNT(*) FROM attachments WHERE storage_path = ? OR storage_path LIKE ?) + (SELECT COUNT(*) FROM card_attachments WHERE storage_path = ? OR storage_path LIKE ?) AS count', path, legacySuffix, path, legacySuffix);
  if (row?.count) return false;
  const settings = await database.getAllAsync<{ value: string }>('SELECT value FROM app_settings');
  return !settings.some(({ value }) => { try { return normalizeStoredAttachmentPath(JSON.parse(value)?.storagePath) === path; } catch { return false; } });
}
