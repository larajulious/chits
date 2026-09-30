import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

// The NoteSpace name (Settings → Edit NoteSpace name) — the same
// app_settings.chat_title the drawer and Chat show.
const QUERY = 'SELECT value FROM app_settings WHERE key = ?';
const KEY = 'chat_title';
const readSync = (database: SQLiteDatabase) => {
  try { return database.getFirstSync<{ value: string }>(QUERY, KEY)?.value.trim() || 'Chits'; } catch { return 'Chits'; }
};

/**
 * The NoteSpace name, for display. Read before the first frame (no flash of
 * "Chits"), and again whenever the screen comes back into view — the name is
 * only ever changed from Settings, so returning from there picks it up.
 */
export function useNoteSpaceName(): string {
  const database = useSQLiteContext();
  const [name, setName] = useState(() => readSync(database));
  useFocusEffect(useCallback(() => {
    let active = true;
    void database.getFirstAsync<{ value: string }>(QUERY, KEY).then((row) => { if (active) setName(row?.value.trim() || 'Chits'); }, () => undefined);
    return () => { active = false; };
  }, [database]));
  return name;
}
