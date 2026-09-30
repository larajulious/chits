import type { Message, MessageReminderState, TimelineItem } from '../db/types';

export function updateMessageReminder(message: Message, state: MessageReminderState | undefined): Message {
  if (!state) return message;
  const organization = message.organization;
  const cardChanged = organization?.cardId === state.cardId && organization != null
    && (organization.reminderAt ?? null) !== state.cardReminderAt;
  if ((message.reminderAt ?? null) === state.reminderAt && !cardChanged) return message;
  return {
    ...message,
    reminderAt: state.reminderAt,
    ...(cardChanged ? { organization: { ...organization, reminderAt: state.cardReminderAt } } : {}),
  };
}

// Preserve both row and list identity when nothing changed, so a reminder sync
// does not cause FlatList to update every mounted message or media preview.
export function updateTimelineReminders(items: TimelineItem[], states: Map<string, MessageReminderState>): TimelineItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.kind !== 'message') return item;
    const message = updateMessageReminder(item.message, states.get(item.message.id));
    if (message === item.message) return item;
    changed = true;
    return { ...item, message };
  });
  return changed ? next : items;
}
