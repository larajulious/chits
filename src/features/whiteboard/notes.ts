import type { SQLiteDatabase } from 'expo-sqlite';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
export type WhiteboardNote = { id: string; kind: 'card' | 'thought'; title: string; hidden: boolean };
export async function whiteboardNotes(db: SQLiteDatabase): Promise<WhiteboardNote[]> {
  const [cards, thoughts] = await Promise.all([createBoardRepository(db).listAllCardSummaries(), createMessageRepository(db).listUnorganizedSummaries()]);
  return [...cards.map(c => ({ id: c.id, kind: 'card' as const, title: c.isHidden ? 'Hidden Chit' : `${c.title || c.preview || 'Untitled note'}${c.mediaCount ? ' · 📎' : ''}${c.subtaskCount ? ' · ☑' : ''}`, hidden: Boolean(c.isHidden) })), ...thoughts.map(m => ({ id: m.id, kind: 'thought' as const, title: m.isHiddenContent ? 'Hidden Chit' : `${m.text || 'Attachment'}${m.mediaCount ? ' · 📎' : ''}`, hidden: Boolean(m.isHiddenContent) }))];
}
