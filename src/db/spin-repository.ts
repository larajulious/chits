import type { SQLiteDatabase } from 'expo-sqlite';
import { createCustomSpinRepository } from './spin-custom-repository';
import { createRevisitRepository, type CompletionPlan } from './revisit-repository';
import { SPIN_DEFAULTS, normalizeSpinPreferences, spinCandidates, type SpinCandidate, type SpinExposure, type SpinMetadata, type SpinPreferences } from '../services/spin-engine';
import type { NoteKey } from '../services/revisit-engine';
import { notifySpinChanged } from '../services/spin-changes';
import { tr } from '@/localization/runtime';
import { dayMinuteToDate, parseDayKey } from '../features/calendar/calendar-schedule';

export type SpinHistory = { id: number; note_key: NoteKey; category: string; selected_at: number; source_updated_at: number; opened_at: number | null; skipped_at: number | null; completed_at: number | null; challenge: number; focus_session_id: string | null };
export const SPIN_VISIBILITY_KEY = 'spin_visible';
export const SPIN_ACHIEVEMENTS = ['first', 'focus', 'quick', 'revisit', 'momentum', 'creative'] as const;

export function createSpinRepository(db: SQLiteDatabase) {
  const revisit = createRevisitRepository(db);
  async function history(id: number) { return db.getFirstAsync<SpinHistory>('SELECT * FROM spin_history WHERE id = ?', id); }
  async function requireAvailable(id: number) {
    const row = await history(id);
    const note = row && await revisit.get(row.note_key);
    if (!row || !note) throw new Error(tr('spin.unavailable'));
    return { row, note };
  }
  async function preferences() {
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'spin_preferences'");
    try { return normalizeSpinPreferences(JSON.parse(row?.value ?? '{}')); } catch { return normalizeSpinPreferences(null); }
  }
  async function award(transaction = db) {
    const setting = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'spin_preferences'");
    if (setting) { try { if (!normalizeSpinPreferences(JSON.parse(setting.value)).rewards) return; } catch { /* Defaults. */ } }
    const counts = await transaction.getFirstAsync<{ spins: number; focused: number; quick: number; revisited: number; complete: number; creative: number }>(`SELECT count(*) AS spins,
      count(focus_session_id) AS focused,
      count(CASE WHEN challenge = 1 AND completed_at IS NOT NULL THEN 1 END) AS quick,
      count(CASE WHEN category = 'revisit' AND opened_at IS NOT NULL THEN 1 END) AS revisited,
      count(DISTINCT CASE WHEN completed_at IS NOT NULL THEN note_key END) AS complete,
      count(DISTINCT CASE WHEN category = 'creative' AND completed_at IS NOT NULL THEN note_key END) AS creative FROM spin_history`);
    if (!counts) return;
    const earned = [counts.spins > 0, counts.focused > 0, counts.quick > 0, counts.revisited > 0, counts.complete >= 5, counts.creative >= 3];
    for (let i = 0; i < earned.length; i++) if (earned[i]) await transaction.runAsync('INSERT OR IGNORE INTO spin_achievements(id,earned_at) VALUES (?,?)', SPIN_ACHIEVEMENTS[i], Date.now());
  }
  async function visibility() {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', SPIN_VISIBILITY_KEY);
    return row?.value !== 'false';
  }
  async function entryAvailable() {
    if (!await visibility()) return false;
    try { if ((await createCustomSpinRepository(db).items()).length > 0) return true; }
    catch { /* A custom-wheel error must not hide available original notes. */ }
    // Entry eligibility reflects available content, not temporary wheel filters.
    // Keep entry access so users can adjust restrictive time/category choices.
    const data = await repository.candidates({ ...SPIN_DEFAULTS, minutes: null, energy: 'high' });
    // Built-in actions do not count as saved content for showing the entry.
    return data.candidates.length > 0;
  }
  const repository = {
    history, preferences, visibility, entryAvailable,
    async setVisibility(visible: boolean) {
      await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value,updated_at = excluded.updated_at', SPIN_VISIBILITY_KEY, visible ? 'true' : 'false', Date.now());
      notifySpinChanged();
    },
    async latest() {
      const row = await db.getFirstAsync<SpinHistory>('SELECT * FROM spin_history ORDER BY id DESC LIMIT 1');
      const note = row && await revisit.get(row.note_key);
      if (!row || !note || row.skipped_at !== null) return null;
      const metadata = await db.getFirstAsync<SpinMetadata>('SELECT * FROM spin_metadata WHERE note_key = ?', note.key);
      const kind = row.category === 'creative' ? 'creative' : row.category === 'revisit' || note.total === 0 ? 'review' : 'task';
      const candidate: SpinCandidate = { note, category: row.category as SpinCandidate['category'], kind,
        minutes: kind === 'task' ? metadata?.duration_minutes ?? null : 5, priority: metadata?.priority ?? 0, weight: 1,
        reason: row.category === 'unorganized' && kind === 'review' ? 'unorganized' : row.category === 'creative' ? 'creative' : row.category === 'revisit' ? 'revisit' : row.category === 'unfinished' && kind === 'review' ? 'continue' : kind === 'review' ? 'board' : 'work', metadata: metadata ?? undefined };
      return { candidate, id: row.id, done: row.completed_at !== null, challenge: row.challenge === 1 };
    },
    async setPreferences(value: SpinPreferences) {
      await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES ('spin_preferences',?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value,updated_at = excluded.updated_at", JSON.stringify(normalizeSpinPreferences(value)), Date.now());
      notifySpinChanged();
    },
    async candidates(value: SpinPreferences, challenge = false, now = Date.now()) {
      const revision = await revisit.revision();
      const notes = [];
      let after = '';
      while (true) {
        const page = await revisit.metadataPage(after);
        notes.push(...page);
        if (page.length < 100) break;
        after = page[page.length - 1].key;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const [metadata, exposures, settings, relationships, placements, focus, schedules] = await Promise.all([
        db.getAllAsync<SpinMetadata>('SELECT * FROM spin_metadata'),
        db.getAllAsync<SpinExposure>('SELECT note_key,selected_at,skipped_at FROM spin_history WHERE selected_at > ? OR skipped_at > ?', now - 86_400_000, now - 86_400_000),
        revisit.preferences(), revisit.relationships(),
        db.getAllAsync<{ note_key: NoteKey; space_id: string }>("SELECT coalesce('thought:' || message_id,'card:' || card_id) AS note_key,space_id FROM space_placements"),
        db.getAllAsync<{ note_key: NoteKey }>("SELECT DISTINCT note_key FROM focus_sessions WHERE status = 'unfinished' AND dismissed_at IS NULL"),
        db.getAllAsync<{ note_key: NoteKey; date_key: string; start_minute: number | null }>("SELECT coalesce('thought:' || message_id,'card:' || card_id) AS note_key,date_key,start_minute FROM calendar_entries"),
      ]);
      if (await revisit.revision() !== revision) throw new Error(tr('spin.changed'));
      const candidates = spinCandidates(notes, metadata, exposures, value, now, { challenge, revisitEnabled: settings.enabled, inactivityDays: settings.inactivityDays, relationships, spaces: new Map(placements.map(p => [p.note_key, p.space_id])), unfinishedFocus: new Set(focus.map(f => f.note_key)), planned: new Map(schedules.filter(s => parseDayKey(s.date_key)).map(s => [s.note_key,dayMinuteToDate(s.date_key,s.start_minute ?? 0).getTime()])) });
      // Urgent real tasks remain visible even when the wheel's filters exclude them.
      const overdue = notes.filter(n => n.total > n.completed && n.reminderAt !== null && n.reminderAt < now).sort((a,b) => a.reminderAt! - b.reminderAt!);
      return { candidates, overdue };
    },
    async select(candidate: SpinCandidate, challenge: boolean) {
      let id = 0;
      await db.withExclusiveTransactionAsync(async tx => {
        const note = await createRevisitRepository(tx).get(candidate.note.key);
        if (!note || note.updatedAt !== candidate.note.updatedAt || note.completed !== candidate.note.completed) throw new Error(tr('spin.changed'));
        if (challenge && candidate.kind === 'task') {
          const estimate = await tx.getFirstAsync<{ duration_minutes: number | null }>('SELECT duration_minutes FROM spin_metadata WHERE note_key = ?', note.key);
          if (!estimate?.duration_minutes || estimate.duration_minutes > 5) throw new Error(tr('spin.changed'));
        }
        const result = await tx.runAsync('INSERT INTO spin_history(note_key,category,selected_at,source_updated_at,challenge) VALUES (?,?,?,?,?)', note.key, candidate.category, Date.now(), note.updatedAt, challenge ? 1 : 0);
        id = result.lastInsertRowId;
        await award(tx);
        // Bounded recent exposure; earned achievements are retained separately.
        await tx.runAsync('DELETE FROM spin_history WHERE id NOT IN (SELECT id FROM spin_history ORDER BY id DESC LIMIT 2000)');
      });
      return id;
    },
    async skip(id: number) { await requireAvailable(id); await db.runAsync('UPDATE spin_history SET skipped_at = ? WHERE id = ? AND completed_at IS NULL', Date.now(), id); notifySpinChanged(); },
    async open(id: number) {
      await db.withExclusiveTransactionAsync(async tx => {
        const row = await tx.getFirstAsync<SpinHistory>('SELECT * FROM spin_history WHERE id = ?', id);
        const repo = createRevisitRepository(tx);
        if (!row || !await repo.get(row.note_key)) throw new Error(tr('spin.unavailable'));
        await repo.opened(row.note_key);
        await tx.runAsync('UPDATE spin_history SET opened_at = coalesce(opened_at,?) WHERE id = ?', Date.now(), id);
        await award(tx);
      });
    },
    async focus(id: number, sessionId: string) {
      const { row } = await requireAvailable(id);
      const session = await db.getFirstAsync<{ note_key: string; checkpoint_at: number; status: string }>('SELECT note_key,checkpoint_at,status FROM focus_sessions WHERE id = ?', sessionId);
      if (!session || session.note_key !== row.note_key || session.status !== 'running' || session.checkpoint_at < row.selected_at) return;
      await db.runAsync('UPDATE spin_history SET focus_session_id = ? WHERE id = ?', sessionId, id);
      await award();
    },
    async complete(id: number, plan: CompletionPlan) {
      const { row } = await requireAvailable(id);
      if (row.note_key !== plan.key || row.completed_at) throw new Error(tr('spin.changed'));
      await revisit.complete(plan, async tx => {
        await tx.runAsync('UPDATE spin_history SET completed_at = ? WHERE id = ? AND completed_at IS NULL', Date.now(), id);
        await award(tx);
      });
    },
    async confirmExercise(id: number) {
      await db.withExclusiveTransactionAsync(async tx => {
        const row = await tx.getFirstAsync<SpinHistory>('SELECT * FROM spin_history WHERE id = ?', id);
        const note = row && await createRevisitRepository(tx).get(row.note_key);
        if (!row || !note || row.completed_at || !row.opened_at) throw new Error(tr('spin.openFirst'));
        // Writing/organizing must have an actual edit; a timer alone proves nothing.
        const progressAt = row.category === 'creative' ? note.editedAt : note.updatedAt;
        if (row.category !== 'revisit' && progressAt <= row.source_updated_at) throw new Error(tr('spin.editFirst'));
        await tx.runAsync('UPDATE spin_history SET completed_at = ? WHERE id = ?', Date.now(), id);
        await award(tx);
      });
    },
    async setMetadata(value: SpinMetadata) {
      if (!await revisit.get(value.note_key) || (value.duration_minutes !== null && (!Number.isInteger(value.duration_minutes) || value.duration_minutes < 1 || value.duration_minutes > 720)) || ![0,1,2].includes(value.priority) || (value.energy !== null && !['low','medium','high'].includes(value.energy))) throw new Error(tr('spin.invalidMetadata'));
      await db.runAsync('INSERT INTO spin_metadata(note_key,duration_minutes,priority,energy) VALUES (?,?,?,?) ON CONFLICT(note_key) DO UPDATE SET duration_minutes = excluded.duration_minutes,priority = excluded.priority,energy = excluded.energy', value.note_key, value.duration_minutes, value.priority, value.energy);
      notifySpinChanged();
    },
    async achievements() { return db.getAllAsync<{ id: string; earned_at: number }>('SELECT * FROM spin_achievements ORDER BY earned_at'); },
  };
  return repository;
}
