import assert from 'node:assert/strict';
import test from 'node:test';

import { loadModule, migration, runtime } from './helpers/backup-runtime.mjs';

const calendar = await loadModule('src/features/calendar/calendar-data.ts');
const schedule = await loadModule('src/features/calendar/calendar-schedule.ts');

async function seeded(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('calendar-entries.db');
  await migration.migrateDatabase(db);
  await db.runAsync("INSERT INTO boards (id, name, created_at, updated_at) VALUES ('b', 'Work', 1, 1)");
  await db.runAsync("INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES ('col', 'b', 'Notes', 0, 1, 1)");
  await db.runAsync("INSERT INTO cards (id, board_id, column_id, title, position, created_at, updated_at) VALUES ('c', 'b', 'col', 'Quarterly review', 0, 1, 1)");
  await db.runAsync("INSERT INTO messages (id, text, type, created_at, updated_at) VALUES ('m1', 'Submit project proposal', 'text', 1, 1), ('m2', 'Dentist', 'text', 2, 2), ('m3', 'Call Mom', 'text', 3, 3), ('plain', 'Never scheduled', 'text', 4, 4)");
  return { env, db };
}

test('planned notes show on their day, reminder-only notes on the reminder day, each note once', async (t) => {
  const { db } = await seeded(t);
  await calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2026-10-15', startMinute: 9 * 60, endMinute: 10 * 60 }, 15);
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'm1', new Date(2026, 9, 15, 8, 45).getTime());
  await calendar.saveCalendarEntry(db, { kind: 'message', id: 'm2' }, { dateKey: '2026-10-15', startMinute: null, endMinute: null }, null);
  await calendar.saveCalendarEntry(db, { kind: 'card', id: 'c' }, { dateKey: '2026-10-15', startMinute: 14 * 60, endMinute: null }, null);
  // Reminder-only note: shown on the reminder's day; a note with neither never shows.
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'm3', new Date(2026, 9, 16, 18).getTime());

  const items = await calendar.getCalendarItems(db);
  assert.deepEqual(items.map((item) => [item.key, item.dateKey, item.type]), [
    ['message:m2', '2026-10-15', 'note'],
    ['message:m1', '2026-10-15', 'note'],
    ['card:c', '2026-10-15', 'card'],
    ['message:m3', '2026-10-16', 'reminder'],
  ]);
  const m1 = items.find((item) => item.id === 'm1');
  assert.equal(m1.reminderOffset, 15);
  assert.equal(m1.reminderAt, new Date(2026, 9, 15, 8, 45).getTime());
  assert.equal(items.find((item) => item.id === 'm2').allDay, true);
  // Only a card's own title counts as a title; a Chat note's first line doesn't.
  assert.equal(items.find((item) => item.id === 'c').hasTitle, true);
  assert.equal(m1.hasTitle, false);
  await db.runAsync("UPDATE cards SET title = '  ' WHERE id = 'c'");
  assert.equal((await calendar.getCalendarItems(db)).find((item) => item.id === 'c').hasTitle, false);
  await db.runAsync("UPDATE cards SET title = 'Quarterly review' WHERE id = 'c'");
  assert.equal(items.filter((item) => item.id === 'm1').length, 1, 'a planned note with a reminder is not duplicated');
  // Taps open card details: a card is its own; a Chat note uses the card it was organized into, if any.
  assert.equal(items.find((item) => item.id === 'c').cardId, 'c');
  assert.equal(m1.cardId, null);
  await db.runAsync("INSERT INTO card_messages (card_id, message_id, position) VALUES ('c', 'm1', 0)");
  assert.equal((await calendar.getCalendarItems(db)).find((item) => item.id === 'm1').cardId, 'c');

  // Month-range queries include both bounds and leave other days out.
  assert.deepEqual((await calendar.getCalendarItems(db, { from: '2026-10-16', to: '2026-10-31' })).map((item) => item.id), ['m3']);
  assert.equal((await calendar.getCalendarItems(db, { from: '2026-11-01', to: '2026-11-30' })).length, 0);
});

test('moving, re-saving and removing an entry keeps one row per note; deleting the note removes it', async (t) => {
  const { db } = await seeded(t);
  const note = { kind: 'message', id: 'm1' };
  await calendar.saveCalendarEntry(db, note, { dateKey: '2026-10-15', startMinute: null, endMinute: null }, null);
  await calendar.saveCalendarEntry(db, note, { dateKey: '2026-10-20', startMinute: 600, endMinute: 630 }, 5);
  await calendar.saveCalendarEntry(db, note, { dateKey: '2026-10-20', startMinute: 600, endMinute: 630 }, 5);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM calendar_entries')).count, 1);
  assert.deepEqual({ ...await calendar.getCalendarEntry(db, note) }, { dateKey: '2026-10-20', startMinute: 600, endMinute: 630, reminderOffset: 5 });

  // Soft-deleted and archived notes leave the calendar.
  await db.runAsync("UPDATE messages SET archived_at = 5 WHERE id = 'm1'");
  assert.equal((await calendar.getCalendarItems(db)).length, 0);
  await db.runAsync("UPDATE messages SET archived_at = NULL WHERE id = 'm1'");
  assert.equal((await calendar.getCalendarItems(db)).length, 1);

  await calendar.removeCalendarEntry(db, note);
  assert.equal(await calendar.getCalendarEntry(db, note), null);
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) AS count FROM messages WHERE id = 'm1'")).count, 1, 'removing from the calendar keeps the note');

  await calendar.saveCalendarEntry(db, { kind: 'card', id: 'c' }, { dateKey: '2026-10-21', startMinute: null, endMinute: null }, null);
  await db.runAsync("DELETE FROM cards WHERE id = 'c'");
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM calendar_entries')).count, 0, 'entries cascade with their note');
});

test('the schema rejects impossible schedules', async (t) => {
  const { db } = await seeded(t);
  await assert.rejects(calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2026-02-30', startMinute: null, endMinute: null }, null));
  await assert.rejects(calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2026-10-15', startMinute: 600, endMinute: 500 }, null));
  await assert.rejects(db.runAsync("INSERT INTO calendar_entries (id, message_id, card_id, date_key, created_at, updated_at) VALUES ('x', 'm1', 'c', '2026-10-15', 1, 1)"));
  await assert.rejects(db.runAsync("INSERT INTO calendar_entries (id, message_id, date_key, start_minute, created_at, updated_at) VALUES ('x', 'm1', '2026-10-15', 1440, 1, 1)"));
  // Leap day is a real date.
  await calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2028-02-29', startMinute: null, endMinute: null }, null);
  assert.deepEqual((await calendar.getCalendarItems(db, { from: '2028-02-01', to: '2028-02-29' })).map((item) => item.dateKey), ['2028-02-29']);
});

test('relative reminders follow local wall-clock time and only move pending, future ones', () => {
  const s = { dateKey: '2026-10-15', startMinute: 9 * 60, endMinute: null };
  assert.equal(schedule.reminderTimeForOffset(s, 15), new Date(2026, 9, 15, 8, 45).getTime());
  assert.equal(schedule.reminderTimeForOffset(s, 24 * 60), new Date(2026, 9, 14, 9).getTime());
  assert.equal(schedule.reminderTimeForOffset({ dateKey: '2026-10-15', startMinute: null, endMinute: null }, 0), new Date(2026, 9, 15, 9).getTime());
  // A DST change between "1 day before" and the note keeps the wall-clock time (built from parts, not ms).
  const dstNote = { dateKey: '2026-03-09', startMinute: 9 * 60, endMinute: null };
  assert.equal(new Date(schedule.reminderTimeForOffset(dstNote, 24 * 60)).getHours(), 9);

  const now = new Date(2026, 9, 1).getTime();
  const expected = schedule.reminderTimeForOffset(s, 15);
  const rows = [
    { kind: 'message', id: 'same', schedule: s, offset: 15, reminderAt: expected },
    { kind: 'message', id: 'shifted', schedule: s, offset: 15, reminderAt: expected + 3 * 3600_000 },
    { kind: 'card', id: 'fired', schedule: s, offset: 15, reminderAt: now - 1 },
  ];
  assert.deepEqual(schedule.planScheduleReminderUpdates(rows, now), [{ kind: 'message', id: 'shifted', scheduledAt: expected }]);
});

test('reminder reconciliation moves a stored instant and clears its notification for rescheduling', async (t) => {
  const { db } = await seeded(t);
  await calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2099-10-15', startMinute: 540, endMinute: null }, 15);
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, notification_id, created_at, updated_at) VALUES (?, ?, ?, 1, 1)', 'm1', new Date(2099, 9, 15, 5).getTime(), 'old-notification');
  const updates = schedule.planScheduleReminderUpdates(await calendar.listScheduledReminders(db), Date.now());
  assert.equal(updates.length, 1);
  await calendar.moveReminderTimes(db, updates);
  const row = await db.getFirstAsync("SELECT scheduled_at AS scheduledAt, notification_id AS notificationId FROM message_reminders WHERE message_id = 'm1'");
  assert.deepEqual({ ...row }, { scheduledAt: new Date(2099, 9, 15, 8, 45).getTime(), notificationId: null });
  assert.equal(schedule.planScheduleReminderUpdates(await calendar.listScheduledReminders(db), Date.now()).length, 0, 'idempotent');
});

test('month grids, week starts and navigation across year boundaries and leap years', () => {
  // October 2026 starts on a Thursday: Sunday-start grid begins Sep 27, 5 weeks.
  const october = schedule.monthGrid(2026, 9, 0);
  assert.equal(schedule.localDayKey(october.start), '2026-09-27');
  assert.equal(october.weeks, 5);
  // Monday-start grid begins Sep 28.
  assert.equal(schedule.localDayKey(schedule.monthGrid(2026, 9, 1).start), '2026-09-28');
  // August 2026 needs six rows (starts Saturday, 31 days).
  assert.equal(schedule.monthGrid(2026, 7, 0).weeks, 6);
  // February 2026 fits four weeks on a Sunday start but is padded to five.
  assert.equal(schedule.monthGrid(2026, 1, 0).weeks, 5);
  assert.deepEqual(schedule.monthGridRange(2026, 9, 0), { from: '2026-09-27', to: '2026-10-31' });

  assert.equal(schedule.localDayKey(schedule.addLocalMonths(new Date(2026, 11, 15), 1)), '2027-01-15');
  assert.equal(schedule.localDayKey(schedule.addLocalMonths(new Date(2027, 0, 31), 1)), '2027-02-28');
  assert.equal(schedule.localDayKey(schedule.addLocalMonths(new Date(2028, 0, 31), 1)), '2028-02-29');
  assert.equal(schedule.localDayKey(schedule.addLocalMonths(new Date(2028, 1, 29), 12)), '2029-02-28');
  assert.deepEqual(schedule.monthFromIndex(schedule.monthIndex(new Date(2026, 11, 1)) + 1), { year: 2027, month: 0 });

  assert.equal(schedule.weekStartFromLocale(2), 1);
  assert.equal(schedule.weekStartFromLocale(null), 0);
  assert.deepEqual(schedule.weekdayOrder(1), [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(schedule.localDayKey(schedule.startOfWeek(new Date(2026, 9, 13), 1)), '2026-10-12');
  assert.equal(schedule.parseDayKey('2026-02-29'), null);
  assert.ok(schedule.parseDayKey('2028-02-29'));
});

test('cells keep a line for "+N more", and overlapping timed notes share lanes', () => {
  assert.deepEqual(schedule.cellCapacity(2, 3), { shown: 2, more: 0 });
  assert.deepEqual(schedule.cellCapacity(3, 3), { shown: 3, more: 0 });
  assert.deepEqual(schedule.cellCapacity(5, 3), { shown: 2, more: 3 });
  assert.deepEqual(schedule.cellCapacity(4, 0), { shown: 0, more: 4 });

  const lanes = schedule.layoutDayLanes([
    { key: 'a', start: 540, end: 600 }, { key: 'b', start: 570, end: 630 }, { key: 'c', start: 600, end: 660 }, { key: 'd', start: 700, end: 720 },
  ]);
  assert.deepEqual(Object.fromEntries(lanes), { a: { lane: 0, lanes: 2 }, b: { lane: 1, lanes: 2 }, c: { lane: 0, lanes: 2 }, d: { lane: 0, lanes: 1 } });
});

test('"Existing note" lists only notes the calendar doesn’t show yet', async (t) => {
  const { db } = await seeded(t);
  const repositories = await loadModule('src/db/repositories');
  const ids = async (term) => (await repositories.listNoteCandidates(db, 'calendar', term)).map((item) => `${item.kind}:${item.id}`).sort();
  assert.deepEqual(await ids(), ['card:c', 'thought:m1', 'thought:m2', 'thought:m3', 'thought:plain']);
  await calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2026-10-15', startMinute: null, endMinute: null }, null);
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'm2', 4102444800000);
  await db.runAsync('INSERT INTO card_reminders (card_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'c', 4102444800000);
  assert.deepEqual(await ids(), ['thought:m3', 'thought:plain']);
  // A completed reminder frees the note again; search narrows by words.
  await db.runAsync("UPDATE message_reminders SET completed_at = 5 WHERE message_id = 'm2'");
  assert.deepEqual(await ids('dentist'), ['thought:m2']);
  // Spaces keep their own rule: only notes not stuck on a space.
  assert.equal((await repositories.listNoteCandidates(db, 'space')).length, 5);
});

test('a planned note whose reminder is on another day shows on both days, and once when they match', async (t) => {
  const { db } = await seeded(t);
  // Planned today (Oct 13), reminded tomorrow (Oct 14) at 9:00.
  await calendar.saveCalendarEntry(db, { kind: 'message', id: 'm1' }, { dateKey: '2026-10-13', startMinute: null, endMinute: null }, null);
  await db.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, created_at, updated_at) VALUES (?, ?, 1, 1)', 'm1', new Date(2026, 9, 14, 9).getTime());
  let items = await calendar.getCalendarItems(db, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(items.map((item) => [item.key, item.dateKey, item.occurrence, item.type]), [
    ['message:m1', '2026-10-13', 'plan', 'note'],
    ['message:m1:reminder', '2026-10-14', 'reminder', 'reminder'],
  ]);
  const reminder = items[1];
  assert.equal(reminder.scheduledAt, new Date(2026, 9, 14, 9).getTime());
  assert.deepEqual({ ...reminder.plan }, { dateKey: '2026-10-13', startMinute: null, endMinute: null }, 'it still knows the note’s own day');
  assert.equal(reminder.allDay, false);

  // A range holding only the reminder's day still finds it; one holding only the plan finds just the plan.
  assert.deepEqual((await calendar.getCalendarItems(db, { from: '2026-10-14', to: '2026-10-14' })).map((item) => item.key), ['message:m1:reminder']);
  assert.deepEqual((await calendar.getCalendarItems(db, { from: '2026-10-13', to: '2026-10-13' })).map((item) => item.key), ['message:m1']);

  // Same day: a single item carrying the bell.
  await db.runAsync('UPDATE message_reminders SET scheduled_at = ? WHERE message_id = ?', new Date(2026, 9, 13, 8).getTime(), 'm1');
  items = await calendar.getCalendarItems(db);
  assert.deepEqual(items.map((item) => item.key), ['message:m1']);
  assert.equal(items[0].reminderAt, new Date(2026, 9, 13, 8).getTime());
});
