import { decideFirstRun, deleteOnboardingValue, ONBOARDING_KEYS, readOnboardingValue, writeOnboardingValue, type OnboardingDatabase } from './storage';

// The welcome tour as a small persisted state machine:
//   welcome (its own steps, see welcome/tour-steps.ts) → first-note → aha → moved
//   → setup (first run only) → ended.
// 'first-run' is the automatic tour on a fresh install. 'replay' is started from
// the Getting started hub and never creates, moves or changes anything by itself.
export type TourMode = 'first-run' | 'replay';
export type TourStage = 'welcome' | 'first-note' | 'aha' | 'moved' | 'setup';
export type TourState = {
  mode: TourMode;
  stage: TourStage;
  /** When the current stage began (ms) — "first note" waits for a note sent after this. */
  since: number;
  /** The note the coach mark is about, once there is one. */
  messageId: string | null;
  /** Where that note landed after "Try it". */
  boardId: string | null; columnId: string | null; cardId: string | null;
  /** True between "Try it" and the note arriving on a board (the coach mark steps aside). */
  awaitingMove: boolean;
  /** The Welcome step someone reached, and when, so an interruption doesn't lose their place. */
  welcomeStep: number;
  stepAt: number;
};

const STAGES: readonly TourStage[] = ['welcome', 'first-note', 'aha', 'moved', 'setup'];
/** An interruption, not an abandoned tour: past this, the next launch just opens the app. */
export const TOUR_RESUME_MS = 24 * 60 * 60 * 1000;
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

export function parseTour(value: string | null): TourState | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as Record<string, unknown>;
    if (!STAGES.includes(data.stage as TourStage) || (data.mode !== 'first-run' && data.mode !== 'replay')) return null;
    return {
      mode: data.mode, stage: data.stage as TourStage, since: typeof data.since === 'number' ? data.since : 0,
      messageId: text(data.messageId), boardId: text(data.boardId), columnId: text(data.columnId), cardId: text(data.cardId),
      awaitingMove: data.awaitingMove === true,
      welcomeStep: typeof data.welcomeStep === 'number' ? data.welcomeStep : 0, stepAt: typeof data.stepAt === 'number' ? data.stepAt : 0,
    };
  } catch { return null; }
}

export async function readTour(database: OnboardingDatabase) {
  return parseTour(await readOnboardingValue(database, ONBOARDING_KEYS.tour));
}

export async function startTour(database: OnboardingDatabase, mode: TourMode, now = Date.now()) {
  const tour: TourState = { mode, stage: 'welcome', since: now, messageId: null, boardId: null, columnId: null, cardId: null, awaitingMove: false, welcomeStep: 0, stepAt: now };
  await writeOnboardingValue(database, ONBOARDING_KEYS.tour, JSON.stringify(tour));
  return tour;
}

/** Applies `patch` to the running tour; a new stage restarts its clock. No-op when no tour is running. */
export async function updateTour(database: OnboardingDatabase, patch: Partial<Omit<TourState, 'mode' | 'since'>>, now = Date.now()) {
  const current = await readTour(database);
  if (!current) return null;
  const next: TourState = { ...current, ...patch, since: patch.stage && patch.stage !== current.stage ? now : current.since };
  await writeOnboardingValue(database, ONBOARDING_KEYS.tour, JSON.stringify(next));
  return next;
}

/** Remembers the Welcome step, for when the app is closed under someone mid-tour. */
export function saveTourStep(database: OnboardingDatabase, welcomeStep: number, now = Date.now()) {
  return updateTour(database, { welcomeStep, stepAt: now }, now);
}

/** Someone part-way through Welcome who was interrupted, and recently enough to pick it up. */
export function canResumeTour(tour: TourState | null, now = Date.now()) {
  return tour?.stage === 'welcome' && tour.welcomeStep > 0 && now - tour.stepAt < TOUR_RESUME_MS;
}

/** Ends the tour — finished, skipped or interrupted alike. Only a first-run tour records completion. */
export async function endTour(database: OnboardingDatabase, now = Date.now()) {
  const current = await readTour(database);
  if (!current) return;
  await deleteOnboardingValue(database, ONBOARDING_KEYS.tour);
  if (current.mode === 'first-run') await writeOnboardingValue(database, ONBOARDING_KEYS.completedAt, String(now));
}

/**
 * Runs once per launch (and after a restore remounts the app). Starts the
 * first-run tour on a fresh install, and picks Welcome back up for someone the
 * system interrupted part-way through it. Any other tour a previous launch left
 * running is ended, so nobody is ever resumed behind an overlay.
 */
export async function prepareLaunch(database: OnboardingDatabase, canStart: boolean, now = Date.now()) {
  if (await decideFirstRun(database, canStart)) {
    await startTour(database, 'first-run', now);
    // New installs get the Getting started card on the Notes screen; people who
    // updated only see it if they open it from the side panel.
    await writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'shown');
    return true;
  }
  if (canStart && canResumeTour(await readTour(database), now)) return true;
  await endTour(database, now);
  return false;
}
