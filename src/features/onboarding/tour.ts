import { decideFirstRun, deleteOnboardingValue, ONBOARDING_KEYS, readOnboardingValue, writeOnboardingValue, type OnboardingDatabase } from './storage';

// The welcome tour as a small persisted state machine:
//   welcome → first-note → aha → moved → setup (first run only) → ended.
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
};

const STAGES: readonly TourStage[] = ['welcome', 'first-note', 'aha', 'moved', 'setup'];
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
    };
  } catch { return null; }
}

export async function readTour(database: OnboardingDatabase) {
  return parseTour(await readOnboardingValue(database, ONBOARDING_KEYS.tour));
}

export async function startTour(database: OnboardingDatabase, mode: TourMode, now = Date.now()) {
  const tour: TourState = { mode, stage: 'welcome', since: now, messageId: null, boardId: null, columnId: null, cardId: null, awaitingMove: false };
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

/** Ends the tour — finished, skipped or interrupted alike. Only a first-run tour records completion. */
export async function endTour(database: OnboardingDatabase, now = Date.now()) {
  const current = await readTour(database);
  if (!current) return;
  await deleteOnboardingValue(database, ONBOARDING_KEYS.tour);
  if (current.mode === 'first-run') await writeOnboardingValue(database, ONBOARDING_KEYS.completedAt, String(now));
}

/**
 * Runs once per launch (and after a restore remounts the app). Starts the
 * first-run tour on a fresh install; otherwise ends any tour a previous launch
 * left running (killed mid-tour), so nobody is ever resumed behind an overlay.
 */
export async function prepareLaunch(database: OnboardingDatabase, canStart: boolean, now = Date.now()) {
  if (await decideFirstRun(database, canStart)) {
    await startTour(database, 'first-run', now);
    // New installs get the Getting started card on the Notes screen; people who
    // updated only see it if they open it from the side panel.
    await writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'shown');
    return true;
  }
  await endTour(database, now);
  return false;
}
