import { tr } from '@/localization/runtime';
import * as Notifications from './local-notifications.native';
import { ensureReminderChannel, ensureNotificationPermission } from './reminders.native';
import { advanceFocus, type FocusPreferences, type FocusSession } from './focus-timer';
import { isBackupOperationActive } from './backup-operation';

const TYPE = 'chits-focus';
let queue = Promise.resolve();
export async function enableFocusNotifications() {
  return await ensureNotificationPermission() === 'granted';
}
// Reuse the local-only notification adapter and existing permission/channel
// flow. Focus IDs and notification type are distinct from note reminders.
export function syncFocusNotifications(session: FocusSession | null, preferences: FocusPreferences) {
  queue = queue.catch(() => undefined).then(async () => {
    const now = Date.now();
    const current = session ? advanceFocus(session, now) : null;
    const due = current?.status === 'running' && current.planned_ms !== null && preferences.notifications
      ? now + current.planned_ms - current.focused_ms : null;
    const identifier = current && due ? `${TYPE}:${current.id}` : null;
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((item) => item.content.data?.type === TYPE);
    for (const item of scheduled) if (item.identifier !== identifier || !due || item.content.data?.endsAt !== due) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    if (!identifier || !due || due <= now || scheduled.some((item) => item.identifier === identifier && item.content.data?.endsAt === due)) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return;
    await ensureReminderChannel();
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: tr('focus.title'), body: tr('focus.notificationBody'), data: { type: TYPE, sessionId: current!.id, noteKey: current!.note_key, endsAt: due } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(due), channelId: 'reminders' },
    });
  });
  return queue;
}
export function observeFocusNotifications(open: (id: string, noteKey: string) => void) {
  const consume = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data;
    if (isBackupOperationActive() || data?.type !== TYPE || typeof data.sessionId !== 'string' || typeof data.noteKey !== 'string') return;
    open(data.sessionId, data.noteKey);
    Notifications.clearLastNotificationResponse();
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(consume);
  consume(Notifications.getLastNotificationResponse());
  return () => subscription.remove();
}
