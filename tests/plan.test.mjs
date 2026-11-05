import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';
import { addDays, carryTarget, dayPeriod, latestToggles, localDateKey, moved, nextMidnight, parseClock, planCta, planMilestone, planNudges, progressOf, PLAN_NOTIFICATION_DEFAULTS } from '../src/features/plan/plan-core.ts';
import { freshDaySnapshot, planWidgetSnapshot } from '../src/features/plan/plan-widget-snapshot.ts';

const { createPlanRepository } = await loadModule('src/features/plan/plan-repository');
const repositories = await loadModule('src/db/repositories');

async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return { db, plans: createPlanRepository(db) };
}
const count = async (db, table) => (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table}`)).n;
const TODAY = '2026-11-04';
const TOMORROW = '2026-11-05';

test('a day key is the local calendar day, including just before midnight', () => {
  assert.equal(localDateKey(new Date(2026, 10, 4, 23, 59, 59)), '2026-11-04');
  assert.equal(localDateKey(new Date(2026, 10, 5, 0, 0, 1)), '2026-11-05');
  assert.equal(localDateKey(new Date(2026, 0, 3, 9)), '2026-01-03', 'zero-padded, so keys sort as dates');
});

test('adding days crosses months, years and daylight-saving changes', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(localDateKey(nextMidnight(new Date(2026, 11, 31, 18))), '2027-01-01');
});

test('the day splits into three moods', () => {
  assert.deepEqual([5, 11, 12, 17, 18, 23].map(dayPeriod), ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
});

test('the Notes action follows the saved plan', () => {
  const open = { completedAt: null }; const done = { completedAt: 1 };
  assert.equal(planCta(null, []), 'plan');
  assert.equal(planCta({ status: 'planning' }, []), 'plan', 'an empty day is no plan yet');
  assert.equal(planCta({ status: 'active' }, [open, done]), 'view');
  assert.equal(planCta({ status: 'active' }, [done, done]), 'wins');
  assert.equal(planCta({ status: 'wrapped' }, [open]), 'recap');
});

test('Chits reacts to each milestone once, however often a task is unticked', () => {
  assert.equal(planMilestone(1, 5, []), 'first');
  assert.equal(planMilestone(1, 5, ['first']), null);
  assert.equal(planMilestone(3, 5, ['first']), 'half');
  assert.equal(planMilestone(3, 5, ['first', 'half']), null);
  assert.equal(planMilestone(5, 5, ['first', 'half']), 'all');
  assert.equal(planMilestone(5, 5, ['first', 'half', 'all']), null);
  assert.equal(planMilestone(1, 1, []), 'all', 'a one-task day goes straight to done');
  assert.equal(planMilestone(2, 3, ['first']), null, 'short lists skip the halfway line');
});

test('moving a task keeps every task, and stays put at the ends', () => {
  assert.deepEqual(moved(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moved(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moved(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});

test('widget ticks reduce to the latest wish per task', () => {
  const result = latestToggles([{ id: 'a', done: true, at: 1 }, { id: 'a', done: false, at: 2 }, { id: 'b', done: true, at: 1 }]);
  assert.deepEqual(result.sort((x, y) => x.id.localeCompare(y.id)), [{ id: 'a', done: false, at: 2 }, { id: 'b', done: true, at: 1 }]);
});

test('carried tasks land on the next day, never in the past', () => {
  assert.equal(carryTarget(TODAY, TODAY), TOMORROW);
  assert.equal(carryTarget('2026-10-01', TODAY), TODAY, 'wrapping up an old day brings them to today');
});

test('opening the planner creates nothing', async (t) => {
  const { db, plans } = await fixture(t);
  assert.equal(await plans.day(TODAY), null);
  assert.equal(await count(db, 'daily_plans'), 0);
});

test('repeated use of a day never makes a second plan', async (t) => {
  const { db, plans } = await fixture(t);
  await Promise.all([plans.addTask(TODAY, 'One'), plans.addTask(TODAY, 'Two'), plans.start(TODAY)]);
  await plans.start(TODAY);
  assert.equal(await count(db, 'daily_plans'), 1);
  assert.equal((await plans.day(TODAY)).tasks.length, 2);
});

test('tasks can be added, edited, reordered, ticked, unticked and deleted', async (t) => {
  const { plans } = await fixture(t);
  const a = await plans.addTask(TODAY, '  Water plants  ');
  const b = await plans.addTask(TODAY, 'Call mum');
  assert.equal(await plans.addTask(TODAY, '   '), null, 'blank titles are ignored');
  await plans.renameTask(a, 'Water the plants');
  await plans.reorder([b, a]);
  let { tasks } = await plans.day(TODAY);
  assert.deepEqual(tasks.map((task) => task.title), ['Call mum', 'Water the plants']);
  await plans.setDone(a, true);
  assert.equal(progressOf((await plans.day(TODAY)).tasks).done, 1);
  await plans.setDone(a, false);
  assert.equal(progressOf((await plans.day(TODAY)).tasks).done, 0, 'unticking recalculates');
  await plans.deleteTask(b);
  ({ tasks } = await plans.day(TODAY));
  assert.deepEqual(tasks.map((task) => task.title), ['Water the plants']);
});

test('setting a task done twice changes nothing, so a widget retry is harmless', async (t) => {
  const { plans } = await fixture(t);
  const id = await plans.addTask(TODAY, 'Task');
  assert.equal(await plans.setDone(id, true, 100), true);
  assert.equal(await plans.setDone(id, true, 200), false);
  assert.equal((await plans.day(TODAY)).tasks[0].completedAt, 100, 'the first completion time stands');
  assert.equal(await plans.setDone('no-such-task', true), false);
});

test('deleting a task leaves its linked note and card alone', async (t) => {
  const { db, plans } = await fixture(t);
  const note = await repositories.createMessageRepository(db).createText('Remember milk');
  const id = await plans.addTask(TODAY, 'Remember milk', { messageId: note.id });
  await plans.deleteTask(id);
  assert.equal(await count(db, 'messages'), 1);
  assert.equal((await db.getFirstAsync('SELECT text FROM messages')).text, 'Remember milk');
});

test('a note going away leaves the task and its title', async (t) => {
  const { db, plans } = await fixture(t);
  const note = await repositories.createMessageRepository(db).createText('Gone soon');
  await plans.addTask(TODAY, 'Gone soon', { messageId: note.id });
  await db.runAsync('DELETE FROM messages');
  assert.equal((await plans.day(TODAY)).tasks[0].title, 'Gone soon');
});

test('wrapping up carries only what was chosen, and keeps the original recap whole', async (t) => {
  const { plans } = await fixture(t);
  const done = await plans.addTask(TODAY, 'Done');
  const carry = await plans.addTask(TODAY, 'Carry me');
  const stay = await plans.addTask(TODAY, 'Leave me');
  await plans.start(TODAY);
  await plans.setDone(done, true);
  const target = await plans.wrapUp(TODAY, TODAY, { reflection: ' A good walk ', carry: [carry] });
  assert.equal(target, TOMORROW);
  const today = await plans.day(TODAY);
  assert.equal(today.plan.status, 'wrapped');
  assert.equal(today.plan.reflection, 'A good walk');
  assert.deepEqual(today.tasks.map((task) => task.title), ['Done', 'Carry me', 'Leave me'], 'history keeps all three');
  assert.equal(today.tasks[1].carriedTo, TOMORROW);
  assert.equal(today.tasks[1].completedAt, null, 'carried is not the same as done');
  assert.equal(today.tasks[2].carriedTo, null);
  const next = await plans.day(TOMORROW);
  assert.deepEqual(next.tasks.map((task) => task.title), ['Carry me']);
  assert.equal(next.tasks[0].carriedFrom, carry);
  assert.equal(next.plan.status, 'planning');
  assert.ok(stay);
});

test('finishing a carried task tomorrow does not rewrite yesterday', async (t) => {
  const { plans } = await fixture(t);
  const carry = await plans.addTask(TODAY, 'Carry me');
  await plans.wrapUp(TODAY, TODAY, { carry: [carry] });
  await plans.setDone((await plans.day(TOMORROW)).tasks[0].id, true);
  assert.equal((await plans.day(TODAY)).tasks[0].completedAt, null);
});

test('reopening and wrapping again cannot carry a task twice', async (t) => {
  const { plans } = await fixture(t);
  const carry = await plans.addTask(TODAY, 'Carry me');
  await plans.wrapUp(TODAY, TODAY, { carry: [carry] });
  await plans.reopen(TODAY);
  assert.equal((await plans.day(TODAY)).plan.status, 'active');
  await plans.wrapUp(TODAY, TODAY, { carry: [carry] });
  assert.equal((await plans.day(TOMORROW)).tasks.length, 1);
});

test('tasks can be marked finished during wrap-up, and are not carried', async (t) => {
  const { plans } = await fixture(t);
  const id = await plans.addTask(TODAY, 'Actually did this');
  await plans.wrapUp(TODAY, TODAY, { complete: [id], carry: [id] });
  assert.ok((await plans.day(TODAY)).tasks[0].completedAt);
  assert.equal(await plans.day(TOMORROW), null, 'a finished task has nothing to carry');
});

test('a reflection is optional, and can be amended afterwards', async (t) => {
  const { plans } = await fixture(t);
  await plans.addTask(TODAY, 'Task');
  await plans.wrapUp(TODAY, TODAY);
  assert.equal((await plans.day(TODAY)).plan.reflection, null);
  await plans.setReflection(TODAY, 'Coffee with Sam');
  assert.equal((await plans.day(TODAY)).plan.reflection, 'Coffee with Sam');
});

test('history lists days with tasks, newest first, with honest counts', async (t) => {
  const { plans } = await fixture(t);
  const a = await plans.addTask('2026-11-01', 'Old');
  await plans.addTask('2026-11-01', 'Old too');
  await plans.setDone(a, true);
  await plans.addTask('2026-11-03', 'Newer');
  await plans.start('2026-11-04');
  const days = await plans.history();
  assert.deepEqual(days.map((day) => [day.date, day.done, day.total]), [['2026-11-03', 0, 1], ['2026-11-01', 1, 2]], 'an empty day is left out');
});

test('only future reminders on unfinished tasks are scheduled', async (t) => {
  const { plans } = await fixture(t);
  const a = await plans.addTask(TODAY, 'Later');
  const b = await plans.addTask(TODAY, 'Done already');
  const c = await plans.addTask(TODAY, 'Past');
  await plans.setReminder(a, 5000); await plans.setReminder(b, 5000); await plans.setReminder(c, 500);
  await plans.setDone(b, true);
  assert.deepEqual((await plans.upcomingReminders(1000)).map((task) => task.title), ['Later']);
});

const task = (id, title, position, completedAt = null) => ({ id, planId: 'p', title, completedAt, position, reminderAt: null, messageId: null, cardId: null, carriedFrom: null, carriedTo: null });
const widget = (over = {}) => planWidgetSnapshot({ date: TODAY, dateLabel: 'Wed, Nov 4', plan: { status: 'active' }, tasks: [task('a', 'First', 0, 5), task('b', 'Second', 1), task('c', 'Third', 2)], showTitles: true, interactive: true, locale: 'en', rtl: false, labels: {}, colors: {}, countLabel: (done, total) => `${done} / ${total} done`, ...over });

test('widgets lead with what is left to do', () => {
  assert.deepEqual(widget().tasks.map((item) => item.id), ['b', 'c', 'a']);
  assert.equal(widget().state, 'active');
  assert.equal(widget().count, '1 / 3 done');
});

test('widget states follow the plan', () => {
  assert.equal(widget({ plan: null, tasks: [] }).state, 'none');
  assert.equal(widget({ tasks: [task('a', 'One', 0, 5)] }).state, 'allDone');
  assert.equal(widget({ plan: { status: 'wrapped' } }).state, 'wrapped');
});

test('widget privacy hides task names and keeps only the counts', () => {
  const hidden = widget({ showTitles: false });
  assert.deepEqual(hidden.tasks, []);
  assert.equal(hidden.hiddenTasks, true);
  assert.equal(hidden.total, 3);
  assert.doesNotMatch(JSON.stringify(hidden), /First|Second|Third/);
});

test('the widget tomorrow is a blank day, never today\'s plan', () => {
  const fresh = freshDaySnapshot(widget(), 'Thu, Nov 5');
  assert.equal(fresh.date, TOMORROW);
  assert.equal(fresh.state, 'none');
  assert.deepEqual(fresh.tasks, []);
  assert.equal(fresh.total, 0);
  assert.doesNotMatch(JSON.stringify(fresh), /First|Second/);
});

test('a morning nudge is skipped once today has a plan, and stops a week out', () => {
  const settings = { ...PLAN_NOTIFICATION_DEFAULTS, morning: true };
  const early = new Date(2026, 10, 4, 6);
  const nudges = planNudges(settings, { hasPlan: false, wrapped: false }, early);
  assert.equal(nudges.length, 7);
  assert.equal(nudges[0].id, 'morning:2026-11-04');
  assert.equal(planNudges(settings, { hasPlan: true, wrapped: false }, early)[0].id, 'morning:2026-11-05');
  assert.equal(planNudges(settings, { hasPlan: false, wrapped: false }, new Date(2026, 10, 4, 9))[0].id, 'morning:2026-11-05', 'a time already passed is not sent late');
});

test('an evening nudge needs a plan that is still open', () => {
  const settings = { ...PLAN_NOTIFICATION_DEFAULTS, evening: true };
  const afternoon = new Date(2026, 10, 4, 15);
  assert.deepEqual(planNudges(settings, { hasPlan: false, wrapped: false }, afternoon), []);
  assert.deepEqual(planNudges(settings, { hasPlan: true, wrapped: true }, afternoon), []);
  assert.equal(planNudges(settings, { hasPlan: true, wrapped: false }, afternoon).length, 1);
});

test('nothing is sent unless it was turned on', () => {
  assert.deepEqual(planNudges(PLAN_NOTIFICATION_DEFAULTS, { hasPlan: true, wrapped: false }, new Date(2026, 10, 4, 6)), []);
  assert.equal(parseClock('25:00'), null);
  assert.deepEqual(parseClock('07:30'), { hours: 7, minutes: 30 });
});

test('no copy shames an unfinished day', () => {
  const english = JSON.parse(readFileSync(new URL('../src/localization/locales/en.json', import.meta.url), 'utf8'));
  const lines = Object.entries(english).filter(([key]) => key.startsWith('plan.')).map(([, value]) => value).join(' ');
  assert.doesNotMatch(lines, /\b(fail|failed|missed|behind|lazy|should have|overdue|streak)\b/i);
});

test('the empty places count down as tasks arrive, and never go negative', async () => {
  const { planSlots, PLAN_SUGGESTED } = await import('../src/features/plan/plan-core.ts');
  assert.equal(PLAN_SUGGESTED, 3);
  assert.deepEqual(planSlots(0), [1, 2, 3]);
  assert.deepEqual(planSlots(1), [2, 3]);
  assert.deepEqual(planSlots(3), []);
  assert.deepEqual(planSlots(7), []);
});

test('wrapping up only asks for attention in the evening or once everything is done', async () => {
  const { wrapIsDue } = await import('../src/features/plan/plan-core.ts');
  assert.equal(wrapIsDue('morning', 1, 5), false);
  assert.equal(wrapIsDue('afternoon', 4, 5), false);
  assert.equal(wrapIsDue('evening', 0, 5), true);
  assert.equal(wrapIsDue('morning', 5, 5), true);
  assert.equal(wrapIsDue('morning', 0, 0), false, 'an empty day has nothing to finish');
});

test('what is left to do stands out, and what is finished steps back', () => {
  const row = readFileSync(new URL('../src/features/plan/plan-task-row.tsx', import.meta.url), 'utf8');
  assert.match(row, /done \? null : \{ backgroundColor: surfaces\.card/);
});

test('the date follows the header ink, so it reads on a dark desk', () => {
  const screen = readFileSync(new URL('../src/features/plan/plan-screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /color: headerInk\.banded \? PAPER_INK : headerInk\.ink/);
  assert.doesNotMatch(screen, /dateTitle: \{ color:/);
});

test('Chits’ hand rests on the paper inside the hero, so it is never cropped', () => {
  const hero = readFileSync(new URL('../src/features/plan/plan-hero.tsx', import.meta.url), 'utf8');
  assert.match(hero, /height: heroHeight \+ HAND_ROOM/);
});
