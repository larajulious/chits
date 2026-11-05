import { tr } from '@/localization/runtime';
import { isBackupOperationActive } from '@/services/backup-operation';
import * as Notifications from '@/services/local-notifications.native';
import { ensureReminderChannel } from '@/services/reminders.native';
import { planNudges, type PlanNotificationSettings } from './plan-core';

// Reuses the app's local notifications and channel. These carry their own type,
// so note reminders are never touched by this sync, or this by theirs.
const TYPE = 'chits-plan';
let queue = Promise.resolve();

type Wanted = { identifier: string; at: number; title: string; body: string; target: 'plan' | 'wrap' };

export function syncPlanNotifications({ settings, hasPlan, wrapped, tasks }: { settings: PlanNotificationSettings; hasPlan: boolean; wrapped: boolean; tasks: { id: string; title: string; reminderAt: number }[] }) {
  queue = queue.catch(() => undefined).then(async () => {
    if (isBackupOperationActive()) return;
    const now = new Date();
    const wanted: Wanted[] = [
      ...planNudges(settings, { hasPlan, wrapped }, now).map((nudge) => ({ identifier: `${TYPE}:${nudge.id}`, at: nudge.at, title: 'Chits', body: tr(nudge.kind === 'morning' ? 'plan.hero.morning' : 'plan.notify.evening'), target: nudge.kind === 'morning' ? 'plan' as const : 'wrap' as const })),
      ...tasks.filter((task) => task.reminderAt > now.getTime()).map((task) => ({ identifier: `${TYPE}:task:${task.id}:${task.reminderAt}`, at: task.reminderAt, title: 'Chits', body: task.title, target: 'plan' as const })),
    ];
    const keep = new Set(wanted.map((item) => item.identifier));
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((item) => item.content.data?.type === TYPE);
    for (const item of scheduled) if (!keep.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined);
    if (!wanted.length) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return;
    await ensureReminderChannel();
    const existing = new Set(scheduled.map((item) => item.identifier));
    for (const item of wanted) {
      if (existing.has(item.identifier)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: item.identifier,
        content: { title: item.title, body: item.body, data: { type: TYPE, target: item.target } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.at), channelId: 'reminders' },
      }).catch(() => undefined);
    }
  });
  return queue;
}

export function observePlanNotifications(open: (target: 'plan' | 'wrap') => void) {
  const consume = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data;
    if (data?.type !== TYPE) return;
    open(data.target === 'wrap' ? 'wrap' : 'plan');
    Notifications.clearLastNotificationResponse();
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(consume);
  consume(Notifications.getLastNotificationResponse());
  return () => subscription.remove();
}
