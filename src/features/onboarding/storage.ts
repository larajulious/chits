import type { SQLiteDatabase } from 'expo-sqlite';

// Onboarding keeps its own rows in the existing app_settings key-value table —
// every key starts with "onboarding." and nothing else in Chits reads them. No
// schema change, and "Reset tips" can remove exactly these rows and nothing else.
export type OnboardingDatabase = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

/** Bump (with a new tour) to target people who already finished this one. */
export const ONBOARDING_VERSION = 1;
export const ONBOARDING_KEY_PREFIX = 'onboarding.';
export const ONBOARDING_KEYS = {
  version: 'onboarding.version',
  /** 'shown' (a fresh install that got the tour) or 'existing-user'. Decided once. */
  firstRun: 'onboarding.firstRun',
  /** The tour in progress, as JSON (see tour.ts); absent when no tour is running. */
  tour: 'onboarding.tour',
  completedAt: 'onboarding.completedAt',
  /** Checklist items seen done at least once, as a JSON array (see checklist.ts). */
  checklist: 'onboarding.checklist',
  /** 'shown' or 'dismissed': whether the Getting started card sits on the Notes screen. */
  checklistHome: 'onboarding.checklistHome',
} as const;

const UPSERT_SQL = 'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at';
// Exact prefix match (LIKE would treat "_" as a wildcard and ignore case).
const ONBOARDING_ROWS_SQL = `substr(key, 1, ${ONBOARDING_KEY_PREFIX.length}) = '${ONBOARDING_KEY_PREFIX}'`;

// Screens showing onboarding state (the root layer, the hub, the checklist card)
// reload when it changes — the same pattern as space-changes/attachment-changes.
const listeners = new Set<() => void>();
export function notifyOnboardingChanged() { for (const listener of listeners) listener(); }
export function subscribeToOnboardingChanges(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export async function readOnboardingValue(database: OnboardingDatabase, key: string) {
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function writeOnboardingValue(database: OnboardingDatabase, key: string, value: string) {
  await database.runAsync(UPSERT_SQL, key, value, Date.now());
  notifyOnboardingChanged();
}

export async function deleteOnboardingValue(database: OnboardingDatabase, key: string) {
  await database.runAsync('DELETE FROM app_settings WHERE key = ?', key);
  notifyOnboardingChanged();
}

/** "Reset tips": removes every onboarding row — and only those. */
export async function resetOnboarding(database: OnboardingDatabase) {
  await database.runAsync(`DELETE FROM app_settings WHERE ${ONBOARDING_ROWS_SQL}`);
  notifyOnboardingChanged();
}

/**
 * Any sign this install has been used: a note or board (archived and deleted
 * ones included), or any setting at all (theme, NoteSpace name, chat draft,
 * background, last backup…). A fresh install has none of these.
 */
export async function hasPriorUse(database: OnboardingDatabase) {
  const row = await database.getFirstAsync<{ used: number }>(`SELECT (EXISTS (SELECT 1 FROM messages) OR EXISTS (SELECT 1 FROM boards) OR EXISTS (SELECT 1 FROM app_settings WHERE NOT ${ONBOARDING_ROWS_SQL})) AS used`);
  return row?.used === 1;
}

/**
 * Whether this launch should start the first-run tour. Decided once per
 * install and remembered, so someone who updated Chits is marked
 * 'existing-user' on their first launch of this version and never asked again,
 * even if they later delete everything. `canStart` is false when the launch
 * landed somewhere other than the home screen (a deep link); a fresh install is
 * then left undecided for a later, ordinary launch.
 */
export async function decideFirstRun(database: OnboardingDatabase, canStart: boolean) {
  if (await readOnboardingValue(database, ONBOARDING_KEYS.firstRun)) return false;
  const used = await hasPriorUse(database);
  if (!used && !canStart) return false;
  await writeOnboardingValue(database, ONBOARDING_KEYS.version, String(ONBOARDING_VERSION));
  await writeOnboardingValue(database, ONBOARDING_KEYS.firstRun, used ? 'existing-user' : 'shown');
  return !used;
}
