import type { FocusPreferences, FocusSession } from './focus-timer';
export async function enableFocusNotifications() { return false; }
export async function syncFocusNotifications(_session: FocusSession | null, _preferences: FocusPreferences) {}
export function observeFocusNotifications(_open: (id: string, noteKey: string) => void) { return () => {}; }
