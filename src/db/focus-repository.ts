import type { SQLiteDatabase } from 'expo-sqlite';
import { tr } from '@/localization/runtime';
import { createRevisitRepository } from './revisit-repository';
import type { NoteKey } from '@/services/revisit-engine';
import { advanceFocus, focusPreferences, isFocusActive, type FocusPreferences, type FocusSession } from '@/services/focus-timer';
import { correctedFocusElapsed, observeFocusClock } from '@/services/focus-clock';

const listeners = new Set<() => void>();
export const subscribeToFocusChanges = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => { for (const listener of listeners) listener(); };
const queues = new WeakMap<SQLiteDatabase, Promise<unknown>>();
function serial<T>(database: SQLiteDatabase, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(database) ?? Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(database, next);
  return next;
}
async function write(db: SQLiteDatabase, session: FocusSession) {
  await db.runAsync(`UPDATE focus_sessions SET note_key = ?,ended_at = ?,focused_ms = ?,paused_ms = ?,checkpoint_at = ?,status = ?,completed_at = ?,dismissed_at = ?,clock_adjusted = ? WHERE id = ?`,
    session.note_key, session.ended_at, session.focused_ms, session.paused_ms, session.checkpoint_at, session.status, session.completed_at, session.dismissed_at, session.clock_adjusted, session.id);
}

export function createFocusRepository(database: SQLiteDatabase) {
  const get = async (id: string) => { const result = await database.getFirstAsync<FocusSession>('SELECT * FROM focus_sessions WHERE id = ?', id); if (result) observeFocusClock(database, result); return result; };
  const active = async () => { const result = await database.getFirstAsync<FocusSession>("SELECT * FROM focus_sessions WHERE status IN ('running','paused') LIMIT 1"); if (result) observeFocusClock(database, result); return result; };
  const preferences = async () => focusPreferences((await database.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'focus_preferences'"))?.value);
  /** The same one-row read, synchronously, so Focus screens open with the right settings in their first frame. */
  const preferencesSync = () => focusPreferences(database.getFirstSync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'focus_preferences'")?.value);
  const resolveKey = async (key: NoteKey): Promise<NoteKey> => {
    if (!key.startsWith('thought:')) return key;
    const card = await database.getFirstAsync<{ card_id: string }>('SELECT card_id FROM card_messages WHERE message_id = ? ORDER BY card_id LIMIT 1', key.slice(8));
    return card ? `card:${card.card_id}` : key;
  };
  const update = (id: string, action: 'checkpoint' | 'pause' | 'resume' | 'finish' | 'leave', timestamp?: number, elapsed?: number) => serial(database, async () => {
    const now = timestamp ?? Date.now();
    let result: FocusSession | null = null;
    await database.withExclusiveTransactionAsync(async (tx) => {
      const original = await tx.getFirstAsync<FocusSession>('SELECT * FROM focus_sessions WHERE id = ?', id);
      if (!original) throw new Error(tr('focus.error'));
      result = advanceFocus(original, now, elapsed ?? (timestamp === undefined ? correctedFocusElapsed(database, original, now) : undefined));
      if (result.status === 'completed') { if (result !== original) await write(tx, result); return; }
      if (action === 'resume') {
        const other = await tx.getFirstAsync<FocusSession>("SELECT * FROM focus_sessions WHERE status IN ('running','paused') AND id != ?", id);
        if (other) throw new Error(tr('focus.activeOther'));
        if (!await createRevisitRepository(tx).get(result.note_key as NoteKey)) throw new Error(tr('focus.unavailable'));
        result = { ...result, status: 'running', checkpoint_at: now, ended_at: null, dismissed_at: null };
      } else if (action === 'finish') result = { ...result, status: 'completed', ended_at: now, completed_at: now };
      else if (action === 'leave' && isFocusActive(result)) result = { ...result, status: 'unfinished', ended_at: now };
      else if (action === 'pause' && result.status === 'running') result = { ...result, status: 'paused' };
      if (isFocusActive(result) && !await createRevisitRepository(tx).get(result.note_key as NoteKey)) result = { ...result, status: 'unfinished', ended_at: now, dismissed_at: now };
      await write(tx, result);
    });
    observeFocusClock(database, result!); emit(); return result!;
  });
  return {
    get, active, resolveKey, preferences, preferencesSync, update,
    async setPreferences(value: FocusPreferences) {
      const normalized = focusPreferences(JSON.stringify(value));
      await database.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES ('focus_preferences',?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value,updated_at = excluded.updated_at", JSON.stringify(normalized), Date.now());
      emit(); return normalized;
    },
    start(key: NoteKey, plannedMs: number | null, timestamp?: number) {
      return serial(database, async () => {
        const now = timestamp ?? Date.now();
        if (plannedMs !== null && (!Number.isInteger(plannedMs) || plannedMs < 60000 || plannedMs > 43_200_000)) throw new Error(tr('focus.invalidDuration'));
        let result: FocusSession | null = null;
        await database.withExclusiveTransactionAsync(async (tx) => {
          const noteKey = await createFocusRepository(tx).resolveKey(key);
          if (!await createRevisitRepository(tx).get(noteKey)) throw new Error(tr('focus.unavailable'));
          const existing = await tx.getFirstAsync<FocusSession>("SELECT * FROM focus_sessions WHERE status IN ('running','paused') LIMIT 1");
          if (existing) {
            const projected = advanceFocus(existing, now, timestamp === undefined ? correctedFocusElapsed(database, existing, now) : undefined);
            await write(tx, projected);
            if (isFocusActive(projected)) {
              if (projected.note_key !== noteKey) throw new Error(tr('focus.activeOther'));
              result = projected; return;
            }
          }
          const id = `focus-${now}-${Math.random().toString(36).slice(2)}`;
          await tx.runAsync("INSERT INTO focus_sessions(id,note_key,started_at,planned_ms,checkpoint_at,status) VALUES (?,?,?,?,?,'running')", id, noteKey, now, plannedMs, now);
          result = await tx.getFirstAsync<FocusSession>('SELECT * FROM focus_sessions WHERE id = ?', id);
        });
        observeFocusClock(database, result!); emit(); return result!;
      });
    },
    async continuity(key: NoteKey) {
      const latest = await database.getFirstAsync<FocusSession>('SELECT * FROM focus_sessions WHERE note_key = ? ORDER BY started_at DESC,rowid DESC LIMIT 1', await resolveKey(key));
      return latest && latest.status !== 'completed' && latest.dismissed_at === null ? latest : null;
    },
    continuityList: () => database.getAllAsync<FocusSession>(`SELECT f.* FROM focus_sessions f WHERE status != 'completed' AND dismissed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM focus_sessions newer WHERE newer.note_key = f.note_key AND (newer.started_at > f.started_at OR (newer.started_at = f.started_at AND newer.rowid > f.rowid)))
      ORDER BY started_at DESC LIMIT 3`),
    async dismiss(id: string) { await database.runAsync('UPDATE focus_sessions SET dismissed_at = ? WHERE id = ?', Date.now(), id); emit(); },
    history: (limit = 100) => database.getAllAsync<FocusSession>('SELECT * FROM focus_sessions ORDER BY started_at DESC,id DESC LIMIT ?', limit),
    totals: () => database.getFirstAsync<{ focusedMs: number; completed: number }>("SELECT coalesce(sum(focused_ms),0) AS focusedMs,coalesce(sum(status = 'completed'),0) AS completed FROM focus_sessions"),
    perNote: () => database.getAllAsync<{ noteKey: NoteKey; focusedMs: number; sessions: number }>('SELECT note_key AS noteKey,sum(focused_ms) AS focusedMs,count(*) AS sessions FROM focus_sessions GROUP BY note_key ORDER BY focusedMs DESC'),
  };
}
