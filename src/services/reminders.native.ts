import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createReminderRepository } from '@/db/repositories';
import { planReminderSync, reminderBody, REMINDER_NOTIFICATION_TYPE, REMINDER_TITLE, type ScheduledReminder } from '@/services/reminder-content';

const CHANNEL_ID = 'reminders';

// ---------------------------------------------------------------------------
// Change notifications: screens showing reminder state (Card details, card
// lists) reload when a reminder is set, removed, fires or is reconciled.
type Listener = () => void;
let listeners: Listener[] = [];
export function subscribeToReminderChanges(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((entry) => entry !== listener); };
}
function emitReminderChange() { for (const listener of listeners) listener(); }

// ---------------------------------------------------------------------------
// Platform setup.

// Show reminders even while Chits is open (otherwise iOS/Android suppress them).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelReady: Promise<void> | null = null;
/** Android 8+: reminders get their own channel, which the user can tune in system settings. */
export function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    description: 'Reminders you set on your Chits cards',
    importance: Notifications.AndroidImportance.HIGH,
    // No `sound`: on a channel it names a bundled custom file; leaving it out
    // uses the device's default notification sound.
    vibrationPattern: [0, 250, 150, 250],
  }).then(() => undefined).catch((error) => { channelReady = null; throw error; });
  return channelReady;
}

const isGranted = (permission: Notifications.NotificationPermissionsStatus) =>
  permission.granted
  || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  || permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;

/** Current permission, without ever prompting. */
export async function hasNotificationPermission(): Promise<boolean> {
  return isGranted(await Notifications.getPermissionsAsync());
}

/**
 * Asks for notification permission only when it hasn't been decided yet —
 * called the first time the user sets a reminder, never at launch. Once the
 * user has declined, the system won't show the prompt again, so neither do we;
 * the caller explains and offers Settings instead.
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  // Android 13 only shows its permission prompt once a channel exists.
  await ensureReminderChannel();
  const current = await Notifications.getPermissionsAsync();
  if (isGranted(current)) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const next = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return isGranted(next) ? 'granted' : 'denied';
}

async function scheduleNotification(cardId: string, scheduledAt: number, body: string): Promise<string> {
  await ensureReminderChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: REMINDER_TITLE,
      body,
      sound: 'default',
      data: { type: REMINDER_NOTIFICATION_TYPE, cardId, url: `/card/${cardId}` },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(scheduledAt), channelId: CHANNEL_ID },
  });
}

async function cancelNotification(identifier: string | null | undefined) {
  if (!identifier) return;
  // Already delivered or already cancelled is fine — nothing left to remove.
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
}

async function scheduledReminders(): Promise<ScheduledReminder[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .filter((request) => request.content.data?.type === REMINDER_NOTIFICATION_TYPE)
    .map((request) => ({ identifier: request.identifier, cardId: typeof request.content.data?.cardId === 'string' ? request.content.data.cardId : null, body: request.content.body ?? null }));
}

// ---------------------------------------------------------------------------
// Setting and removing.

export type SetReminderResult = { ok: true } | { ok: false; reason: 'permission' | 'failed' };

/**
 * Sets (or changes) a card's reminder: permission first, then the new local
 * notification is scheduled before the old one is cancelled and the record is
 * saved, so a failure never leaves the card without its previous reminder.
 */
export async function setCardReminder(database: SQLiteDatabase, cardId: string, scheduledAt: number): Promise<SetReminderResult> {
  try {
    if (await requestNotificationPermission() !== 'granted') return { ok: false, reason: 'permission' };
    const repository = createReminderRepository(database);
    const previous = await repository.get(cardId);
    const source = (await repository.listForSync()).find((row) => row.cardId === cardId);
    const body = reminderBody({ hidden: Boolean(source?.hidden), text: source?.text ?? null, title: source?.title ?? null, attachmentType: source?.attachmentType ?? null });
    const identifier = await scheduleNotification(cardId, scheduledAt, body);
    try {
      await repository.save(cardId, scheduledAt, identifier);
    } catch (error) {
      await cancelNotification(identifier);
      throw error;
    }
    if (previous?.notificationId && previous.notificationId !== identifier) await cancelNotification(previous.notificationId);
    // Also catches any duplicate left over for this card.
    for (const item of await scheduledReminders()) if (item.cardId === cardId && item.identifier !== identifier) await cancelNotification(item.identifier);
    emitReminderChange();
    return { ok: true };
  } catch (error) {
    console.warn('[reminders] could not set reminder', { cardId, error });
    return { ok: false, reason: 'failed' };
  }
}

export async function removeCardReminder(database: SQLiteDatabase, cardId: string): Promise<void> {
  const repository = createReminderRepository(database);
  const existing = await repository.get(cardId);
  await cancelNotification(existing?.notificationId);
  for (const item of await scheduledReminders().catch(() => [])) if (item.cardId === cardId) await cancelNotification(item.identifier);
  await repository.remove(cardId);
  emitReminderChange();
}

// ---------------------------------------------------------------------------
// Keeping the record and the device in step (see planReminderSync).

let syncDatabase: SQLiteDatabase | null = null;
let running: Promise<void> | null = null;
let rerun = false;

/** Registered by the root layout with the live database (again after a restore). */
export function registerReminderDatabase(database: SQLiteDatabase | null) {
  syncDatabase = database;
}

async function runSync(database: SQLiteDatabase) {
  const repository = createReminderRepository(database);
  const rows = await repository.listForSync();
  const scheduled = await scheduledReminders();
  const plan = planReminderSync(rows.map((row) => ({
    cardId: row.cardId,
    scheduledAt: row.scheduledAt,
    notificationId: row.notificationId,
    cardActive: row.cardActive === 1,
    body: reminderBody({ hidden: row.hidden === 1, text: row.text, title: row.title, attachmentType: row.attachmentType }),
  })), scheduled, Date.now());
  const changed = plan.deleteRows.length > 0 || plan.cancel.length > 0 || plan.schedule.length > 0;
  for (const identifier of plan.cancel) await cancelNotification(identifier);
  await repository.deleteMany(plan.deleteRows);
  if (plan.schedule.length) {
    // Never prompts here: without permission the reminder stays recorded (the
    // card shows that notifications are off) and is scheduled once allowed.
    const allowed = await hasNotificationPermission();
    for (const item of plan.schedule) {
      if (!allowed) { await repository.setNotificationId(item.cardId, null); continue; }
      try {
        await repository.setNotificationId(item.cardId, await scheduleNotification(item.cardId, item.scheduledAt, item.body));
      } catch (error) {
        console.warn('[reminders] could not reschedule', { cardId: item.cardId, error });
      }
    }
  }
  if (changed) emitReminderChange();
}

/**
 * Reconciles reminders with the device. Safe to call often (app start, return
 * to foreground, after deleting/hiding/editing cards): runs are serialized and
 * a call made during a run triggers exactly one more.
 */
export function requestReminderSync(): Promise<void> {
  const database = syncDatabase;
  if (!database) return Promise.resolve();
  if (running) { rerun = true; return running; }
  running = (async () => {
    try {
      do { rerun = false; await runSync(database); } while (rerun);
    } catch (error) {
      console.warn('[reminders] sync failed', error);
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---------------------------------------------------------------------------
// Notification taps and deliveries.

/** The card a notification response points to, if it's a Chits reminder. */
export function reminderCardId(response: Notifications.NotificationResponse | null | undefined): string | null {
  const data = response?.notification.request.content.data;
  return data?.type === REMINDER_NOTIFICATION_TYPE && typeof data.cardId === 'string' ? data.cardId : null;
}

/**
 * Wires notification taps (app open, backgrounded, or launched from a killed
 * state) to `openCard`, and clears fired reminders as they're delivered.
 * Returns an unsubscribe function.
 */
export function observeReminderNotifications(openCard: (cardId: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const cardId = reminderCardId(response);
    if (!cardId) return;
    // Consume it so a later remount (e.g. after a restore) doesn't reopen the card.
    Notifications.clearLastNotificationResponse();
    openCard(cardId);
    void requestReminderSync();
  };
  handle(Notifications.getLastNotificationResponse());
  const responses = Notifications.addNotificationResponseReceivedListener(handle);
  const received = Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.data?.type === REMINDER_NOTIFICATION_TYPE) void requestReminderSync();
  });
  return () => { responses.remove(); received.remove(); };
}
