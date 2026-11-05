import type { Message } from '@/db/types';

type CardMessages = { listCardMessages(cardId: string): Promise<Pick<Message, 'id' | 'isHiddenContent' | 'deletedAt' | 'archivedAt'>[]> };
type RouteExtras = { fromWidget?: string };

export const cardDetailsRoute = (cardId: string, extras: RouteExtras = {}) => ({ pathname: '/card/[id]' as const, params: { id: cardId, ...extras } });

/**
 * Where a card opens from anywhere except a board column, which always goes
 * straight to Card Details. The note itself opens in the editor. Details stays
 * the fallback for what the editor can't show: it edits one note at a time, and
 * hidden content has to go through the reveal flow.
 */
export async function cardNoteRoute(boards: CardMessages, cardId: string, extras: RouteExtras = {}) {
  const messages = (await boards.listCardMessages(cardId)).filter((message) => !message.deletedAt && !message.archivedAt);
  if (messages.length !== 1 || messages[0].isHiddenContent) return cardDetailsRoute(cardId, extras);
  return { pathname: '/card/edit-content' as const, params: { messageId: messages[0].id, autoFocus: '0', ...extras } };
}
