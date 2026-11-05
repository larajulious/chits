import type { SQLiteDatabase } from 'expo-sqlite';

import { NOTE_CANVAS_PREFS_KEY, parseCanvasPrefs, type CanvasPosition, type CanvasPrefs } from '../services/note-canvas';

const UPSERT_POSITION = 'INSERT INTO note_canvas_positions(note_key,x,y,z,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(note_key) DO UPDATE SET x=excluded.x,y=excluded.y,z=excluded.z,updated_at=excluded.updated_at';
const UPSERT_SETTING = 'INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at';
// A thought filed into a card becomes a new note key; it stays where it was.
const CARRY_FILED_THOUGHTS = `INSERT OR IGNORE INTO note_canvas_positions(note_key,x,y,z,updated_at)
  SELECT 'card:' || cm.card_id, p.x, p.y, p.z, p.updated_at FROM note_canvas_positions p INNER JOIN card_messages cm ON p.note_key = 'thought:' || cm.message_id`;
// Only notes that are gone for good: archived notes still exist and keep their spot.
const FORGET_DELETED = `DELETE FROM note_canvas_positions WHERE
  (note_key LIKE 'card:%' AND substr(note_key, 6) NOT IN (SELECT id FROM cards))
  OR (note_key LIKE 'thought:%' AND substr(note_key, 9) NOT IN (SELECT id FROM messages))`;

/** Board presentation only: nothing here reads or writes a note's own tables. */
export function createNoteCanvasRepository(db: SQLiteDatabase) {
  return {
    async load(): Promise<{ positions: Map<string, CanvasPosition>; prefs: CanvasPrefs }> {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(CARRY_FILED_THOUGHTS);
        await transaction.execAsync(FORGET_DELETED);
      });
      const [rows, setting] = await Promise.all([
        db.getAllAsync<{ noteKey: string; x: number; y: number; z: number }>('SELECT note_key AS noteKey, x, y, z FROM note_canvas_positions'),
        db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', NOTE_CANVAS_PREFS_KEY),
      ]);
      return { positions: new Map(rows.map((row) => [row.noteKey, { x: row.x, y: row.y, z: row.z }])), prefs: parseCanvasPrefs(setting?.value) };
    },
    savePosition: (key: string, { x, y, z }: CanvasPosition) => db.runAsync(UPSERT_POSITION, key, x, y, z, Date.now()),
    /** Atomic arrange/Undo. A stale snapshot must never overwrite a later drag. */
    saveArrangement: (before: ReadonlyMap<string, CanvasPosition>, after: ReadonlyMap<string, CanvasPosition>) => db.withExclusiveTransactionAsync(async (transaction) => {
      for (const [key, previous] of before) {
        const current = await transaction.getFirstAsync<CanvasPosition>('SELECT x,y,z FROM note_canvas_positions WHERE note_key = ?', key);
        if (!current || current.x !== previous.x || current.y !== previous.y || current.z !== previous.z) throw new Error('Canvas positions changed');
      }
      const now = Date.now();
      for (const [key, { x, y, z }] of after) {
        if (!before.has(key)) throw new Error('Missing arrangement snapshot');
        await transaction.runAsync(UPSERT_POSITION, key, x, y, z, now);
      }
    }),
    /** Adds generated spots. A note that already has one keeps it. */
    savePlacements: (placements: readonly (readonly [string, CanvasPosition])[]) => db.withExclusiveTransactionAsync(async (transaction) => {
      const now = Date.now();
      for (const [key, { x, y, z }] of placements) await transaction.runAsync('INSERT OR IGNORE INTO note_canvas_positions(note_key,x,y,z,updated_at) VALUES (?,?,?,?,?)', key, x, y, z, now);
    }),
    savePrefs: (prefs: CanvasPrefs) => db.runAsync(UPSERT_SETTING, NOTE_CANVAS_PREFS_KEY, JSON.stringify(prefs), Date.now()),
  };
}
