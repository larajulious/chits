import type { SQLiteDatabase } from 'expo-sqlite';

// Reminders are local notifications scheduled by the native app; the web build has none.
export type SetReminderResult = { ok: true } | { ok: false; reason: 'declined' | 'blocked' | 'failed' };
export function subscribeToReminderChanges(_: () => void): () => void { return () => undefined; }
export function registerReminderDatabase(_: SQLiteDatabase | null) {}
export function requestReminderSync(): Promise<void> { return Promise.resolve(); }
export async function pauseReminderSync() {}
export function resumeReminderSync() {}
export async function hasNotificationPermission(): Promise<boolean> { return false; }
export async function setCardReminder(_database: SQLiteDatabase, _cardId: string, _scheduledAt: number): Promise<SetReminderResult> { return { ok: false, reason: 'failed' }; }
export async function removeCardReminder(_database: SQLiteDatabase, _cardId: string): Promise<void> {}
export async function setMessageReminder(_database: SQLiteDatabase, _messageId: string, _scheduledAt: number): Promise<SetReminderResult> { return { ok: false, reason: 'failed' }; }
export async function removeMessageReminder(_database: SQLiteDatabase, _messageId: string): Promise<void> {}
export async function completeReminder(_database: SQLiteDatabase, _kind: 'card' | 'message', _id: string): Promise<void> {}
export function observeReminderNotifications(_: (cardId: string) => void, _openMessage?: (messageId: string) => void): () => void { return () => undefined; }
