import { CHECKLIST_ITEMS, type ChecklistItem } from '../checklist';
import { ONBOARDING_KEYS, readOnboardingValue, writeOnboardingValue, type OnboardingDatabase } from '../storage';

// When Chits reacts to the checklist. The checklist itself stays the only record
// of what's been done; this remembers how much of it Chits has already reacted
// to, so a milestone plays once, however often the screen opens.
//
// Pure apart from the two small reads and writes, so tests can walk it.

export type JourneyReaction = {
  /** The milestone line to say, by items done; null to stay quiet. */
  line: number | null;
  /** The new count to remember, or null if it hasn't changed. */
  remember: number | null;
};

export function journeyReaction(done: number, celebrated: number | null): JourneyReaction {
  // The first visit is a hello, whatever has already been done.
  if (celebrated === null) return { line: done, remember: done };
  return done > celebrated ? { line: done, remember: done } : { line: null, remember: null };
}

/** The first item not done yet, or null once they all are. */
export function nextChecklistItem(done: readonly ChecklistItem[]): ChecklistItem | null {
  return CHECKLIST_ITEMS.find((item) => !done.includes(item)) ?? null;
}

export async function readCelebrated(database: OnboardingDatabase) {
  const value = Number.parseInt((await readOnboardingValue(database, ONBOARDING_KEYS.celebrated)) ?? '', 10);
  return Number.isNaN(value) ? null : value;
}

export function saveCelebrated(database: OnboardingDatabase, count: number) {
  return writeOnboardingValue(database, ONBOARDING_KEYS.celebrated, String(count));
}
