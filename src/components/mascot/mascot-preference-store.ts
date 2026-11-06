import type { SQLiteDatabase } from 'expo-sqlite';
import { MASCOT_SETTING_KEY, resolveMascotVariant, type MascotVariant } from './mascot-variants';

type Database = Pick<SQLiteDatabase, 'getFirstSync' | 'runAsync'>;
export function createMascotPreferenceStore(database: Database) {
  let saved: MascotVariant = 'classic';
  try { saved = resolveMascotVariant(database.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', MASCOT_SETTING_KEY)?.value); }
  catch { /* An unavailable preference must never prevent offline startup. */ }
  let snapshot = { variant: saved, saving: false };
  const listeners = new Set<() => void>();
  let sequence = 0;
  let queue = Promise.resolve();
  const publish = (variant: MascotVariant, saving: boolean) => {
    snapshot = { variant, saving };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(value: MascotVariant) {
      const next = resolveMascotVariant(value);
      if (next === snapshot.variant && !snapshot.saving) return Promise.resolve();
      const request = ++sequence;
      publish(next, true);
      // Serialize rapid changes so the final disk value always matches the UI.
      const operation = queue.then(async () => {
        try {
          await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', MASCOT_SETTING_KEY, next, Date.now());
          saved = next;
        } finally {
          // On failure restore the last successfully saved selection, unless a
          // newer choice is already being shown and will be saved next.
          if (request === sequence) publish(saved, false);
        }
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}
