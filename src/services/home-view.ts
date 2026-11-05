import { useSyncExternalStore } from 'react';

export type HomeView = 'cards' | 'boards';

let current: HomeView = 'cards';
const listeners = new Set<() => void>();

/** Home's own Notes/Boards switch, shared so the floating controls can follow it. */
export function setHomeView(next: HomeView) {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useHomeView() {
  return useSyncExternalStore(subscribe, () => current);
}
