import type { SQLiteDatabase } from 'expo-sqlite';

import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import { buildShareNoteSource, type ShareNoteSource } from '@/services/share-note';

export type ShareNoteTarget = { messageId: string } | { cardId: string };

/**
 * Loads what a Share Note can draw from the thought or card it was opened on.
 * Resolves null when that note no longer exists (deleted or archived meanwhile).
 */
export async function loadShareNoteSource(database: SQLiteDatabase, target: ShareNoteTarget): Promise<ShareNoteSource | null> {
  if ('messageId' in target) {
    const message = await createMessageRepository(database).getActiveById(target.messageId);
    return message ? buildShareNoteSource({ messages: [message] }) : null;
  }
  const boards = createBoardRepository(database);
  const [detail, messages, cardAttachments] = await Promise.all([
    boards.getCardDetail(target.cardId),
    boards.listCardMessages(target.cardId),
    boards.listCardAttachments(target.cardId),
  ]);
  return detail ? buildShareNoteSource({ title: detail.explicitTitle, messages, cardAttachments }) : null;
}

/** The route that opens the Share Note composer for a thought or card. */
export function shareNoteHref(target: ShareNoteTarget) {
  return { pathname: '/share-note', params: target } as const;
}
