import type { createMessageRepository } from '@/db/repositories';
import type { Attachment, Message } from '@/db/types';
import type { SQLiteDatabase } from 'expo-sqlite';

type ComposerRepository = Pick<ReturnType<typeof createMessageRepository>, 'createText' | 'createAttachmentMessage' | 'updateText'>;

// Both fullscreen actions use this path. The returned message becomes the
// editing target after Save as draft, so the next save cannot create a duplicate.
export async function saveChatComposer(repository: ComposerRepository, { text, editing, attachment }: {
  text: string;
  editing: Message | null;
  attachment: Omit<Attachment, 'id' | 'messageId' | 'createdAt'> | null;
}): Promise<Message | null> {
  const trimmed = text.trim();
  if (!trimmed && !attachment && !editing?.attachments.length) return null;
  if (editing) {
    const updatedAt = await repository.updateText(editing.id, trimmed);
    return { ...editing, text: trimmed, updatedAt };
  }
  if (attachment) return repository.createAttachmentMessage(attachment, trimmed || null);
  return repository.createText(trimmed);
}

export async function writeChatDraft(database: Pick<SQLiteDatabase, 'runAsync'>, text: string, messageId: string | null) {
  const now = Date.now();
  // One statement keeps the text and editing target together across restarts.
  await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_draft_text', text, now, 'chat_draft_message_id', messageId ?? '', now);
}

export async function readChatDraft(database: Pick<SQLiteDatabase, 'getAllAsync'>, repository: Pick<ReturnType<typeof createMessageRepository>, 'getActiveById'>) {
  const rows = await database.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key IN (?, ?)', 'chat_draft_text', 'chat_draft_message_id');
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const id = values.get('chat_draft_message_id');
  const message = id ? await repository.getActiveById(id) : null;
  // Hidden contents still require the existing reveal action.
  if (message?.isHiddenContent) return { text: '', editing: null };
  return { text: values.get('chat_draft_text') ?? '', editing: message };
}
