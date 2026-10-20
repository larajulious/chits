export type FocusStatus = 'running' | 'paused' | 'unfinished' | 'completed';
export type FocusSession = {
  id: string; note_key: string; started_at: number; ended_at: number | null;
  planned_ms: number | null; focused_ms: number; paused_ms: number;
  checkpoint_at: number; status: FocusStatus; completed_at: number | null;
  dismissed_at: number | null; clock_adjusted: number;
};
export type FocusPreferences = { durationMinutes: number | null; companion: boolean; continuity: boolean; notifications: boolean };
export const FOCUS_DEFAULTS: FocusPreferences = { durationMinutes: 25, companion: true, continuity: true, notifications: false };
export const isFocusActive = (session: FocusSession | null | undefined) => session?.status === 'running' || session?.status === 'paused';

export function focusPreferences(value: string | null | undefined): FocusPreferences {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return {
      durationMinutes: parsed.durationMinutes === null ? null : Number.isInteger(parsed.durationMinutes) && parsed.durationMinutes >= 1 && parsed.durationMinutes <= 720 ? parsed.durationMinutes : 25,
      companion: typeof parsed.companion === 'boolean' ? parsed.companion : true,
      continuity: typeof parsed.continuity === 'boolean' ? parsed.continuity : true,
      notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : false,
    };
  } catch { return { ...FOCUS_DEFAULTS }; }
}

/** Pure projection: no interval counts, writes or side effects. Repeated reads
 * of a checkpoint cannot add time twice. Optional monotonic elapsed is supplied
 * by the app controller when it detects a foreground wall-clock adjustment. */
export function advanceFocus(session: FocusSession, now: number, elapsed?: number): FocusSession {
  if (!isFocusActive(session) || !Number.isFinite(now)) return session;
  const delta = elapsed ?? now - session.checkpoint_at;
  const adjusted = delta < 0 || delta > 86_400_000 || elapsed !== undefined;
  if (!Number.isFinite(delta) || delta < 0 || delta > 86_400_000) {
    return { ...session, checkpoint_at: now, status: 'paused', clock_adjusted: 1 };
  }
  if (session.status === 'paused') return { ...session, checkpoint_at: now, paused_ms: session.paused_ms + delta, clock_adjusted: adjusted ? 1 : session.clock_adjusted };
  const added = session.planned_ms === null ? delta : Math.min(delta, Math.max(0, session.planned_ms - session.focused_ms));
  const focused_ms = session.focused_ms + added;
  const completed = session.planned_ms !== null && focused_ms >= session.planned_ms;
  const end = completed ? Math.max(session.started_at, now - (delta - added)) : null;
  return { ...session, focused_ms, checkpoint_at: now, clock_adjusted: adjusted ? 1 : session.clock_adjusted,
    status: completed ? 'completed' : 'running', ended_at: end, completed_at: end };
}

export function focusClock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
