import { tr } from '@/localization/runtime';
// Pure date logic for the Calendar (no React Native imports, so it is unit-tested directly).
//
// A calendar entry's day and time are local wall-clock values: a day key
// ('YYYY-MM-DD') and minutes after midnight. They are turned into instants
// only when needed (a reminder, "now" lines), always with the device's current
// timezone, so Oct 15 at 9:00 stays Oct 15 at 9:00 across travel and DST.

import { dateFormat } from '@/services/reminder-time';

export const DAY_MINUTES = 24 * 60;
/** All-day notes are reminded relative to this time of day (9:00 AM). */
export const ALL_DAY_REMINDER_MINUTE = 9 * 60;
export const DEFAULT_DURATION_MINUTES = 60;

export type CalendarSchedule = {
  dateKey: string;
  /** Minutes after local midnight; null means all day. */
  startMinute: number | null;
  /** Minutes after local midnight (up to 1440); null when all day or open-ended. */
  endMinute: number | null;
};

export function localDayKey(value: number | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The local midnight a day key names, or null for anything that isn't a real date (2026-02-30). */
export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Same day of month in another month, clamped (Jan 31 + 1 month → Feb 28/29). */
export function addLocalMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
}

/** The local instant `minute` minutes into a day. Built from parts, so DST days come out right. */
export function dayMinuteToDate(dateKey: string, minute: number): Date {
  const day = parseDayKey(dateKey);
  if (!day) throw new Error(`Invalid calendar day: ${dateKey}`);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minute / 60), minute % 60, 0, 0);
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Rejects anything SQLite's checks would (bad day, minutes out of range, end before start). */
export function normalizeSchedule(schedule: CalendarSchedule): CalendarSchedule {
  if (!parseDayKey(schedule.dateKey)) throw new Error(tr("calendarschedule.chooseAValidDate"));
  if (schedule.startMinute === null) return { dateKey: schedule.dateKey, startMinute: null, endMinute: null };
  const start = Math.trunc(schedule.startMinute);
  if (start < 0 || start >= DAY_MINUTES) throw new Error(tr("calendarschedule.chooseAValidStartTime"));
  if (schedule.endMinute === null) return { dateKey: schedule.dateKey, startMinute: start, endMinute: null };
  const end = Math.trunc(schedule.endMinute);
  if (end < start || end > DAY_MINUTES) throw new Error(tr("calendarschedule.theEndTimeMustBeAfterTheStart"));
  return { dateKey: schedule.dateKey, startMinute: start, endMinute: end };
}

// ---------------------------------------------------------------------------
// Reminders relative to the schedule.

export type ReminderPreset = { offset: number; label: string };
export const TIMED_REMINDER_PRESETS: ReminderPreset[] = [
  { offset: 0, get label() { return tr("calendarschedule.atStartTime"); } },
  { offset: 5, get label() { return tr("calendarschedule.5MinBefore"); } },
  { offset: 15, get label() { return tr("calendarschedule.15MinBefore"); } },
  { offset: 30, get label() { return tr("calendarschedule.30MinBefore"); } },
  { offset: 60, get label() { return tr("calendarschedule.1HourBefore"); } },
  { offset: DAY_MINUTES, get label() { return tr("calendarschedule.1DayBefore"); } },
];
export const ALL_DAY_REMINDER_PRESETS: ReminderPreset[] = [
  { offset: 0, get label() { return tr("calendarschedule.onTheDay9Am"); } },
  { offset: DAY_MINUTES, get label() { return tr("calendarschedule.dayBefore9Am"); } },
];
export function reminderPresets(schedule: Pick<CalendarSchedule, 'startMinute'>): ReminderPreset[] {
  return schedule.startMinute === null ? ALL_DAY_REMINDER_PRESETS : TIMED_REMINDER_PRESETS;
}

/** What reminders count back from: the start time, or 9:00 AM on an all-day note's day. */
export function reminderAnchor(schedule: CalendarSchedule): Date {
  return dayMinuteToDate(schedule.dateKey, schedule.startMinute ?? ALL_DAY_REMINDER_MINUTE);
}

/**
 * The reminder instant for "offset minutes before". Subtracts wall-clock
 * minutes (not milliseconds) so "1 day before" a 9:00 note stays at 9:00 even
 * when a DST change falls in between.
 */
export function reminderTimeForOffset(schedule: CalendarSchedule, offset: number): number {
  const anchor = reminderAnchor(schedule);
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), anchor.getHours(), anchor.getMinutes() - offset, 0, 0).getTime();
}

/** The preset matching a stored offset, for labels; null for a custom reminder. */
export function reminderPresetLabel(schedule: Pick<CalendarSchedule, 'startMinute'>, offset: number | null): string | null {
  if (offset === null) return null;
  return reminderPresets(schedule).find((preset) => preset.offset === offset)?.label ?? tr("messages.minBefore", { value1: offset });
}

export type ScheduledReminderRow = { kind: 'card' | 'message'; id: string; schedule: CalendarSchedule; offset: number; reminderAt: number };

/**
 * Reminders set relative to a calendar entry follow its local wall-clock time.
 * After a timezone change (or a restore onto a device in another zone) the
 * stored instant no longer matches "15 min before 9:00"; this lists the ones
 * to move. Fired reminders and ones that would now be in the past stay put —
 * moving them could never notify on time, and they still show as overdue.
 */
export function planScheduleReminderUpdates(rows: ScheduledReminderRow[], now: number): { kind: 'card' | 'message'; id: string; scheduledAt: number }[] {
  const updates: { kind: 'card' | 'message'; id: string; scheduledAt: number }[] = [];
  for (const row of rows) {
    if (row.reminderAt <= now || !parseDayKey(row.schedule.dateKey)) continue;
    const expected = reminderTimeForOffset(row.schedule, row.offset);
    if (expected !== row.reminderAt && expected > now) updates.push({ kind: row.kind, id: row.id, scheduledAt: expected });
  }
  return updates;
}

// ---------------------------------------------------------------------------
// Grids.

/** 0 = Sunday … 6 = Saturday. expo-localization's firstWeekday is 1 = Sunday … 7 = Saturday. */
export function weekStartFromLocale(firstWeekday: number | null | undefined): number {
  return firstWeekday && firstWeekday >= 1 && firstWeekday <= 7 ? firstWeekday - 1 : 0;
}

export function weekdayOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);
}

export function startOfWeek(date: Date, weekStart: number): Date {
  return addLocalDays(startOfLocalDay(date), -((date.getDay() - weekStart + 7) % 7));
}

/**
 * The days a month grid shows: from the start of the week containing the 1st,
 * five or six whole weeks (five even for a February that fits in four, so
 * the grid never jumps in height between most months).
 */
export function monthGrid(year: number, month: number, weekStart: number): { start: Date; weeks: number } {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return { start: addLocalDays(first, -lead), weeks: Math.max(5, Math.ceil((lead + days) / 7)) };
}

/** Months counted from year 0, so pages of a month pager can be indexed directly. */
export function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}
export function monthFromIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** The first and last day keys a month page shows (its leading/trailing days included). */
export function monthGridRange(year: number, month: number, weekStart: number): { from: string; to: string } {
  const { start, weeks } = monthGrid(year, month, weekStart);
  return { from: localDayKey(start), to: localDayKey(addLocalDays(start, weeks * 7 - 1)) };
}

/**
 * How many entry strips fit in a month cell, keeping a line for "+N more"
 * when they don't all fit. Returns the strips to draw and the hidden count.
 */
export function cellCapacity(total: number, slots: number): { shown: number; more: number } {
  if (slots <= 0) return { shown: 0, more: total };
  if (total <= slots) return { shown: total, more: 0 };
  const shown = Math.max(0, slots - 1);
  return { shown, more: total - shown };
}

export type TimedBlock = { key: string; start: number; end: number };
/**
 * Side-by-side columns for overlapping timed entries in the Day view: each
 * cluster of overlaps is split into as many lanes as it needs.
 */
export function layoutDayLanes(blocks: TimedBlock[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { key: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => { for (const item of cluster) result.set(item.key, { lane: item.lane, lanes: laneEnds.length }); cluster = []; laneEnds = []; };
  for (const block of sorted) {
    if (block.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= block.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(block.end); } else laneEnds[lane] = block.end;
    cluster.push({ key: block.key, lane });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();
  return result;
}

export function formatMinute(minute: number, locale?: string): string {
  return dateFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60));
}

/** "All day", "9:00 AM" or "9:00 – 10:30 AM"-style label for a schedule. */
export function formatScheduleTime(schedule: Pick<CalendarSchedule, 'startMinute' | 'endMinute'>, locale?: string): string {
  if (schedule.startMinute === null) return tr('schedulefields.allDay');
  if (schedule.endMinute === null || schedule.endMinute === schedule.startMinute) return formatMinute(schedule.startMinute, locale);
  return `${formatMinute(schedule.startMinute, locale)} – ${formatMinute(schedule.endMinute % DAY_MINUTES, locale)}`;
}
