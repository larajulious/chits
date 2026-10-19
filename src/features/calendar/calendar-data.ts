import { tr } from '@/localization/runtime';
import type { SQLiteDatabase } from 'expo-sqlite';

import { SPACES, type SpaceId } from '@/constants/spaces';
import {
  addLocalDays, dayMinuteToDate, localDayKey, normalizeSchedule, parseDayKey,
  type CalendarSchedule, type ScheduledReminderRow,
} from './calendar-schedule';

export { addLocalDays, localDayKey, startOfLocalDay } from './calendar-schedule';

export type CalendarNoteKind = 'card' | 'message';
export type CalendarNoteRef = { kind: CalendarNoteKind; id: string };
/**
 * How an entry is drawn: a note planned on the calendar, a Board card, a Chat
 * note that only has a reminder, or a note stuck on a Space.
 */
export type CalendarItemType = 'note' | 'card' | 'reminder' | 'space';

export type CalendarItem = {
  /**
   * `${kind}:${id}`, plus `:reminder` for the second showing of a planned
   * note whose reminder falls on another day (see `occurrence`).
   */
  key: string;
  id: string;
  kind: CalendarNoteKind;
  type: CalendarItemType;
  /** The local day it's shown on. */
  dateKey: string;
  /** When it sits in the day: its start, local midnight for all day, or its reminder. */
  scheduledAt: number;
  /** True when the note is planned on the calendar (calendar_entries), not just reminded. */
  scheduled: boolean;
  /**
   * 'plan': the note on its planned day (or a reminder-only note on its
   * reminder's day). 'reminder': a planned note shown again on the different
   * day its reminder goes off, at the reminder's time.
   */
  occurrence: 'plan' | 'reminder';
  /** The note's own planned day and time (the same for both occurrences); null when it only has a reminder. */
  plan: CalendarSchedule | null;
  allDay: boolean;
  startMinute: number | null;
  endMinute: number | null;
  /** Its pending reminder (including an overdue one), or null. */
  reminderAt: number | null;
  /** Minutes before the start its reminder was set; null for a custom time or none. */
  reminderOffset: number | null;
  /** What lists show: the card's own title, else the note's first line. */
  title: string;
  /** True only for a card with a title of its own (not one borrowed from its words). */
  hasTitle: boolean;
  source: string;
  spaceId: SpaceId | null;
  boardName: string | null;
  /** That board's accent color (tints the note's paper, as in Card Details); null for none. */
  boardAccent: string | null;
  /** The card this note is (or, for a Chat note, was organized into); null for an unorganized thought. */
  cardId: string | null;
  attachmentCount: number;
  searchText: string;
};

export type CalendarRange = { from: string; to: string };

type Row = {
  id: string; title: string | null; preview: string | null; hidden: number; attachmentCount: number;
  boardName: string | null; boardAccent: string | null; spaceId: string | null; searchText: string | null; cardId: string | null;
  dateKey: string | null; startMinute: number | null; endMinute: number | null; reminderOffset: number | null; reminderAt: number | null;
};

function spaceName(id: string | null): string | null {
  return id && id in SPACES ? SPACES[id as SpaceId].name : null;
}

/**
 * A note's items: one on its day — and, when it's planned on one day but
 * reminded on another, a reminder item on that other day too, so the
 * reminder is never invisible. Same day: a single item with the bell.
 */
function rowToItems(row: Row, kind: CalendarNoteKind): CalendarItem[] {
  const item = rowToItem(row, kind);
  if (!item) return [];
  if (!item.scheduled || item.reminderAt === null) return [item];
  const reminderDay = localDayKey(item.reminderAt);
  if (reminderDay === item.dateKey) return [item];
  return [item, {
    ...item,
    key: `${item.key}:reminder`,
    type: item.spaceId ? 'space' : 'reminder',
    occurrence: 'reminder',
    dateKey: reminderDay,
    scheduledAt: item.reminderAt,
    allDay: false,
    startMinute: null,
    endMinute: null,
  }];
}

function rowToItem(row: Row, kind: CalendarNoteKind): CalendarItem | null {
  const space = spaceName(row.spaceId);
  const scheduled = row.dateKey !== null;
  // Planned notes sit on their own day; reminder-only notes on the reminder's local day.
  const dateKey = row.dateKey ?? (row.reminderAt !== null ? localDayKey(row.reminderAt) : null);
  if (!dateKey || !parseDayKey(dateKey)) return null;
  const allDay = scheduled && row.startMinute === null;
  const scheduledAt = scheduled ? dayMinuteToDate(dateKey, row.startMinute ?? 0).getTime() : row.reminderAt!;
  return {
    key: `${kind}:${row.id}`,
    id: row.id,
    kind,
    type: space ? 'space' : kind === 'card' ? 'card' : scheduled ? 'note' : 'reminder',
    dateKey,
    scheduledAt,
    scheduled,
    occurrence: 'plan',
    plan: scheduled ? { dateKey, startMinute: row.startMinute, endMinute: row.endMinute } : null,
    allDay,
    startMinute: scheduled ? row.startMinute : null,
    endMinute: scheduled ? row.endMinute : null,
    reminderAt: row.reminderAt,
    reminderOffset: row.reminderAt !== null ? row.reminderOffset : null,
    get title() { return row.hidden ? tr("entrydetailsheet.hiddenNote") : row.title?.trim() || row.preview?.trim().split(/\r?\n/)[0] || (row.attachmentCount ? tr("calendardata.attachmentNote") : tr("calendardata.untitledNote")); },
    hasTitle: !row.hidden && Boolean(row.title?.trim()),
    get source() { return space ? `${tr("spaces.space")} · ${spaceName(row.spaceId)}` : kind === 'card' ? `${tr("id.board")} · ${row.boardName ?? tr("id.board")}` : tr("calendarnotepicker.chat"); },
    spaceId: space ? row.spaceId as SpaceId : null,
    boardName: row.boardName,
    boardAccent: row.boardAccent,
    cardId: row.cardId,
    attachmentCount: row.attachmentCount,
    searchText: row.hidden ? '' : row.searchText ?? '',
  };
}

const CARD_COLUMNS = `
  c.id AS id, c.id AS cardId, c.title AS title, b.name AS boardName, b.accent AS boardAccent,
  (SELECT m.text FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.deleted_at IS NULL ORDER BY cm.position LIMIT 1) AS preview,
  (SELECT GROUP_CONCAT(m.text, ' ') FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.deleted_at IS NULL) AS searchText,
  EXISTS (SELECT 1 FROM card_messages cm JOIN messages m ON m.id = cm.message_id WHERE cm.card_id = c.id AND m.is_hidden_content = 1) AS hidden,
  (SELECT COUNT(*) FROM card_attachments ca WHERE ca.card_id = c.id AND ca.deleted_at IS NULL) +
  (SELECT COUNT(*) FROM card_messages cm JOIN attachments a ON a.message_id = cm.message_id WHERE cm.card_id = c.id) AS attachmentCount,
  (SELECT sp.space_id FROM space_placements sp WHERE sp.card_id = c.id LIMIT 1) AS spaceId`;
const MESSAGE_COLUMNS = `
  m.id AS id, NULL AS title, m.text AS preview, m.text AS searchText, m.is_hidden_content AS hidden, NULL AS boardName,
  (SELECT oc.id FROM card_messages ocm JOIN cards oc ON oc.id = ocm.card_id JOIN boards ob ON ob.id = oc.board_id WHERE ocm.message_id = m.id AND oc.archived_at IS NULL AND ob.archived_at IS NULL ORDER BY ocm.position LIMIT 1) AS cardId,
  (SELECT ob.accent FROM card_messages ocm JOIN cards oc ON oc.id = ocm.card_id JOIN boards ob ON ob.id = oc.board_id WHERE ocm.message_id = m.id AND oc.archived_at IS NULL AND ob.archived_at IS NULL ORDER BY ocm.position LIMIT 1) AS boardAccent,
  (SELECT COUNT(*) FROM attachments a WHERE a.message_id = m.id) AS attachmentCount,
  (SELECT sp.space_id FROM space_placements sp WHERE sp.message_id = m.id LIMIT 1) AS spaceId`;
const ENTRY_COLUMNS = 'e.date_key AS dateKey, e.start_minute AS startMinute, e.end_minute AS endMinute, e.reminder_offset AS reminderOffset, r.scheduled_at AS reminderAt';
const REMINDER_ONLY_COLUMNS = 'NULL AS dateKey, NULL AS startMinute, NULL AS endMinute, NULL AS reminderOffset, r.scheduled_at AS reminderAt';
const CARD_ACTIVE = 'c.archived_at IS NULL AND b.archived_at IS NULL';
const MESSAGE_ACTIVE = 'm.deleted_at IS NULL AND m.archived_at IS NULL';

/**
 * The calendar's read model: every note planned on a day (calendar_entries),
 * plus every note that only has a pending reminder, on the reminder's day —
 * each note once. Reminders are the same rows notifications are scheduled
 * from. Without a range it reads everything (search); with one, only the
 * days in it (both bounds inclusive), using the date/schedule indexes.
 */
export async function getCalendarItems(database: SQLiteDatabase, range?: CalendarRange | null): Promise<CalendarItem[]> {
  const reminderRange = range ? ' AND r.scheduled_at >= ? AND r.scheduled_at < ?' : '';
  const reminderArgs = range ? rangeBounds(range) : [];
  // A planned note counts when its day — or its reminder — is in range.
  const entryRange = range ? ' AND (e.date_key BETWEEN ? AND ? OR (r.scheduled_at >= ? AND r.scheduled_at < ?))' : '';
  const entryArgs = range ? [range.from, range.to, ...reminderArgs] : [];
  const [cardEntries, messageEntries, cardReminders, messageReminders] = await Promise.all([
    database.getAllAsync<Row>(`SELECT ${CARD_COLUMNS}, ${ENTRY_COLUMNS}
      FROM calendar_entries e JOIN cards c ON c.id = e.card_id JOIN boards b ON b.id = c.board_id
      LEFT JOIN card_reminders r ON r.card_id = c.id AND r.completed_at IS NULL
      WHERE ${CARD_ACTIVE}${entryRange}`, ...entryArgs),
    database.getAllAsync<Row>(`SELECT ${MESSAGE_COLUMNS}, ${ENTRY_COLUMNS}
      FROM calendar_entries e JOIN messages m ON m.id = e.message_id
      LEFT JOIN message_reminders r ON r.message_id = m.id AND r.completed_at IS NULL
      WHERE ${MESSAGE_ACTIVE}${entryRange}`, ...entryArgs),
    database.getAllAsync<Row>(`SELECT ${CARD_COLUMNS}, ${REMINDER_ONLY_COLUMNS}
      FROM card_reminders r JOIN cards c ON c.id = r.card_id JOIN boards b ON b.id = c.board_id
      WHERE r.completed_at IS NULL AND ${CARD_ACTIVE}${reminderRange}
        AND NOT EXISTS (SELECT 1 FROM calendar_entries e WHERE e.card_id = c.id)`, ...reminderArgs),
    database.getAllAsync<Row>(`SELECT ${MESSAGE_COLUMNS}, ${REMINDER_ONLY_COLUMNS}
      FROM message_reminders r JOIN messages m ON m.id = r.message_id
      WHERE r.completed_at IS NULL AND ${MESSAGE_ACTIVE}${reminderRange}
        AND NOT EXISTS (SELECT 1 FROM calendar_entries e WHERE e.message_id = m.id)`, ...reminderArgs),
  ]);
  const items: CalendarItem[] = [];
  for (const row of [...cardEntries, ...cardReminders]) items.push(...rowToItems(row, 'card'));
  for (const row of [...messageEntries, ...messageReminders]) items.push(...rowToItems(row, 'message'));
  // A note found by its reminder can bring its plan from outside the range (and vice versa): keep only days asked for.
  return sortCalendarItems(range ? items.filter((item) => item.dateKey >= range.from && item.dateKey <= range.to) : items);
}

/** Day order: all-day notes first, then by time; ties by kind and id so the order never shuffles. */
export function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  return items.sort((a, b) => a.dateKey.localeCompare(b.dateKey)
    || Number(b.allDay) - Number(a.allDay)
    || a.scheduledAt - b.scheduledAt
    || a.key.localeCompare(b.key));
}

/** Instants covering a range of local days: [start of `from`, start of the day after `to`). */
function rangeBounds(range: CalendarRange): [number, number] {
  const from = parseDayKey(range.from);
  const to = parseDayKey(range.to);
  if (!from || !to) throw new Error(tr("calendardata.invalidCalendarRange"));
  return [from.getTime(), addLocalDays(to, 1).getTime()];
}

/** Groups items by their day key, keeping each day's order. */
export function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const days = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = days.get(item.dateKey);
    if (list) list.push(item); else days.set(item.dateKey, [item]);
  }
  return days;
}

export function getRemindersForDate(items: CalendarItem[], date: Date): CalendarItem[] {
  const key = localDayKey(date);
  return items.filter((item) => item.dateKey === key);
}

export function getRemindersForRange(items: CalendarItem[], start: Date, end: Date): CalendarItem[] {
  return items.filter((item) => item.scheduledAt >= start.getTime() && item.scheduledAt < end.getTime());
}

/** Items whose pending reminder has already gone off. */
export function getOverdueReminders(items: CalendarItem[], now = Date.now()): CalendarItem[] {
  return items.filter((item) => item.reminderAt !== null && item.reminderAt < now);
}

/** Case-insensitive match on the title, words, source and board. */
export function matchesCalendarSearch(item: CalendarItem, query: string): boolean {
  const words = query.trim().toLocaleLowerCase();
  return !words || `${item.title} ${item.searchText} ${item.source} ${item.boardName ?? ''}`.toLocaleLowerCase().includes(words);
}

// ---------------------------------------------------------------------------
// Calendar entries (writes). Reminders themselves are set through
// services/reminders, which owns notification scheduling.

type Listener = () => void;
let listeners: Listener[] = [];
/** Screens showing calendar entries reload when one is added, moved or removed. */
export function subscribeToCalendarChanges(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((entry) => entry !== listener); };
}
function emitCalendarChange() { for (const listener of listeners) listener(); }

const noteColumn = (kind: CalendarNoteKind) => (kind === 'card' ? 'card_id' : 'message_id');
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type CalendarEntry = CalendarSchedule & { reminderOffset: number | null };

export async function getCalendarEntry(database: SQLiteDatabase, note: CalendarNoteRef): Promise<CalendarEntry | null> {
  return database.getFirstAsync<CalendarEntry>(`SELECT date_key AS dateKey, start_minute AS startMinute, end_minute AS endMinute, reminder_offset AS reminderOffset FROM calendar_entries WHERE ${noteColumn(note.kind)} = ?`, note.id);
}

/** Plans a note on a day (or moves it); one entry per note, so repeating this never duplicates. */
export async function saveCalendarEntry(database: SQLiteDatabase, note: CalendarNoteRef, schedule: CalendarSchedule, reminderOffset: number | null): Promise<void> {
  const value = normalizeSchedule(schedule);
  if (reminderOffset !== null && (!Number.isInteger(reminderOffset) || reminderOffset < 0)) throw new Error(tr("calendardata.invalidReminderOffset"));
  const now = Date.now();
  const column = noteColumn(note.kind);
  await database.runAsync(
    `INSERT INTO calendar_entries (id, ${column}, date_key, start_minute, end_minute, reminder_offset, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(${column}) WHERE ${column} IS NOT NULL DO UPDATE SET date_key = excluded.date_key, start_minute = excluded.start_minute, end_minute = excluded.end_minute, reminder_offset = excluded.reminder_offset, updated_at = excluded.updated_at`,
    newId(), note.id, value.dateKey, value.startMinute, value.endMinute, reminderOffset, now, now,
  );
  emitCalendarChange();
}

export async function setCalendarReminderOffset(database: SQLiteDatabase, note: CalendarNoteRef, reminderOffset: number | null): Promise<void> {
  await database.runAsync(`UPDATE calendar_entries SET reminder_offset = ?, updated_at = ? WHERE ${noteColumn(note.kind)} = ?`, reminderOffset, Date.now(), note.id);
}

/** Takes a note off the calendar; the note itself (and any reminder) stays. */
export async function removeCalendarEntry(database: SQLiteDatabase, note: CalendarNoteRef): Promise<void> {
  const result = await database.runAsync(`DELETE FROM calendar_entries WHERE ${noteColumn(note.kind)} = ?`, note.id);
  if (result.changes) emitCalendarChange();
}

/** Pending, relative reminders on calendar entries, for keeping them on local wall-clock time. */
export async function listScheduledReminders(database: SQLiteDatabase): Promise<ScheduledReminderRow[]> {
  type EntryReminder = { kind: CalendarNoteKind; id: string; dateKey: string; startMinute: number | null; endMinute: number | null; offset: number; reminderAt: number };
  const rows = await database.getAllAsync<EntryReminder>(`
    SELECT 'card' AS kind, e.card_id AS id, e.date_key AS dateKey, e.start_minute AS startMinute, e.end_minute AS endMinute, e.reminder_offset AS offset, r.scheduled_at AS reminderAt
      FROM calendar_entries e JOIN card_reminders r ON r.card_id = e.card_id AND r.completed_at IS NULL
      WHERE e.reminder_offset IS NOT NULL
    UNION ALL
    SELECT 'message' AS kind, e.message_id AS id, e.date_key AS dateKey, e.start_minute AS startMinute, e.end_minute AS endMinute, e.reminder_offset AS offset, r.scheduled_at AS reminderAt
      FROM calendar_entries e JOIN message_reminders r ON r.message_id = e.message_id AND r.completed_at IS NULL
      WHERE e.reminder_offset IS NOT NULL`);
  return rows.map((row) => ({ kind: row.kind, id: row.id, offset: row.offset, reminderAt: row.reminderAt, schedule: { dateKey: row.dateKey, startMinute: row.startMinute, endMinute: row.endMinute } }));
}

/**
 * Moves reminder instants (see planScheduleReminderUpdates). Clearing
 * notification_id makes the reminder sync schedule a fresh notification and
 * cancel the old one, so the device never keeps both.
 */
export async function moveReminderTimes(database: SQLiteDatabase, updates: { kind: CalendarNoteKind; id: string; scheduledAt: number }[]): Promise<void> {
  if (!updates.length) return;
  const now = Date.now();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const update of updates) {
      const table = update.kind === 'card' ? 'card_reminders' : 'message_reminders';
      await transaction.runAsync(`UPDATE ${table} SET scheduled_at = ?, notification_id = NULL, updated_at = ? WHERE ${noteColumn(update.kind)} = ? AND completed_at IS NULL`, update.scheduledAt, now, update.id);
    }
  });
}
