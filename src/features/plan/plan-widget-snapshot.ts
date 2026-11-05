import { addDays, progressOf, type DailyPlan, type DailyTask, type WidgetToggle } from './plan-core';

export type PlanWidgetState = 'none' | 'active' | 'allDone' | 'wrapped';
export type PlanWidgetTask = { id: string; title: string; done: boolean };
export type PlanWidgetLabels = { today: string; none: string; action: string; keepGoing: string; allDone: string; wrapped: string; hidden: string; add: string; wrap: string; view: string; recap: string; count: string };
export type PlanWidgetColors = { background: string; foreground: string; secondary: string; accent: string; onAccent: string; track: string };
export type PlanWidgetSnapshot = PlanWidgetColors & PlanWidgetLabels & {
  version: 1; date: string; dateLabel: string; state: PlanWidgetState;
  done: number; total: number; tasks: PlanWidgetTask[]; hiddenTasks: boolean;
  /** iOS 17+ and Android: ticks work on the widget. Otherwise a row opens the task. */
  interactive: boolean;
  /** Ticks made on the widget, waiting for the app to save them. */
  pending: WidgetToggle[];
  locale: string; rtl: boolean; mascot: string;
};

const MAX_TASKS = 8;

/** Unfinished tasks first, and task names only if widget privacy allows them. */
export function planWidgetSnapshot(input: { date: string; dateLabel: string; plan: DailyPlan | null; tasks: DailyTask[]; showTitles: boolean; interactive: boolean; locale: string; rtl: boolean; labels: Omit<PlanWidgetLabels, 'count'>; colors: PlanWidgetColors; countLabel: (done: number, total: number) => string }): PlanWidgetSnapshot {
  const { done, total, allDone } = progressOf(input.tasks);
  const state: PlanWidgetState = input.plan?.status === 'wrapped' ? 'wrapped' : total === 0 ? 'none' : allDone ? 'allDone' : 'active';
  const rows = input.showTitles ? [...input.tasks].sort((a, b) => Number(a.completedAt !== null) - Number(b.completedAt !== null) || a.position - b.position).slice(0, MAX_TASKS) : [];
  return {
    ...input.labels, ...input.colors, count: input.countLabel(done, total),
    version: 1, date: input.date, dateLabel: input.dateLabel, state, done, total,
    tasks: rows.map((task) => ({ id: task.id, title: task.title.replace(/\s+/g, ' ').trim().slice(0, 100), done: task.completedAt !== null })),
    hiddenTasks: !input.showTitles && total > 0, interactive: input.interactive, pending: [], locale: input.locale, rtl: input.rtl, mascot: '',
  };
}

/** What the widget switches to at midnight: yesterday's plan must never pass for today's. */
export function freshDaySnapshot(snapshot: PlanWidgetSnapshot, dateLabel: string): PlanWidgetSnapshot {
  return { ...snapshot, date: addDays(snapshot.date, 1), dateLabel, state: 'none', done: 0, total: 0, tasks: [], hiddenTasks: false, count: '', pending: [] };
}
