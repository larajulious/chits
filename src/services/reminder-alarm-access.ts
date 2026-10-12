// Local reminder alarms are only available in the native app.
export async function hasExactReminderAccess(): Promise<boolean> { return false; }
export async function openReminderAlarmSettings(): Promise<void> {}
export async function restorePendingReminderAlarms(): Promise<void> {}
