import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { localMinute, sceneLook, sceneMixAt, type HeaderSceneInk } from '@/constants/header-scenes';

// One minute clock shared by every header scene: a single timer runs while
// anything listens, and coming back to the foreground catches up at once.
const wholeMinute = () => Math.floor(localMinute(new Date()));
let minute = wholeMinute();
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

function tick() {
  const next = wholeMinute();
  if (next === minute) return;
  minute = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    minute = wholeMinute();
    const timer = setInterval(tick, 15_000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    stop = () => { clearInterval(timer); appState.remove(); };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && stop) { stop(); stop = null; }
  };
}
const getMinute = () => minute;
const idle = () => () => {};

/** The minute of the local day, updated as it turns. */
export function useSceneMinute() {
  return useSyncExternalStore(subscribe, getMinute);
}

/** The scene's ink, which changes only a few times a day; idle when no scene shows. */
export function useSceneInk(scheme: 'light' | 'dark', enabled: boolean): HeaderSceneInk {
  return useSyncExternalStore(enabled ? subscribe : idle, () => sceneLook(sceneMixAt(minute), scheme).ink);
}
