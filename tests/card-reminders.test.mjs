import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { formatReminder, isValidReminderTime, reminderQuickOptions, withDate, withTime } from '../src/services/reminder-time.ts';
import { planReminderSync, reminderBody } from '../src/services/reminder-content.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test('quick options: later today, tomorrow and the weekend', () => {
  // Wednesday 10:00 → today 6 PM, tomorrow 9 AM, Saturday 9 AM.
  const wed = reminderQuickOptions(local(2026, 9, 30, 10));
  assert.deepEqual(wed.map((o) => [o.key, o.label, o.date.getTime()]), [
    ['later-today', 'Later today', local(2026, 9, 30, 18).getTime()],
    ['tomorrow', 'Tomorrow', local(2026, 10, 1, 9).getTime()],
    ['weekend', 'This weekend', local(2026, 10, 3, 9).getTime()],
  ]);
  // 4:20 PM → 3 hours ahead on the hour (8 PM); 9:30 PM → no "Later today".
  assert.equal(reminderQuickOptions(local(2026, 9, 30, 16, 20))[0].date.getTime(), local(2026, 9, 30, 20).getTime());
  assert.equal(reminderQuickOptions(local(2026, 9, 30, 21, 30))[0].key, 'tomorrow');
  // Saturday → Sunday 9 AM; Sunday → next Saturday, labelled "Next weekend".
  assert.equal(reminderQuickOptions(local(2026, 10, 3, 8)).at(-1).date.getTime(), local(2026, 10, 4, 9).getTime());
  const sunday = reminderQuickOptions(local(2026, 10, 4, 8)).at(-1);
  assert.equal(sunday.label, 'Next weekend');
  assert.equal(sunday.date.getTime(), local(2026, 10, 10, 9).getTime());
});

test('past or immediate times are rejected, and date/time edits keep the other half', () => {
  const now = local(2026, 9, 30, 10);
  assert.equal(isValidReminderTime(local(2026, 9, 30, 9, 59), now), false);
  assert.equal(isValidReminderTime(new Date(now.getTime() + 30 * 1000), now), false);
  assert.equal(isValidReminderTime(local(2026, 9, 30, 10, 5), now), true);
  assert.equal(isValidReminderTime(new Date(NaN), now), false);
  const value = local(2026, 9, 30, 20, 15);
  assert.equal(withDate(value, 2026, 11, 2).getTime(), local(2026, 12, 2, 20, 15).getTime());
  assert.equal(withTime(value, 7, 5).getTime(), local(2026, 9, 30, 7, 5).getTime());
});

test('labels read naturally', () => {
  const now = local(2026, 9, 30, 10);
  assert.equal(formatReminder(local(2026, 9, 30, 20), now, 'en-US'), 'Today, 8:00 PM');
  assert.equal(formatReminder(local(2026, 10, 1, 9), now, 'en-US'), 'Tomorrow, 9:00 AM');
  assert.equal(formatReminder(local(2026, 10, 12, 20), now, 'en-US'), 'Oct 12, 8:00 PM');
  assert.equal(formatReminder(local(2027, 1, 3, 9), now, 'en-US'), 'Jan 3, 2027, 9:00 AM');
});

test('notification text never exposes hidden notes or file details', () => {
  assert.equal(reminderBody({ hidden: false, text: 'Review the quotation draft', title: null, attachmentType: null }), 'Review the quotation draft');
  assert.equal(reminderBody({ hidden: false, text: '  line one\n\nline   two ', title: null, attachmentType: null }), 'line one line two');
  const long = reminderBody({ hidden: false, text: 'word '.repeat(60), title: null, attachmentType: null });
  assert.ok(long.length <= 110 && long.endsWith('…'));
  assert.equal(reminderBody({ hidden: true, text: 'my bank PIN is 1234', title: 'PIN', attachmentType: null }), 'A hidden note');
  assert.equal(reminderBody({ hidden: false, text: null, title: null, attachmentType: 'file' }), 'A file note');
  assert.equal(reminderBody({ hidden: false, text: null, title: 'Groceries', attachmentType: 'photo' }), 'Groceries');
});

test('sync clears fired or orphaned reminders and reschedules missing or stale ones', () => {
  const now = 1_000;
  const row = (cardId, overrides = {}) => ({ cardId, scheduledAt: 5_000, notificationId: `n-${cardId}`, cardActive: true, body: 'Text', ...overrides });
  const plan = planReminderSync(
    [row('kept'), row('fired', { scheduledAt: 900 }), row('archived', { cardActive: false }), row('missing'), row('edited', { body: 'New text' }), row('restored', { notificationId: null })],
    [
      { identifier: 'n-kept', cardId: 'kept', body: 'Text' },
      { identifier: 'n-edited', cardId: 'edited', body: 'Text' },
      { identifier: 'n-archived', cardId: 'archived', body: 'Text' },
      { identifier: 'n-gone-card', cardId: 'deleted-card', body: 'Text' },
      { identifier: 'n-duplicate', cardId: 'kept', body: 'Text' },
    ],
    now,
  );
  assert.deepEqual(plan.deleteRows.sort(), ['archived', 'fired']);
  assert.deepEqual(plan.schedule.map((item) => item.cardId).sort(), ['edited', 'missing', 'restored']);
  assert.deepEqual(plan.cancel.sort(), ['n-archived', 'n-duplicate', 'n-edited', 'n-gone-card']);
});

test('card_reminders: one per card, and deleting the card removes its reminder', async () => {
  const { CARD_REMINDERS_SCHEMA } = await import('../src/db/migrations.ts').catch(() => ({}));
  const schema = CARD_REMINDERS_SCHEMA ?? read('src/db/migrations.ts').match(/CARD_REMINDERS_SCHEMA = '([^']+)'/)[1];
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE cards (id TEXT PRIMARY KEY);');
  db.exec(schema);
  db.exec("INSERT INTO cards VALUES ('c1'); INSERT INTO card_reminders VALUES ('c1', 10, 'n1', 1, 1);");
  // The upsert used by the app replaces rather than duplicates.
  db.prepare('INSERT INTO card_reminders (card_id, scheduled_at, notification_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(card_id) DO UPDATE SET scheduled_at = excluded.scheduled_at, notification_id = excluded.notification_id, updated_at = excluded.updated_at').run('c1', 20, 'n2', 2, 2);
  assert.deepEqual({ ...db.prepare('SELECT scheduled_at, notification_id FROM card_reminders').get() }, { scheduled_at: 20, notification_id: 'n2' });
  db.exec("DELETE FROM cards WHERE id = 'c1'");
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_reminders').get().n, 0);
});

test('reminder wiring: permission only on first set, deep link, and cleanup on delete', () => {
  const service = read('src/services/reminders.native.ts');
  // Asked only from setCardReminder (a Set Reminder tap), via the shared check-then-prompt logic.
  assert.match(service, /const access = await ensureNotificationPermission\(\);/);
  assert.match(service, /return resolvePermission\(/);
  assert.equal(service.match(/requestPermissionsAsync/g).length, 1);
  assert.match(service, /data: \{ type: REMINDER_NOTIFICATION_TYPE, cardId, url: `\/card\/\$\{cardId\}` \}/);
  assert.match(service, /handle\(Notifications\.getLastNotificationResponse\(\)\);/);
  const layout = read('src/app/_layout.tsx');
  assert.doesNotMatch(layout, /requestNotificationPermission|requestPermissionsAsync/);
  assert.match(layout, /if \(pathnameRef\.current === `\/card\/\$\{cardId\}`\) return;/);
  const repository = read('src/db/repositories.ts');
  assert.match(repository, /DELETE FROM card_reminders WHERE card_id = \?', cardId\);\s*const result = await transaction\.runAsync\('DELETE FROM cards WHERE id = \?'/);
  const detail = read('src/app/card/[id].native.tsx');
  assert.match(detail, /repository\.deleteCard\(id\);[\s\S]*?void requestReminderSync\(\);/);
});

test('the Android reminder channel uses the system sound (no custom sound file)', () => {
  const service = read('src/services/reminders.native.ts');
  const channel = service.match(/setNotificationChannelAsync\(CHANNEL_ID, \{([\s\S]*?)\}\)/)[1];
  assert.doesNotMatch(channel, /\bsound:/);
});
