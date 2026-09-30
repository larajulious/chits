import type { SQLiteDatabase } from 'expo-sqlite';

import { SPACES, type SpaceId } from '@/constants/spaces';

export type CalendarItem = {
  id: string;
  kind: 'card' | 'message';
  scheduledAt: number;
  title: string;
  source: string;
  spaceId: SpaceId | null;
  boardName: string | null;
  attachmentCount: number;
  searchText: string;
};

type Row = {
  id: string; scheduledAt: number; title: string | null; preview: string | null;
  hidden: number; attachmentCount: number; boardName: string | null; spaceId: string | null; searchText: string | null;
};

function spaceName(id: string | null): string | null {
  return id && id in SPACES ? SPACES[id as SpaceId].name : null;
}

function rowToItem(row: Row, kind: CalendarItem['kind']): CalendarItem {
  const space = spaceName(row.spaceId);
  return {
    id: row.id,
    kind,
    scheduledAt: row.scheduledAt,
    title: row.hidden ? 'Hidden note' : row.title?.trim() || row.preview?.trim().split(/\r?\n/)[0] || (row.attachmentCount ? 'Attachment note' : 'Untitled note'),
    source: space ? `Space · ${space}` : kind === 'card' ? `Board · ${row.boardName ?? 'Board'}` : 'Chat',
    spaceId: space ? row.spaceId as SpaceId : null,
    boardName: row.boardName,
    attachmentCount: row.attachmentCount,
    searchText: row.hidden ? '' : row.searchText ?? '',
  };
}

/** Calendar is a read model of the same reminder rows used by notifications. */
export async function getCalendarItems(database: SQLiteDatabase): Promise<CalendarItem[]> {
  const [cards, messages] = await Promise.all([
    database.getAllAsync<Row>(`
      SELECT r.card_id AS id, r.scheduled_at AS scheduledAt, c.title AS title, b.name AS boardName,
        (SELECT m.text FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.deleted_at IS NULL ORDER BY cm.position LIMIT 1) AS preview,
        (SELECT GROUP_CONCAT(m.text, ' ') FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.deleted_at IS NULL) AS searchText,
        EXISTS (SELECT 1 FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.is_hidden_content = 1) AS hidden,
        (SELECT COUNT(*) FROM card_attachments ca WHERE ca.card_id = c.id AND ca.deleted_at IS NULL) +
        (SELECT COUNT(*) FROM card_messages cm JOIN attachments a ON a.message_id = cm.message_id WHERE cm.card_id = c.id) AS attachmentCount,
        (SELECT sp.space_id FROM space_placements sp WHERE sp.card_id = c.id LIMIT 1) AS spaceId
      FROM card_reminders r JOIN cards c ON c.id = r.card_id JOIN boards b ON b.id = c.board_id
      WHERE r.completed_at IS NULL AND c.archived_at IS NULL AND b.archived_at IS NULL`),
    database.getAllAsync<Row>(`
      SELECT r.message_id AS id, r.scheduled_at AS scheduledAt, NULL AS title,
        m.text AS preview, m.text AS searchText, m.is_hidden_content AS hidden, NULL AS boardName,
        (SELECT COUNT(*) FROM attachments a WHERE a.message_id = m.id) AS attachmentCount,
        (SELECT sp.space_id FROM space_placements sp WHERE sp.message_id = m.id LIMIT 1) AS spaceId
      FROM message_reminders r JOIN messages m ON m.id = r.message_id
      WHERE r.completed_at IS NULL AND m.deleted_at IS NULL AND m.archived_at IS NULL`),
  ]);
  return [...cards.map((row) => rowToItem(row, 'card')), ...messages.map((row) => rowToItem(row, 'message'))]
    .sort((a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id));
}

export function localDayKey(value: number | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function getRemindersForDate(items: CalendarItem[], date: Date): CalendarItem[] {
  const key = localDayKey(date);
  return items.filter((item) => localDayKey(item.scheduledAt) === key);
}

export function getRemindersForRange(items: CalendarItem[], start: Date, end: Date): CalendarItem[] {
  return items.filter((item) => item.scheduledAt >= start.getTime() && item.scheduledAt < end.getTime());
}

export function getOverdueReminders(items: CalendarItem[], now = Date.now()): CalendarItem[] {
  return items.filter((item) => item.scheduledAt < now);
}
