import type { SQLiteDatabase } from 'expo-sqlite';
import { createBoardRepository, createMessageRepository } from '../db/repositories';
import type { AttachmentLike } from '../db/types';
import type { NoteKey } from './revisit-engine';

/** Read attachments for the already-validated Focus source, once in canonical order. */
export async function loadFocusAttachments(db: SQLiteDatabase, key: NoteKey): Promise<AttachmentLike[]> {
  // This list already contains linked Chat attachments AND direct card attachments.
  // Adding the linked messages again duplicates every file/video/audio attachment.
  if (key.startsWith('card:')) return createBoardRepository(db).listCardAttachmentItems(key.slice(5));
  const message = await createMessageRepository(db).getActiveById(key.slice(8));
  if (!message || message.isHiddenContent) return [];
  // Chat photos are already inline in Focus's note editor.
  return message.attachments.filter(attachment => attachment.type !== 'photo');
}
