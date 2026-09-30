import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/backup-runtime.mjs';

const { updateTimelineReminders } = await loadModule('src/services/chat-reminder-state.ts');

const thought = (id) => ({ kind: 'message', createdAt: 1, message: { id, text: id, reminderAt: null, attachments: [], organization: null } });

test('unchanged reminder refresh preserves a long timeline and every row reference', () => {
  const feed = Array.from({ length: 10_000 }, (_, index) => thought(String(index)));
  const states = new Map(feed.map(({ message }) => [message.id, { messageId: message.id, reminderAt: null, cardId: null, cardReminderAt: null }]));
  assert.equal(updateTimelineReminders(feed, states), feed);
  states.set('4500', { messageId: '4500', reminderAt: 123, cardId: null, cardReminderAt: null });
  const updated = updateTimelineReminders(feed, states);
  assert.equal(updated.filter((item, index) => item !== feed[index]).length, 1);
  assert.equal(updated[4500].message.reminderAt, 123);
  assert.equal(updated[4500].message.attachments, feed[4500].message.attachments);
  assert.equal(updateTimelineReminders(updated, states), updated);
});

test('linked card reminder updates preserve message content, events, and cleared state', () => {
  const item = thought('note');
  item.message.organization = { cardId: 'card', boardId: 'board', boardName: 'Work', columnId: 'column', columnName: 'Tasks', reminderAt: 123 };
  const event = { kind: 'event', createdAt: 1, event: { id: 'event' } };
  const feed = [event, item];
  const states = new Map([['note', { messageId: 'note', reminderAt: null, cardId: 'card', cardReminderAt: null }]]);
  const updated = updateTimelineReminders(feed, states);
  assert.equal(updated[0], event);
  assert.equal(updated[1].message.organization.reminderAt, null);
  assert.equal(updated[1].message.text, item.message.text);
  assert.equal(updated[1].message.attachments, item.message.attachments);
  assert.equal(updateTimelineReminders(updated, states), updated);
  assert.equal(updateTimelineReminders(feed, new Map()), feed, 'a missing state cannot erase unrelated message data');
});
