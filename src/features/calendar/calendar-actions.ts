import type { SQLiteDatabase } from 'expo-sqlite';

import type { NoteSubmission } from '@/components/boards/add-note-sheet';
import type { SpaceId } from '@/constants/spaces';
import { createBoardRepository, createMessageRepository, createSpaceRepository } from '@/db/repositories';
import { removeCardReminder, removeMessageReminder, setCardReminder, setMessageReminder, type SetReminderResult } from '@/services/reminders';
import { isValidReminderTime } from '@/services/reminder-time';

import { saveCalendarEntry, setCalendarReminderOffset, type CalendarNoteRef } from './calendar-data';
import { normalizeSchedule, reminderTimeForOffset, type CalendarSchedule } from './calendar-schedule';

/** A reminder relative to the schedule ("15 min before"), at a custom time, or none. */
export type ReminderChoice = { mode: 'none' } | { mode: 'offset'; offset: number } | { mode: 'custom'; at: number };
export type ScheduleDraft = CalendarSchedule & { reminder: ReminderChoice };
export type CalendarDestination = { type: 'chat' } | { type: 'board'; boardId: string; columnId: string; label: string } | { type: 'space'; spaceId: SpaceId; label: string };

/** The instant a draft's reminder would go off, or null for none. */
export function reminderInstant(draft: ScheduleDraft): number | null {
  if (draft.reminder.mode === 'none') return null;
  if (draft.reminder.mode === 'custom') return draft.reminder.at;
  return reminderTimeForOffset(draft, draft.reminder.offset);
}

/** True when the draft asks for a reminder that's already in the past (it can't be saved). */
export function reminderInPast(draft: ScheduleDraft, now = new Date()): boolean {
  const at = reminderInstant(draft);
  return at !== null && !isValidReminderTime(new Date(at), now);
}

export type ReminderOutcome = 'none' | 'set' | 'unchanged' | 'removed' | 'past' | Exclude<SetReminderResult, { ok: true }>['reason'];

/**
 * Plans a note on its day and brings its reminder in line with the draft.
 * The entry is saved first (it never depends on notifications); the reminder
 * goes through services/reminders, which schedules the new notification
 * before cancelling the old one and never leaves duplicates. An unchanged
 * reminder isn't rescheduled at all, so repeated saves are idempotent.
 */
export async function applySchedule(
  database: SQLiteDatabase,
  note: CalendarNoteRef,
  draft: ScheduleDraft,
  previous: { reminderAt: number | null; reminderOffset: number | null } = { reminderAt: null, reminderOffset: null },
): Promise<ReminderOutcome> {
  const schedule = normalizeSchedule(draft);
  const at = reminderInstant(draft);
  const offset = draft.reminder.mode === 'offset' ? draft.reminder.offset : null;
  await saveCalendarEntry(database, note, schedule, at === null ? null : offset);

  if (at === null) {
    if (previous.reminderAt === null) return 'none';
    if (note.kind === 'card') await removeCardReminder(database, note.id); else await removeMessageReminder(database, note.id);
    return 'removed';
  }
  if (at === previous.reminderAt) return 'unchanged';
  if (!isValidReminderTime(new Date(at), new Date())) {
    await setCalendarReminderOffset(database, note, previous.reminderAt === null ? null : previous.reminderOffset);
    return 'past';
  }
  const result = note.kind === 'card' ? await setCardReminder(database, note.id, at) : await setMessageReminder(database, note.id, at);
  if (result.ok) return 'set';
  // The previous reminder (if any) still stands; keep its rule with it.
  await setCalendarReminderOffset(database, note, previous.reminderAt === null ? null : previous.reminderOffset);
  return result.reason;
}

export type CreatedCalendarNote = { note: CalendarNoteRef; reminder: ReminderOutcome; spaceFull: boolean };

/**
 * Calendar → date → Add note: the note is an ordinary Chits note — a Chat
 * thought, a card in the chosen board column, or a thought stuck on a Space —
 * created exactly as the Cards tab and Boards create them, then planned on
 * the calendar. Never throws once the note exists, so a failed reminder can't
 * make the sheet retry and create a second copy.
 */
export async function createCalendarNote(database: SQLiteDatabase, submission: NoteSubmission, destination: CalendarDestination, draft: ScheduleDraft): Promise<CreatedCalendarNote> {
  normalizeSchedule(draft);
  let note: CalendarNoteRef;
  if (destination.type === 'board') {
    const { cardId } = await createBoardRepository(database).createNoteCard({ boardId: destination.boardId, columnId: destination.columnId, text: submission.text, attachment: submission.attachment, blocks: submission.blocks });
    note = { kind: 'card', id: cardId };
  } else {
    const messages = createMessageRepository(database);
    const id = submission.blocks
      ? await messages.createNote({ blocks: submission.blocks, attachment: submission.attachment })
      : submission.attachment
        ? (await messages.createAttachmentMessage(submission.attachment, submission.text || null)).id
        : (await messages.createText(submission.text)).id;
    note = { kind: 'message', id };
  }
  let spaceFull = false;
  let reminder: ReminderOutcome = 'none';
  try {
    if (destination.type === 'space') spaceFull = (await createSpaceRepository(database).stick('thought', note.id, destination.spaceId)).status === 'full';
    reminder = await applySchedule(database, note, draft);
  } catch (error) {
    console.warn('[calendar] note saved but could not be scheduled', error);
    reminder = 'failed';
  }
  return { note, reminder, spaceFull };
}

/** A short status line for a reminder outcome, or null when there's nothing to say. */
export function reminderOutcomeMessage(outcome: ReminderOutcome): string | null {
  switch (outcome) {
    case 'declined': case 'blocked': return 'Saved. Reminder not set — notifications are off for Chits.';
    case 'exact-alarm': return 'Saved. Allow Alarms & reminders to get this reminder on time.';
    case 'past': return 'Saved. That reminder time has already passed.';
    case 'failed': return 'Saved, but the reminder couldn’t be set. Try again.';
    default: return null;
  }
}
