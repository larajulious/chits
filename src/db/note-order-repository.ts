import type { SQLiteDatabase } from 'expo-sqlite';

import { NOTE_LAYOUT_KEY, NOTE_ORDER_KEY, NOTE_ORDER_MODE_KEY, parseNoteOrder, type NoteLayout, type NoteOrderMode } from '../services/note-order';

// The Notes list's "My order" (see services/note-order.ts) lives in
// app_settings, so backups carry it with every other preference.
const UPSERT = 'INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at';

export function createNoteOrderRepository(db: SQLiteDatabase) {
  return {
    async load(): Promise<{ mode: NoteOrderMode; order: string[]; layout: NoteLayout }> {
      const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)', NOTE_ORDER_MODE_KEY, NOTE_ORDER_KEY, NOTE_LAYOUT_KEY);
      const value = (key: string) => rows.find((row) => row.key === key)?.value;
      return { mode: value(NOTE_ORDER_MODE_KEY) === 'custom' ? 'custom' : 'recent', order: parseNoteOrder(value(NOTE_ORDER_KEY)), layout: value(NOTE_LAYOUT_KEY) === 'grid' ? 'grid' : 'board' };
    },
    setMode: (mode: NoteOrderMode) => db.runAsync(UPSERT, NOTE_ORDER_MODE_KEY, mode, Date.now()),
    setLayout: (layout: NoteLayout) => db.runAsync(UPSERT, NOTE_LAYOUT_KEY, layout, Date.now()),
    save: (order: string[]) => db.runAsync(UPSERT, NOTE_ORDER_KEY, JSON.stringify(order), Date.now()),
  };
}
