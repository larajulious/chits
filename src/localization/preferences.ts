import type { SQLiteDatabase } from 'expo-sqlite';
import { LANGUAGE_KEY, normalizePreference, type LanguagePreference } from './runtime';

type PreferencesDatabase = Pick<SQLiteDatabase, 'getFirstSync' | 'runAsync'>;
export function readLanguagePreference(database: PreferencesDatabase): LanguagePreference {
  try { return normalizePreference(database.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', LANGUAGE_KEY)?.value); }
  catch { return 'system'; }
}
export async function saveLanguagePreference(database: PreferencesDatabase, preference: LanguagePreference) {
  await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', LANGUAGE_KEY, preference, Date.now());
}
