// The rules of a day, with no database or React, so tests can walk them.

export type PlanStatus = 'planning' | 'active' | 'wrapped';
export type DailyPlan = { id: string; date: string; status: PlanStatus; reflection: string | null; createdAt: number; updatedAt: number; wrappedAt: number | null };
export type DailyTask = {
  id: string; planId: string; title: string; completedAt: number | null; position: number; reminderAt: number | null;
  messageId: string | null; cardId: string | null; carriedFrom: string | null; carriedTo: string | null;
};
export type DayPeriod = 'morning' | 'afternoon' | 'evening';
/** How many little things a day starts by suggesting. */
export const PLAN_SUGGESTED = 3;
export type PlanCta = 'plan' | 'view' | 'wins' | 'recap';

const pad = (value: number) => String(value).padStart(2, '0');

/** The empty places left on a new plan, as their numbers: with one task, [2, 3]. */
export const planSlots = (total: number) => Array.from({ length: Math.max(0, PLAN_SUGGESTED - total) }, (_, index) => total + index + 1);

/** Wrapping up only asks for attention once it's the natural next thing, never in the morning. */
export const wrapIsDue = (period: DayPeriod, done: number, total: number) => period === 'evening' || (total > 0 && done === total);

/** The local calendar day, never UTC: a late-evening task must stay on its own day. */
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A key as local noon, far from any midnight a daylight-saving change could move. */
export function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function nextMidnight(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
}

export function dayPeriod(hour: number): DayPeriod {
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

export function progressOf(tasks: readonly Pick<DailyTask, 'completedAt'>[]) {
  const done = tasks.filter((task) => task.completedAt !== null).length;
  return { done, total: tasks.length, allDone: tasks.length > 0 && done === tasks.length };
}

/** What the Notes hero offers, from the saved plan alone. */
export function planCta(plan: Pick<DailyPlan, 'status'> | null, tasks: readonly Pick<DailyTask, 'completedAt'>[]): PlanCta {
  if (plan?.status === 'wrapped') return 'recap';
  if (!plan || tasks.length === 0) return 'plan';
  return progressOf(tasks).allDone ? 'wins' : 'view';
}

/** Where carried tasks land: the day after, but never in the past. */
export function carryTarget(planDate: string, today: string) {
  const next = addDays(planDate, 1);
  return next > today ? next : today;
}

export type PlanMilestone = 'first' | 'half' | 'all';

/**
 * The reaction a newly ticked task earns, if any: each one once per day, however
 * often a task is unticked and ticked again. `reached` is what's been said so far.
 */
export function planMilestone(done: number, total: number, reached: readonly PlanMilestone[]): PlanMilestone | null {
  if (total > 0 && done === total && !reached.includes('all')) return 'all';
  if (total >= 4 && done * 2 >= total && done < total && !reached.includes('half')) return 'half';
  if (done >= 1 && done < total && !reached.includes('first')) return 'first';
  return null;
}

/** Task order after moving one up or down. Stays put at either end. */
export function moved<T>(items: readonly T[], index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export type WidgetToggle = { id: string; done: boolean; at: number };

/**
 * Ticks made on a widget while the app was closed, reduced to the latest wish per
 * task. Applying them twice changes nothing, so a retried sync can't double up.
 */
export function latestToggles(toggles: readonly WidgetToggle[]) {
  const latest = new Map<string, WidgetToggle>();
  for (const toggle of toggles) {
    const seen = latest.get(toggle.id);
    if (!seen || toggle.at >= seen.at) latest.set(toggle.id, toggle);
  }
  return [...latest.values()];
}

export type PlanNotificationSettings = { morning: boolean; morningTime: string; evening: boolean; eveningTime: string };
export const PLAN_NOTIFICATION_DEFAULTS: PlanNotificationSettings = { morning: false, morningTime: '08:00', evening: false, eveningTime: '20:30' };
export const PLAN_NOTIFICATION_KEYS = { morning: 'plan_morning_enabled', morningTime: 'plan_morning_time', evening: 'plan_evening_enabled', eveningTime: 'plan_evening_time' } as const;
/** Mornings scheduled ahead. Someone who stops opening Chits soon stops being asked. */
const MORNINGS_AHEAD = 7;

export function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? { hours, minutes } : null;
}

const atClock = (key: string, clock: string) => {
  const parsed = parseClock(clock);
  if (!parsed) return null;
  const date = dateFromKey(key);
  date.setHours(parsed.hours, parsed.minutes, 0, 0);
  return date;
};

export type PlanNudge = { id: string; kind: 'morning' | 'evening'; at: number };

/**
 * The daily nudges worth sending: a morning one only if today has no plan, and an
 * evening one only for a day that has a plan and hasn't been wrapped up.
 */
export function planNudges(settings: PlanNotificationSettings, today: { hasPlan: boolean; wrapped: boolean }, now: Date): PlanNudge[] {
  const key = localDateKey(now);
  const nudges: PlanNudge[] = [];
  if (settings.morning) for (let offset = 0; offset < MORNINGS_AHEAD; offset += 1) {
    if (offset === 0 && today.hasPlan) continue;
    const day = addDays(key, offset);
    const at = atClock(day, settings.morningTime);
    if (at && at.getTime() > now.getTime()) nudges.push({ id: `morning:${day}`, kind: 'morning', at: at.getTime() });
  }
  if (settings.evening && today.hasPlan && !today.wrapped) {
    const at = atClock(key, settings.eveningTime);
    if (at && at.getTime() > now.getTime()) nudges.push({ id: `evening:${key}`, kind: 'evening', at: at.getTime() });
  }
  return nudges;
}
