import { ONBOARDING_KEYS, readOnboardingValue, writeOnboardingValue, type OnboardingDatabase } from './storage';

export type ChecklistItem = 'firstNote' | 'firstCard' | 'reminder' | 'space';
export const CHECKLIST_ITEMS: readonly ChecklistItem[] = ['firstNote', 'firstCard', 'reminder', 'space'];

function parseItems(value: string | null): ChecklistItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? CHECKLIST_ITEMS.filter((item) => parsed.includes(item)) : [];
  } catch { return []; }
}

/** Read real app state. Reminder and Space achievements remain ticked after a reminder fires or a note is removed. */
export async function readChecklist(database: OnboardingDatabase) {
  const [saved, row] = await Promise.all([
    readOnboardingValue(database, ONBOARDING_KEYS.checklist),
    database.getFirstAsync<{ firstNote: number; firstCard: number; reminder: number; space: number }>(`
      SELECT EXISTS(SELECT 1 FROM messages WHERE deleted_at IS NULL) AS firstNote,
        EXISTS(SELECT 1 FROM card_messages) AS firstCard,
        EXISTS(SELECT 1 FROM card_reminders) AS reminder,
        EXISTS(SELECT 1 FROM space_placements) AS space`),
  ]);
  const prior = parseItems(saved);
  const done = CHECKLIST_ITEMS.filter((item) => prior.includes(item) || row?.[item] === 1);
  if (done.length !== prior.length) await writeOnboardingValue(database, ONBOARDING_KEYS.checklist, JSON.stringify(done));
  return done;
}
