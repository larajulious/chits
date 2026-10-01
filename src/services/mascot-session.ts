import type { AppStateStatus } from 'react-native';

const LONG_BACKGROUND_MS = 30 * 60 * 1000;
let greetingShown = false;
let backgroundedAt: number | null = null;
const listeners = new Set<() => void>();

export function canShowMascotGreeting() { return !greetingShown; }

export function claimMascotGreeting() {
  if (greetingShown) return false;
  greetingShown = true;
  return true;
}

export function updateMascotAppState(state: AppStateStatus, now = Date.now()) {
  if (state === 'background') { backgroundedAt ??= now; return; }
  if (state !== 'active' || backgroundedAt === null) return;
  if (now - backgroundedAt >= LONG_BACKGROUND_MS) {
    greetingShown = false;
    for (const listener of listeners) listener();
  }
  backgroundedAt = null;
}

export function subscribeToMascotSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
