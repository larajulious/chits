import type { SQLiteDatabase } from 'expo-sqlite';

import { SPACE_IDS } from '@/constants/spaces';
import { createSpaceRepository } from '@/db/repositories';
import type { StickyWidgetRow } from './snapshot';

type ThoughtRow = { noteId: string; text: string | null; content: string | null };

/**
 * Every live note on every Space, back to front as the board stacks them, with the words of
 * each of its live thoughts. The stickies themselves come from the Space
 * repository, so the widget can never disagree with the board about which
 * notes are up, their paper, color, tilt, or whether they're hidden.
 */
export async function loadStickyWidgetRows(database: SQLiteDatabase): Promise<StickyWidgetRow[]> {
  const spaces = createSpaceRepository(database);
  const placed = (await Promise.all(SPACE_IDS.map((spaceId) => spaces.list(spaceId)))).flat();
  const visible = placed.filter((note) => !note.hidden && !note.media);
  const cards = visible.filter((note) => note.kind === 'card').map((note) => note.noteId);
  const thoughts = visible.filter((note) => note.kind === 'thought').map((note) => note.noteId);
  const marks = (ids: string[]) => ids.map(() => '?').join(', ');
  const [cardRows, thoughtRows] = await Promise.all([
    cards.length ? database.getAllAsync<ThoughtRow>(`
      SELECT cm.card_id AS noteId, m.text, m.content_json AS content
      FROM card_messages cm INNER JOIN messages m ON m.id = cm.message_id
      WHERE cm.card_id IN (${marks(cards)}) AND m.deleted_at IS NULL AND m.archived_at IS NULL
      ORDER BY cm.card_id, cm.position ASC`, ...cards) : Promise.resolve([]),
    thoughts.length ? database.getAllAsync<ThoughtRow>(`SELECT id AS noteId, text, content_json AS content FROM messages WHERE id IN (${marks(thoughts)})`, ...thoughts) : Promise.resolve([]),
  ]);
  const words = new Map<string, ThoughtRow[]>();
  for (const row of [...cardRows.map((row) => ({ ...row, noteId: `card:${row.noteId}` })), ...thoughtRows.map((row) => ({ ...row, noteId: `thought:${row.noteId}` }))]) {
    words.set(row.noteId, [...(words.get(row.noteId) ?? []), row]);
  }
  return placed.map((note) => ({
    ...note,
    // A thought sent with only an attachment has no words; the board's stand-in ("Photo", a file name) is in `text`.
    thoughts: note.hidden || note.media ? [] : (words.get(`${note.kind}:${note.noteId}`) ?? []).filter((row) => row.text?.trim() || row.content),
  }));
}
