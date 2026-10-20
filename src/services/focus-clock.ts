import type { FocusSession } from './focus-timer';

type Anchor = { checkpoint: number; wall: number; monotonic: number };
const anchors = new WeakMap<object, Map<string, Anchor>>();
export function observeFocusClock(owner: object, session: FocusSession, wall = Date.now(), monotonic = performance.now()) {
  let entries = anchors.get(owner);
  if (!entries) { entries = new Map(); anchors.set(owner, entries); }
  const previous = entries.get(session.id);
  if (!previous || previous.checkpoint !== session.checkpoint_at) entries.set(session.id, { checkpoint: session.checkpoint_at, wall, monotonic });
}
export function focusNow(owner: object, session: FocusSession, wall = Date.now(), monotonic = performance.now()) {
  observeFocusClock(owner, session, wall, monotonic);
  const anchor = anchors.get(owner)!.get(session.id)!;
  return anchor.wall + Math.max(0, monotonic - anchor.monotonic);
}
/** Detect wall-clock changes while the process is awake. Across suspension or
 * termination wall timestamps remain authoritative; discard awake anchors. */
export function correctedFocusElapsed(owner: object, session: FocusSession, wall: number, monotonic = performance.now()) {
  const anchor = anchors.get(owner)?.get(session.id);
  if (!anchor || anchor.checkpoint !== session.checkpoint_at) return undefined;
  const expected = anchor.wall + Math.max(0, monotonic - anchor.monotonic);
  return Math.abs(expected - wall) > 5000 ? Math.max(0, expected - session.checkpoint_at) : undefined;
}
export function resetFocusClocks(owner: object) { anchors.delete(owner); }
