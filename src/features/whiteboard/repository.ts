import type { SQLiteDatabase } from 'expo-sqlite';
import { canvasKey, type CanvasDocument } from './document';
// Documents live in the existing backed-up SQLite settings table. No external assets.
export function whiteboards(db: SQLiteDatabase) {
  return {
    async list() { const rows = await db.getAllAsync<{ value: string }>("SELECT value FROM app_settings WHERE key LIKE 'whiteboard.v1.%' ORDER BY updated_at DESC"); return rows.map(row => JSON.parse(row.value) as CanvasDocument); },
    async get(id: string) { const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', canvasKey(id)); return row ? JSON.parse(row.value) as CanvasDocument : null; },
    async save(doc: CanvasDocument) { await db.runAsync('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', canvasKey(doc.id), JSON.stringify(doc), doc.updatedAt); },
    async remove(id: string) { await db.runAsync('DELETE FROM app_settings WHERE key = ?', canvasKey(id)); },
  };
}
