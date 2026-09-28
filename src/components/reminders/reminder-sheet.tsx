import type { SetReminderResult } from '@/services/reminders';

// Reminders are native-only (local notifications); nothing to show on web.
export function ReminderSheet(_: { visible: boolean; existing: number | null; accent: string; accentOn: string; onClose: () => void; onSave: (date: Date) => Promise<SetReminderResult>; onRemove: () => Promise<void> }) {
  return null;
}
