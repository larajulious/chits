import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createReminderRepository } from '@/db/repositories';
import { resolvePermission, type PermissionState } from '@/services/permissions';
import { planReminderSync, reminderBody, REMINDER_NOTIFICATION_TYPE, REMINDER_TITLE, type ScheduledReminder } from '@/services/reminder-content';
import { isBackupOperationActive } from '@/services/backup-operation';

const CHANNEL_ID = 'reminders';

// ---------------------------------------------------------------------------
// Change notifications: screens showing reminder state (Calendar, Card details,
// card lists) reload when a reminder is set, removed or reconciled.
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
 * Asks for notification permission only on a deliberate "Set Reminder" tap,
 * never at launch, and shows the system prompt only while the OS still allows
 * it. 'denied' means the user just declined that prompt, so the caller must
 * stop quietly (App Review Guideline 5.1.1(iv)); 'blocked' means they declined
 * earlier and are trying again, so the caller may offer Settings.
 */
export async function ensureNotificationPermission(): Promise<PermissionState> {
  // Android 13 only shows its permission prompt once a channel exists.
  await ensureReminderChannel();
  const status = (permission: Notifications.NotificationPermissionsStatus) => ({ granted: isGranted(permission), canAskAgain: permission.canAskAgain });
  return resolvePermission(
    async () => status(await Notifications.getPermissionsAsync()),
    async () => status(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })),
  );
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

export type SetReminderResult = { ok: true } | { ok: false; reason: 'declined' | 'blocked' | 'failed' };

/**
 * Sets (or changes) a card's reminder: permission first, then the new local
 * notification is scheduled before the old one is cancelled and the record is
 * saved, so a failure never leaves the card without its previous reminder.
 */
export async function setCardReminder(database: SQLiteDatabase, cardId: string, scheduledAt: number): Promise<SetReminderResult> {
  try {
    const access = await ensureNotificationPermission();
    if (access === 'denied') return { ok: false, reason: 'declined' };
    if (access === 'blocked') return { ok: false, reason: 'blocked' };
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

type MessageReminderRow = { messageId: string; scheduledAt: number; notificationId: string | null; text: string | null; hidden: number; attachmentType: 'photo' | 'video' | 'audio' | 'file' | 'text' | null; active: number };
const MESSAGE_REMINDER_TYPE = 'message-reminder';
async function getMessageReminder(database: SQLiteDatabase, messageId: string) {
  return database.getFirstAsync<{ scheduledAt: number; notificationId: string | null }>('SELECT scheduled_at AS scheduledAt, notification_id AS notificationId FROM message_reminders WHERE message_id = ? AND completed_at IS NULL', messageId);
}
async function messageNotifications() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter((item) => item.content.data?.type === MESSAGE_REMINDER_TYPE);
}
async function scheduleMessageNotification(messageId: string, scheduledAt: number, body: string) {
  await ensureReminderChannel();
  return Notifications.scheduleNotificationAsync({
    content: { title: REMINDER_TITLE, body, sound: 'default', data: { type: MESSAGE_REMINDER_TYPE, messageId, url: `/chat?messageId=${messageId}` } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(scheduledAt), channelId: CHANNEL_ID },
  });
}

export async function setMessageReminder(database: SQLiteDatabase, messageId: string, scheduledAt: number): Promise<SetReminderResult> {
  try {
    const access = await ensureNotificationPermission();
    if (access === 'denied') return { ok: false, reason: 'declined' };
    if (access === 'blocked') return { ok: false, reason: 'blocked' };
    const row = await database.getFirstAsync<{ text: string | null; hidden: number; attachmentType: MessageReminderRow['attachmentType'] }>(
      'SELECT m.text, m.is_hidden_content AS hidden, (SELECT a.type FROM attachments a WHERE a.message_id = m.id ORDER BY a.created_at LIMIT 1) AS attachmentType FROM messages m WHERE m.id = ? AND m.deleted_at IS NULL AND m.archived_at IS NULL', messageId);
    if (!row) return { ok: false, reason: 'failed' };
    const previous = await getMessageReminder(database, messageId);
    const body = reminderBody({ text: row.text, hidden: row.hidden === 1, attachmentType: row.attachmentType, title: null });
    const notificationId = await scheduleMessageNotification(messageId, scheduledAt, body);
    const now = Date.now();
    try {
      await database.runAsync('INSERT INTO message_reminders (message_id, scheduled_at, notification_id, completed_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?) ON CONFLICT(message_id) DO UPDATE SET scheduled_at = excluded.scheduled_at, notification_id = excluded.notification_id, completed_at = NULL, updated_at = excluded.updated_at', messageId, scheduledAt, notificationId, now, now);
    } catch (error) { await cancelNotification(notificationId); throw error; }
    await cancelNotification(previous?.notificationId);
    for (const item of await messageNotifications()) if (item.content.data?.messageId === messageId && item.identifier !== notificationId) await cancelNotification(item.identifier);
    emitReminderChange();
    return { ok: true };
  } catch (error) {
    console.warn('[reminders] could not set message reminder', { messageId, error });
    return { ok: false, reason: 'failed' };
  }
}

export async function removeMessageReminder(database: SQLiteDatabase, messageId: string) {
  const existing = await getMessageReminder(database, messageId);
  await cancelNotification(existing?.notificationId);
  for (const item of await messageNotifications()) if (item.content.data?.messageId === messageId) await cancelNotification(item.identifier);
  await database.runAsync('DELETE FROM message_reminders WHERE message_id = ?', messageId);
  emitReminderChange();
}

export async function completeReminder(database: SQLiteDatabase, kind: 'card' | 'message', id: string) {
  if (kind === 'card') {
    const repository = createReminderRepository(database);
    const previous = await repository.get(id);
    await repository.complete(id);
    await cancelNotification(previous?.notificationId);
    for (const item of await scheduledReminders()) if (item.cardId === id) await cancelNotification(item.identifier);
  } else {
    const previous = await getMessageReminder(database, id);
    const now = Date.now();
    await database.runAsync('UPDATE message_reminders SET completed_at = ?, notification_id = NULL, updated_at = ? WHERE message_id = ? AND completed_at IS NULL', now, now, id);
    await cancelNotification(previous?.notificationId);
    for (const item of await messageNotifications()) if (item.content.data?.messageId === id) await cancelNotification(item.identifier);
  }
  emitReminderChange();
}

// ---------------------------------------------------------------------------
// Keeping the record and the device in step (see planReminderSync).

let syncDatabase: SQLiteDatabase | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let syncPaused = false;

/** Drain device reconciliation before a backup snapshot or closing the database. */
export async function pauseReminderSync() {
  syncPaused = true;
  rerun = false;
  await running;
}
export function resumeReminderSync() {
  syncPaused = false;
  void requestReminderSync();
}

/** Registered by the root layout with the live database (again after a restore). */
export function registerReminderDatabase(database: SQLiteDatabase | null) {
  syncDatabase = database;
  if (database) syncPaused = false;
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
  const messageRows = await database.getAllAsync<MessageReminderRow>(`
    SELECT r.message_id AS messageId, r.scheduled_at AS scheduledAt, r.notification_id AS notificationId,
      m.text, m.is_hidden_content AS hidden,
      (SELECT a.type FROM attachments a WHERE a.message_id = m.id ORDER BY a.created_at LIMIT 1) AS attachmentType,
      (m.id IS NOT NULL AND m.deleted_at IS NULL AND m.archived_at IS NULL) AS active
    FROM message_reminders r LEFT JOIN messages m ON m.id = r.message_id WHERE r.completed_at IS NULL`);
  const deviceMessages = await messageNotifications();
  const keepMessages = new Set<string>();
  let messageChanged = false;
  for (const row of messageRows) {
    if (!row.active) { await database.runAsync('DELETE FROM message_reminders WHERE message_id = ?', row.messageId); messageChanged = true; continue; }
    if (row.scheduledAt <= Date.now()) continue;
    const body = reminderBody({ text: row.text, title: null, hidden: row.hidden === 1, attachmentType: row.attachmentType });
    const current = deviceMessages.find((item) => item.identifier === row.notificationId);
    if (current?.content.data?.messageId === row.messageId && current.content.body === body) { keepMessages.add(current.identifier); continue; }
    if (!await hasNotificationPermission()) continue;
    try {
      const notificationId = await scheduleMessageNotification(row.messageId, row.scheduledAt, body);
      await database.runAsync('UPDATE message_reminders SET notification_id = ?, updated_at = ? WHERE message_id = ?', notificationId, Date.now(), row.messageId);
      messageChanged = true;
      keepMessages.add(notificationId);
    } catch (error) { console.warn('[reminders] could not reschedule message', { messageId: row.messageId, error }); }
  }
  for (const item of deviceMessages) if (!keepMessages.has(item.identifier)) await cancelNotification(item.identifier);
  if (changed || messageChanged) emitReminderChange();
}

/**
 * Reconciles reminders with the device. Safe to call often (app start, return
 * to foreground, after deleting/hiding/editing cards): runs are serialized and
 * a call made during a run triggers exactly one more.
 */
export function requestReminderSync(): Promise<void> {
  const database = syncDatabase;
  if (!database || syncPaused) return Promise.resolve();
  if (running) { rerun = true; return running; }
  running = (async () => {
    try {
      do { rerun = false; await runSync(database); } while (rerun && !syncPaused && syncDatabase === database);
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
 * state) to the original card or Chat note. Fired records remain available as overdue.
 * Returns an unsubscribe function.
 */
export function observeReminderNotifications(openCard: (cardId: string) => void, openMessage?: (messageId: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const cardId = reminderCardId(response);
    const data = response?.notification.request.content.data;
    const messageId = data?.type === MESSAGE_REMINDER_TYPE && typeof data.messageId === 'string' ? data.messageId : null;
    if ((!cardId && !messageId) || isBackupOperationActive()) return;
    // Consume it so a later remount (e.g. after a restore) doesn't reopen the card.
    Notifications.clearLastNotificationResponse();
    if (cardId) openCard(cardId);
    else if (messageId) openMessage?.(messageId);
    void requestReminderSync();
  };
  handle(Notifications.getLastNotificationResponse());
  const responses = Notifications.addNotificationResponseReceivedListener(handle);
  const received = Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.data?.type === REMINDER_NOTIFICATION_TYPE || notification.request.content.data?.type === MESSAGE_REMINDER_TYPE) {
      emitReminderChange();
      void requestReminderSync();
    }
  });
  return () => { responses.remove(); received.remove(); };
}
