import type { SQLiteDatabase } from 'expo-sqlite';

import { carryTarget, taskKey, type DailyPlan, type DailyTask } from './plan-core';

type PlanDatabase = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync' | 'withExclusiveTransactionAsync'>;
type PlanRow = { id: string; plan_date: string; status: DailyPlan['status']; reflection: string | null; created_at: number; updated_at: number; wrapped_at: number | null };
type TaskRow = { id: string; plan_id: string; title: string; completed_at: number | null; position: number; reminder_at: number | null; message_id: string | null; card_id: string | null; carried_from: string | null; carried_to: string | null };
export type PlanDay = { plan: DailyPlan; tasks: DailyTask[] };
export type PlanHistoryDay = DailyPlan & { total: number; done: number; carried: number };
export type TaskLink = { messageId?: string | null; cardId?: string | null };
/** A task planned before, once per title: `date` is the last day it was on, `planned` that it's already on the day asked about. */
export type RecentTask = { title: string; date: string; messageId: string | null; cardId: string | null; planned: boolean };
/** What a reused task takes along: its words and its note. Never its tick, reminder or history. */
export type TaskCopy = { title: string } & TaskLink;

const listeners = new Set<() => void>();
export function notifyPlanChanged() { for (const listener of listeners) listener(); }
export function subscribeToPlanChanges(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const toPlan = (row: PlanRow): DailyPlan => ({ id: row.id, date: row.plan_date, status: row.status, reflection: row.reflection, createdAt: row.created_at, updatedAt: row.updated_at, wrappedAt: row.wrapped_at });
const toTask = (row: TaskRow): DailyTask => ({ id: row.id, planId: row.plan_id, title: row.title, completedAt: row.completed_at, position: row.position, reminderAt: row.reminder_at, messageId: row.message_id, cardId: row.card_id, carriedFrom: row.carried_from, carriedTo: row.carried_to });

export function createPlanRepository(database: PlanDatabase) {
  const loadTasks = async (planId: string) => (await database.getAllAsync<TaskRow>('SELECT * FROM daily_tasks WHERE plan_id = ? ORDER BY position, created_at', planId)).map(toTask);
  const touch = (planId: string, now: number) => database.runAsync('UPDATE daily_plans SET updated_at = ? WHERE id = ?', now, planId);
  const nextPosition = async (planId: string) => ((await database.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM daily_tasks WHERE plan_id = ?', planId))?.next ?? 0);
  /** Safe to repeat: plan_date is unique, so two launches can't make two plans. */
  const ensure = async (date: string, now: number) => {
    await database.runAsync("INSERT OR IGNORE INTO daily_plans (id, plan_date, status, created_at, updated_at) VALUES (?, ?, 'planning', ?, ?)", newId(), date, now, now);
    return toPlan((await database.getFirstAsync<PlanRow>('SELECT * FROM daily_plans WHERE plan_date = ?', date))!);
  };

  return {
    /** Reads only. Opening the planner must never create a day. */
    async day(date: string): Promise<PlanDay | null> {
      const row = await database.getFirstAsync<PlanRow>('SELECT * FROM daily_plans WHERE plan_date = ?', date);
      if (!row) return null;
      return { plan: toPlan(row), tasks: await loadTasks(row.id) };
    },
    async addTask(date: string, title: string, link: TaskLink = {}, now = Date.now()) {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const plan = await ensure(date, now);
      const id = newId();
      await database.runAsync('INSERT INTO daily_tasks (id, plan_id, title, position, message_id, card_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, plan.id, trimmed, await nextPosition(plan.id), link.messageId ?? null, link.cardId ?? null, now, now);
      await touch(plan.id, now);
      notifyPlanChanged();
      return id;
    },
    async renameTask(id: string, title: string, now = Date.now()) {
      const trimmed = title.trim();
      if (!trimmed) return;
      await database.runAsync('UPDATE daily_tasks SET title = ?, updated_at = ? WHERE id = ?', trimmed, now, id);
      notifyPlanChanged();
    },
    /** Only the task goes. A linked note or card stays exactly as it was. */
    async deleteTask(id: string) {
      await database.runAsync('DELETE FROM daily_tasks WHERE id = ?', id);
      notifyPlanChanged();
    },
    /** Saying what a task should be rather than flipping it, so a repeat changes nothing. */
    async setDone(id: string, done: boolean, now = Date.now()) {
      const result = await database.runAsync(`UPDATE daily_tasks SET completed_at = ?, updated_at = ? WHERE id = ? AND ${done ? 'completed_at IS NULL' : 'completed_at IS NOT NULL'}`, done ? now : null, now, id);
      if (result.changes) notifyPlanChanged();
      return result.changes > 0;
    },
    async setReminder(id: string, at: number | null, now = Date.now()) {
      await database.runAsync('UPDATE daily_tasks SET reminder_at = ?, updated_at = ? WHERE id = ?', at, now, id);
      notifyPlanChanged();
    },
    async setLink(id: string, link: TaskLink, now = Date.now()) {
      await database.runAsync('UPDATE daily_tasks SET message_id = ?, card_id = ?, updated_at = ? WHERE id = ?', link.messageId ?? null, link.cardId ?? null, now, id);
      notifyPlanChanged();
    },
    async reorder(ids: readonly string[], now = Date.now()) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const [position, id] of ids.entries()) await transaction.runAsync('UPDATE daily_tasks SET position = ?, updated_at = ? WHERE id = ?', position, now, id);
      });
      notifyPlanChanged();
    },
    async start(date: string, now = Date.now()) {
      const plan = await ensure(date, now);
      await database.runAsync("UPDATE daily_plans SET status = 'active', updated_at = ? WHERE id = ? AND status = 'planning'", now, plan.id);
      notifyPlanChanged();
    },
    /**
     * Closes a day. Unfinished tasks moved on are copied, and the original stays
     * in this day's recap, marked with where it went. Nothing carries without being asked.
     */
    async wrapUp(date: string, today: string, choices: { reflection?: string | null; carry?: readonly string[]; complete?: readonly string[] } = {}, now = Date.now()) {
      const target = carryTarget(date, today);
      const reflection = choices.reflection?.trim() || null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const id of choices.complete ?? []) await transaction.runAsync('UPDATE daily_tasks SET completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?', now, now, id);
        const unfinished: TaskRow[] = [];
        for (const id of choices.carry ?? []) {
          const task = await transaction.getFirstAsync<TaskRow>('SELECT * FROM daily_tasks WHERE id = ? AND completed_at IS NULL', id);
          if (task) unfinished.push(task);
        }
        // Only a real task makes tomorrow's plan: an empty one would read as "planned".
        if (unfinished.length) {
          await transaction.runAsync("INSERT OR IGNORE INTO daily_plans (id, plan_date, status, created_at, updated_at) VALUES (?, ?, 'planning', ?, ?)", newId(), target, now, now);
          const plan = await transaction.getFirstAsync<PlanRow>('SELECT * FROM daily_plans WHERE plan_date = ?', target);
          let position = (await transaction.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM daily_tasks WHERE plan_id = ?', plan!.id))?.next ?? 0;
          for (const task of unfinished) {
            const result = await transaction.runAsync('INSERT OR IGNORE INTO daily_tasks (id, plan_id, title, position, message_id, card_id, carried_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), plan!.id, task.title, position, task.message_id, task.card_id, task.id, now, now);
            if (result.changes) position += 1;
            await transaction.runAsync('UPDATE daily_tasks SET carried_to = ?, updated_at = ? WHERE id = ?', target, now, task.id);
          }
        }
        await transaction.runAsync("UPDATE daily_plans SET status = 'wrapped', reflection = ?, wrapped_at = COALESCE(wrapped_at, ?), updated_at = ? WHERE plan_date = ?", reflection, now, now, date);
      });
      notifyPlanChanged();
      return target;
    },
    /** Back into an open day. Tasks already carried on stay where they went. */
    async reopen(date: string, now = Date.now()) {
      await database.runAsync("UPDATE daily_plans SET status = 'active', wrapped_at = NULL, updated_at = ? WHERE plan_date = ?", now, date);
      notifyPlanChanged();
    },
    async setReflection(date: string, reflection: string, now = Date.now()) {
      await database.runAsync('UPDATE daily_plans SET reflection = ?, updated_at = ? WHERE plan_date = ?', reflection.trim() || null, now, date);
      notifyPlanChanged();
    },
    /** Past days with something in them, newest first. Today is included once it has tasks; `before` keeps only earlier days. */
    async history(limit = 60, before?: string): Promise<PlanHistoryDay[]> {
      const rows = await database.getAllAsync<PlanRow & { total: number; done: number; carried: number }>(`
        SELECT p.*, COUNT(t.id) AS total, COUNT(t.completed_at) AS done, COUNT(t.carried_to) AS carried
        FROM daily_plans p JOIN daily_tasks t ON t.plan_id = p.id
        WHERE ? IS NULL OR p.plan_date < ?
        GROUP BY p.id ORDER BY p.plan_date DESC LIMIT ?`, before ?? null, before ?? null, limit);
      return rows.map((row) => ({ ...toPlan(row), total: row.total, done: row.done, carried: row.carried }));
    },
    /**
     * Tasks planned on other days, one per title, from the most recent day it was
     * on. A search reaches older ones. Reads only.
     */
    async recentTasks(date: string, term = '', limit = 60): Promise<RecentTask[]> {
      const planned = new Set((await database.getAllAsync<{ title: string }>('SELECT t.title FROM daily_tasks t JOIN daily_plans p ON p.id = t.plan_id WHERE p.plan_date = ?', date)).map((row) => taskKey(row.title)));
      const like = `%${term.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      const rows = await database.getAllAsync<{ title: string; plan_date: string; message_id: string | null; card_id: string | null }>(`
        SELECT t.title, p.plan_date, t.message_id, t.card_id
        FROM daily_tasks t JOIN daily_plans p ON p.id = t.plan_id
        WHERE p.plan_date != ? AND t.title LIKE ? ESCAPE '\\'
        ORDER BY p.plan_date DESC, t.created_at DESC, t.position DESC LIMIT 1000`, date, like);
      const seen = new Set<string>();
      const recent: RecentTask[] = [];
      for (const row of rows) {
        const key = taskKey(row.title);
        if (seen.has(key)) continue;
        seen.add(key);
        recent.push({ title: row.title, date: row.plan_date, messageId: row.message_id, cardId: row.card_id, planned: planned.has(key) });
        if (recent.length >= limit) break;
      }
      return recent;
    },
    /**
     * Puts copies on `date` as new, unfinished tasks after the ones already there.
     * A title the day already has (or a repeat in the batch) is skipped, and the
     * days they came from are never written. Only a real task makes a plan.
     */
    async addCopies(date: string, items: readonly TaskCopy[], now = Date.now()) {
      let added = 0;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const existing = await transaction.getFirstAsync<PlanRow>('SELECT * FROM daily_plans WHERE plan_date = ?', date);
        const seen = new Set(existing ? (await transaction.getAllAsync<{ title: string }>('SELECT title FROM daily_tasks WHERE plan_id = ?', existing.id)).map((row) => taskKey(row.title)) : []);
        const fresh = items.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => {
          const key = taskKey(item.title);
          if (!item.title || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (!fresh.length) return;
        await transaction.runAsync("INSERT OR IGNORE INTO daily_plans (id, plan_date, status, created_at, updated_at) VALUES (?, ?, 'planning', ?, ?)", newId(), date, now, now);
        const plan = (await transaction.getFirstAsync<PlanRow>('SELECT * FROM daily_plans WHERE plan_date = ?', date))!;
        let position = (await transaction.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM daily_tasks WHERE plan_id = ?', plan.id))?.next ?? 0;
        for (const item of fresh) {
          await transaction.runAsync('INSERT INTO daily_tasks (id, plan_id, title, position, message_id, card_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId(), plan.id, item.title, position, item.messageId ?? null, item.cardId ?? null, now, now);
          position += 1;
          added += 1;
        }
        await transaction.runAsync('UPDATE daily_plans SET updated_at = ? WHERE id = ?', now, plan.id);
      });
      if (added) notifyPlanChanged();
      return added;
    },
    async upcomingReminders(now = Date.now()) {
      return (await database.getAllAsync<TaskRow>('SELECT * FROM daily_tasks WHERE reminder_at > ? AND completed_at IS NULL ORDER BY reminder_at LIMIT 40', now)).map(toTask);
    },
  };
}
export type PlanRepository = ReturnType<typeof createPlanRepository>;
