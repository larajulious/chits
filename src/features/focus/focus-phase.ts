import type { FocusSession } from '../../services/focus-timer';

// What the Focus screen shows for a session, as plain rules so tests can check
// them. The session itself is the only truth; nothing here keeps time.

export type FocusPhase = 'ready' | 'running' | 'paused' | 'unfinished' | 'completed';
export const focusPhase = (session: FocusSession | null | undefined): FocusPhase => session?.status ?? 'ready';

/** Under this, a finished session is a false start rather than something to celebrate. */
const BRIEF_MS = 60_000;

/** How a finished session really went: only time actually focused may read as a success. */
export type FocusOutcome = 'full' | 'open' | 'early' | 'brief';
export function focusOutcome(session: Pick<FocusSession, 'planned_ms' | 'focused_ms'>): FocusOutcome {
  if (session.planned_ms !== null && session.focused_ms >= session.planned_ms) return 'full';
  if (session.focused_ms < BRIEF_MS) return 'brief';
  return session.planned_ms === null ? 'open' : 'early';
}
export const focusCelebrates = (outcome: FocusOutcome) => outcome === 'full' || outcome === 'open';

/** Chits' heading and line. */
export function focusHeroKeys(phase: FocusPhase, outcome: FocusOutcome | null) {
  const key = phase !== 'completed' || !outcome || focusCelebrates(outcome) ? phase : outcome;
  return { title: `focus.hero.${key}.title`, body: `focus.hero.${key}.body` };
}

export function focusPrimaryKey(phase: FocusPhase) {
  return { ready: 'focus.start', running: 'focus.pauseFocus', paused: 'focus.resume', unfinished: 'focus.resume', completed: 'focus.recap.view' }[phase];
}

/** How Chits rests in each phase: calm and nearly still while someone works, a curious tilt on a break. */
export function focusPose(phase: FocusPhase) {
  if (phase === 'running') return { calm: true, restGaze: -4, restTilt: -3 };
  if (phase === 'paused') return { calm: false, restGaze: -8, restTilt: 4 };
  return { calm: false, restGaze: -10, restTilt: -3 };
}

/** Timed progress from 0 to 1, or null for a session with nothing to fill. */
export function focusFraction(session: Pick<FocusSession, 'planned_ms' | 'focused_ms'> | null) {
  if (!session || session.planned_ms === null || session.planned_ms <= 0) return null;
  return Math.min(1, session.focused_ms / session.planned_ms);
}

/** A hidden note can't be focused on, and a long list isn't a choice: the most recent will do, and search finds the rest. */
const PICKER_NOTES = 40;
export const focusPickerNotes = <T extends { hidden: boolean }>(notes: T[]) => notes.filter((note) => !note.hidden).slice(0, PICKER_NOTES);

/** What sits under the timer: the task card, the row of controls, the two footer rows. */
const TASK_ROOM = 86;
const CONTROLS_ROOM = 66;
const FOOTER_ROOM = 142;
const GAPS = 34;
const DIAL_MIN = 180;
const DIAL_MAX = 264;

/** As large as fits on one screen, and never so small that it stops being the point. */
export function focusDialSize(width: number, viewport: number, heroHeight: number) {
  const room = viewport - heroHeight - TASK_ROOM - CONTROLS_ROOM - FOOTER_ROOM - GAPS;
  return Math.round(Math.min(width - 72, Math.max(DIAL_MIN, Math.min(DIAL_MAX, room * 0.94))));
}
