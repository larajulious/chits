import type { SQLiteDatabase } from 'expo-sqlite';
import { backgroundDim, CHAT_BACKGROUND_KEY, notifyChatBackgroundChanged, parseChatBackground, type ChatBackground } from '../services/chat-background';

type BackgroundDatabase = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

export async function readChatBackground(database: BackgroundDatabase) {
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', CHAT_BACKGROUND_KEY);
  return parseChatBackground(row?.value);
}

export async function writeChatBackground(database: SQLiteDatabase, next: ChatBackground) {
  const normalized = parseChatBackground(JSON.stringify({ ...next, dim: backgroundDim(next.dim) }));
  if (!normalized) throw new Error('This background could not be saved.');
  let previous: ChatBackground | null = null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    previous = await readChatBackground(transaction);
    if (normalized.source === 'attachment') {
      const photo = await transaction.getFirstAsync<{ storagePath: string }>(`SELECT storage_path AS storagePath FROM attachments WHERE id = ? AND type = 'photo'
        UNION ALL SELECT storage_path AS storagePath FROM card_attachments WHERE id = ? AND type = 'photo' AND deleted_at IS NULL`, normalized.attachmentId, normalized.attachmentId);
      if (photo?.storagePath !== normalized.storagePath) throw new Error('This photo is no longer available.');
    }
    if (JSON.stringify(previous) === JSON.stringify(normalized)) return;
    await transaction.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', CHAT_BACKGROUND_KEY, JSON.stringify(normalized), Date.now());
  });
  notifyChatBackgroundChanged();
  return previous as ChatBackground | null;
}

export async function removeChatBackground(database: SQLiteDatabase) {
  let previous: ChatBackground | null = null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    previous = await readChatBackground(transaction);
    await transaction.runAsync('DELETE FROM app_settings WHERE key = ?', CHAT_BACKGROUND_KEY);
  });
  notifyChatBackgroundChanged();
  return previous as ChatBackground | null;
}

// Called inside the same transaction as deletion, before any physical file is removed.
export async function clearChatBackgroundForPaths(database: BackgroundDatabase, paths: string[]) {
  if (!paths.length) return;
  const current = await readChatBackground(database);
  if (current && paths.includes(current.storagePath)) await database.runAsync('DELETE FROM app_settings WHERE key = ?', CHAT_BACKGROUND_KEY);
}

export async function unreferencedAttachmentPaths(database: Pick<SQLiteDatabase, 'getFirstAsync'>, paths: string[]) {
  const removable: string[] = [];
  for (const path of new Set(paths)) {
    const references = await database.getFirstAsync<{ count: number }>(`SELECT (SELECT COUNT(*) FROM attachments WHERE storage_path = ?) + (SELECT COUNT(*) FROM card_attachments WHERE storage_path = ?) AS count`, path, path);
    if (!references?.count) removable.push(path);
  }
  return removable;
}
