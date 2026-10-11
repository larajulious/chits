import type { createMessageRepository, NoteContentInput } from '@/db/repositories';
import type { Attachment, Message } from '@/db/types';
import { draftFromNote, noteBlocksText, parseNoteContent } from '@/services/note-content';
import type { SQLiteDatabase } from 'expo-sqlite';

type ComposerRepository = Pick<ReturnType<typeof createMessageRepository>, 'createText' | 'createAttachmentMessage' | 'updateText' | 'createNote' | 'updateContent' | 'getActiveById'>;

// Both fullscreen actions use this path. The returned message becomes the
// editing target after Save as draft, so the next save cannot create a duplicate.
// `blocks` is the composer's content when it holds images pasted from the
// clipboard: words and images in the order they were written (pasted images
// already staged in Chits storage). Without it, `text` alone is the thought.
export async function saveChatComposer(repository: ComposerRepository, { text, editing, attachment, blocks = null }: {
  text: string;
  editing: Message | null;
  attachment: Omit<Attachment, 'id' | 'messageId' | 'createdAt'> | null;
  blocks?: NoteContentInput | null;
}): Promise<Message | null> {
  const words = blocks ? noteBlocksText(blocks) : text.trim();
  const images = blocks?.filter((block) => block.type === 'image') ?? [];
  if (!words && !attachment && !images.length && !editing?.attachments.length) return null;
  if (images.length || editing?.content) {
    // Never empty a thought by clearing it: keep it unless something would remain.
    if (editing && !words && !images.length && !editing.attachments.some((item) => item.type !== 'photo')) return null;
    // Photos the composer doesn't show stay where they are, ahead of its content:
    // an older photo-and-caption thought's photo, or every image of an inline
    // thought saved without its blocks.
    const kept = editing && (!editing.content || !blocks) ? draftFromNote(editing).filter((block) => block.type === 'image') : [];
    const content: NoteContentInput = [...kept, ...(blocks ?? [{ type: 'text', text: words }])];
    if (editing) {
      await repository.updateContent(editing.id, content);
      return repository.getActiveById(editing.id);
    }
    return repository.getActiveById(await repository.createNote({ blocks: content, attachment }));
  }
  if (editing) {
    const updatedAt = await repository.updateText(editing.id, words);
    return { ...editing, text: words, updatedAt };
  }
  if (attachment) return repository.createAttachmentMessage(attachment, words || null);
  return repository.createText(words);
}

// `content`: the draft's order of words and saved images, when it's editing a
// thought that has them (images pasted but not yet sent aren't kept across restarts).
export async function writeChatDraft(database: Pick<SQLiteDatabase, 'runAsync'>, text: string, messageId: string | null, content: string | null = null) {
  const now = Date.now();
  // One statement keeps the text, editing target and content together across restarts.
  await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_draft_text', text, now, 'chat_draft_message_id', messageId ?? '', now, 'chat_draft_content', messageId ? content ?? '' : '', now);
}

export async function readChatDraft(database: Pick<SQLiteDatabase, 'getAllAsync'>, repository: Pick<ReturnType<typeof createMessageRepository>, 'getActiveById'>) {
  const rows = await database.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)', 'chat_draft_text', 'chat_draft_message_id', 'chat_draft_content');
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const id = values.get('chat_draft_message_id');
  const message = id ? await repository.getActiveById(id) : null;
  // Hidden contents still require the existing reveal action.
  if (message?.isHiddenContent) return { text: '', editing: null };
  const content = message ? parseNoteContent(values.get('chat_draft_content')) : null;
  return { text: values.get('chat_draft_text') ?? '', editing: message, ...(content ? { content } : {}) };
}
