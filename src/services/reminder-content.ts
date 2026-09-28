// Pure notification text and sync planning for card reminders (unit-tested directly).

export const REMINDER_TITLE = 'Chits Reminder';
export const REMINDER_NOTIFICATION_TYPE = 'card-reminder';
const MAX_BODY = 110;

export type ReminderCardContent = {
  hidden: boolean;
  text: string | null;
  title: string | null;
  attachmentType: 'photo' | 'video' | 'audio' | 'file' | 'text' | null;
};

/**
 * The notification body. It's shown on the lock screen, so a hidden card never
 * reveals its words, and an attachment-only card names only its kind (never a
 * filename or any of the file's contents).
 */
export function reminderBody(card: ReminderCardContent): string {
  if (card.hidden) return 'A hidden note';
  const words = (card.text?.trim() || card.title?.trim() || '').replace(/\s+/g, ' ');
  if (words) return truncate(words, MAX_BODY);
  if (card.attachmentType === 'photo') return 'A photo note';
  if (card.attachmentType === 'video') return 'A video note';
  if (card.attachmentType === 'audio') return 'A voice note';
  if (card.attachmentType === 'file') return 'A file note';
  return 'Open your note';
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type ReminderRow = { cardId: string; scheduledAt: number; notificationId: string | null; cardActive: boolean; body: string };
export type ScheduledReminder = { identifier: string; cardId: string | null; body: string | null };
export type ReminderSyncPlan = {
  /** Rows to delete (already fired, or their card was archived/removed). */
  deleteRows: string[];
  /** Local notifications to cancel (orphans, duplicates, stale content). */
  cancel: string[];
  /** Rows whose notification must be (re)scheduled. */
  schedule: { cardId: string; scheduledAt: number; body: string }[];
};

/**
 * Reconciles stored reminders with what's actually scheduled on the device so
 * nothing is orphaned or silently lost: fired/removed reminders are cleared,
 * notifications with no live reminder are cancelled, and reminders whose
 * notification is missing (restore, reinstall) or whose text changed (edited,
 * hidden) are rescheduled.
 */
export function planReminderSync(rows: ReminderRow[], scheduled: ScheduledReminder[], now: number): ReminderSyncPlan {
  const plan: ReminderSyncPlan = { deleteRows: [], cancel: [], schedule: [] };
  const byId = new Map(scheduled.map((item) => [item.identifier, item]));
  const keep = new Set<string>();
  for (const row of rows) {
    if (row.scheduledAt <= now || !row.cardActive) { plan.deleteRows.push(row.cardId); continue; }
    const current = row.notificationId ? byId.get(row.notificationId) : undefined;
    if (current && current.cardId === row.cardId && current.body === row.body) { keep.add(current.identifier); continue; }
    plan.schedule.push({ cardId: row.cardId, scheduledAt: row.scheduledAt, body: row.body });
  }
  for (const item of scheduled) if (!keep.has(item.identifier)) plan.cancel.push(item.identifier);
  return plan;
}
