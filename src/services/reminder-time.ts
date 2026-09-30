// Pure date logic for Chits reminders (no React Native imports, so it is unit-tested directly).

export type ReminderQuickKey = 'later-today' | 'tomorrow' | 'weekend';
export type ReminderQuickOption = { key: ReminderQuickKey; label: string; date: Date };

const MINUTE = 60 * 1000;
/** A reminder must be at least this far ahead of "now" to be accepted. */
export const MIN_LEAD_MS = MINUTE;

const at = (base: Date, dayOffset: number, hours: number, minutes = 0) => {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hours, minutes, 0, 0);
  return date;
};

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * The quick choices shown in the reminder sheet, computed from `now`:
 *  - Later today: 6 PM, or 3 hours from now on the hour once it's past 3 PM;
 *    omitted when that would be after 10 PM (it would no longer be "today").
 *  - Tomorrow: 9 AM tomorrow.
 *  - This weekend: Saturday 9 AM (Sunday 9 AM when it's already Saturday);
 *    on a Sunday it becomes "Next weekend" (next Saturday 9 AM).
 */
export function reminderQuickOptions(now: Date): ReminderQuickOption[] {
  const options: ReminderQuickOption[] = [];
  let laterToday = at(now, 0, 18);
  if (laterToday.getTime() - now.getTime() < 2 * 60 * MINUTE) {
    laterToday = new Date(now.getTime() + 3 * 60 * MINUTE);
    laterToday.setMinutes(0, 0, 0);
    if (laterToday.getTime() - now.getTime() < 3 * 60 * MINUTE) laterToday = new Date(laterToday.getTime() + 60 * MINUTE);
  }
  if (sameDay(laterToday, now) && laterToday.getHours() <= 22) options.push({ key: 'later-today', label: 'Later today', date: laterToday });
  options.push({ key: 'tomorrow', label: 'Tomorrow', date: at(now, 1, 9) });
  const day = now.getDay(); // 0 = Sunday … 6 = Saturday
  if (day === 0) options.push({ key: 'weekend', label: 'Next weekend', date: at(now, 6, 9) });
  else if (day === 6) options.push({ key: 'weekend', label: 'This weekend', date: at(now, 1, 9) });
  else options.push({ key: 'weekend', label: 'This weekend', date: at(now, 6 - day, 9) });
  return options;
}

/** Whether a reminder time is acceptable (in the future, with a small lead). */
export function isValidReminderTime(date: Date, now: Date): boolean {
  return Number.isFinite(date.getTime()) && date.getTime() - now.getTime() >= MIN_LEAD_MS;
}

/** A sensible starting point for "Pick date & time": the next full hour, at least an hour away. */
export function defaultCustomReminderTime(now: Date): Date {
  const date = new Date(now.getTime() + 60 * MINUTE);
  date.setMinutes(0, 0, 0);
  if (date.getTime() - now.getTime() < 30 * MINUTE) return new Date(date.getTime() + 60 * MINUTE);
  return date;
}

/** Keeps the time of `current` but moves it to the calendar day of `day`. */
export function withDate(current: Date, year: number, month: number, dayOfMonth: number): Date {
  return new Date(year, month, dayOfMonth, current.getHours(), current.getMinutes(), 0, 0);
}

/** Keeps the day of `current` but sets its time. */
export function withTime(current: Date, hours: number, minutes: number): Date {
  return new Date(current.getFullYear(), current.getMonth(), current.getDate(), hours, minutes, 0, 0);
}

/**
 * Natural, localized label: "Today, 8:00 PM", "Tomorrow, 9:00 AM",
 * "Sep 30, 8:00 PM" ("Sep 30 2027, …" outside the current year).
 */
export function formatReminder(date: Date, now: Date, locale?: string): string {
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  if (sameDay(date, now)) return `Today, ${time}`;
  if (sameDay(date, at(now, 1, 0))) return `Tomorrow, ${time}`;
  const day = new Intl.DateTimeFormat(locale, date.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  return `${day}, ${time}`;
}

/** Date row label in the sheet: "Today", "Tomorrow" or "Tue, Sep 30". */
export function formatReminderDay(date: Date, now: Date, locale?: string): string {
  if (sameDay(date, now)) return 'Today';
  if (sameDay(date, at(now, 1, 0))) return 'Tomorrow';
  return new Intl.DateTimeFormat(locale, date.getFullYear() === now.getFullYear() ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function formatReminderClock(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}
