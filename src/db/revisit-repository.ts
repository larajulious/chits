import type { SQLiteDatabase } from 'expo-sqlite';
import { canonicalPair, type NoteKey, type RevisitNote } from '../services/revisit-engine';
import { notifyNoteChanged } from '../services/note-changes';

export type RelationshipType = 'related' | 'follow-up' | 'reference';
export type Relationship = { note_a: NoteKey; note_b: NoteKey; relationship_type: RelationshipType; created_at: number; updated_at: number };
type SourceRow = {
  note_key: NoteKey; message_id: string | null; card_id: string | null;
  last_edited_at: number; last_progress_at: number; last_opened_at: number | null;
  last_revisited_at: number | null; snoozed_until: number | null; dismissed_at: number | null; dismissal_count: number; excluded: number;
  title: string | null; created_at: number; updated_at: number; pinned: number; board_id: string | null; reminder_at: number | null;
  board_name: string | null; board_accent: string | null;
};
type ContentRow = { note_key: NoteKey; text: string | null; checklist: string };
// Count on SQLite's worker and transfer just the summary, even for a huge
// checklist or image-heavy structured document. Match the editor's parser.
const CHECKLIST_SUMMARY = `(SELECT json_array(count(*),coalesce(sum(json_type(CASE WHEN type = 'object' THEN value ELSE '{}' END,'$.list.checked') = 'true'),0))
  FROM json_each(CASE WHEN json_valid(m.content_json) THEN m.content_json ELSE '[]' END)
  WHERE type = 'object' AND json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END,'$.type') = 'text'
    AND json_type(CASE WHEN type = 'object' THEN value ELSE '{}' END,'$.text') = 'text'
    AND json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END,'$.list.kind') = 'checklist'
    AND json_type(CASE WHEN type = 'object' THEN value ELSE '{}' END,'$.list.id') = 'text'
    AND length(json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END,'$.list.id')) > 0)`;
export type CompletionPlan = { key: NoteKey; count: number; signature: string };

async function completionSnapshot(db: SQLiteDatabase, key: NoteKey) {
  const note = await createRevisitRepository(db).get(key);
  if (!note) throw new Error('This note is no longer available.');
  const id = key.slice(key.indexOf(':') + 1);
  const messages = await db.getAllAsync<{ id: string; content_json: string | null; updated_at: number }>(key.startsWith('thought:')
    ? 'SELECT id,content_json,updated_at FROM messages WHERE id = ?'
    : 'SELECT m.id,m.content_json,m.updated_at FROM messages m JOIN card_messages cm ON cm.message_id = m.id WHERE cm.card_id = ? AND m.deleted_at IS NULL AND m.archived_at IS NULL ORDER BY m.id', id);
  const subtasks = key.startsWith('card:') ? await db.getAllAsync<{ id: string; is_completed: number; updated_at: number }>('SELECT id,is_completed,updated_at FROM card_subtasks WHERE card_id = ? ORDER BY id', id) : [];
  return { note, messages, subtasks, signature: JSON.stringify({ messages, subtasks }) };
}

const SOURCES = `SELECT n.*, coalesce(c.title,m.text) AS title,
  coalesce(c.created_at,m.created_at) AS created_at, coalesce(c.updated_at,m.updated_at) AS updated_at,
  coalesce(c.pinned,m.pinned) AS pinned, c.board_id, b.name AS board_name, b.accent AS board_accent,
  CASE WHEN c.id IS NOT NULL THEN (SELECT scheduled_at FROM card_reminders WHERE card_id = c.id AND completed_at IS NULL)
    ELSE (SELECT scheduled_at FROM message_reminders WHERE message_id = m.id AND completed_at IS NULL) END AS reminder_at
  FROM revisit_notes n LEFT JOIN messages m ON m.id = n.message_id
  LEFT JOIN cards c ON c.id = n.card_id LEFT JOIN boards b ON b.id = c.board_id
  WHERE ((m.id IS NOT NULL AND m.deleted_at IS NULL AND m.archived_at IS NULL AND m.is_hidden_content = 0
    AND NOT EXISTS (SELECT 1 FROM card_messages cm WHERE cm.message_id = m.id))
    OR (c.id IS NOT NULL AND c.archived_at IS NULL AND b.archived_at IS NULL AND b.id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM card_messages cm JOIN messages hidden ON hidden.id = cm.message_id WHERE cm.card_id = c.id AND hidden.deleted_at IS NULL AND hidden.is_hidden_content = 1)))`;

const placeholders = (size: number) => Array(size).fill('?').join(',');
async function hydrate(db: SQLiteDatabase, rows: SourceRow[]): Promise<RevisitNote[]> {
  if (!rows.length) return [];
  const cards = rows.flatMap((row) => row.card_id ? [row.card_id] : []);
  const thoughts = rows.flatMap((row) => row.message_id ? [row.message_id] : []);
  const content: ContentRow[] = [];
  if (thoughts.length) content.push(...await db.getAllAsync<ContentRow>(`SELECT 'thought:' || m.id AS note_key,substr(m.text,1,12000) AS text,${CHECKLIST_SUMMARY} AS checklist FROM messages m WHERE m.id IN (${placeholders(thoughts.length)})`, ...thoughts));
  if (cards.length) content.push(...await db.getAllAsync<ContentRow>(`SELECT 'card:' || cm.card_id AS note_key,substr(m.text,1,12000) AS text,${CHECKLIST_SUMMARY} AS checklist FROM card_messages cm JOIN messages m ON m.id = cm.message_id
    WHERE cm.card_id IN (${placeholders(cards.length)}) AND m.deleted_at IS NULL AND m.archived_at IS NULL ORDER BY cm.card_id,cm.position,m.id`, ...cards));
  const tasks = cards.length ? await db.getAllAsync<{ card_id: string; total: number; completed: number }>(`SELECT card_id,count(*) AS total,sum(is_completed) AS completed FROM card_subtasks WHERE card_id IN (${placeholders(cards.length)}) GROUP BY card_id`, ...cards) : [];
  const byKey = new Map<string, { text: string[]; total: number; completed: number }>();
  for (const row of content) {
    const entry = byKey.get(row.note_key) ?? { text: [], total: 0, completed: 0 };
    if (row.text && entry.text.join('\n\n').length < 12000) entry.text.push(row.text);
    const [total, completed] = JSON.parse(row.checklist) as [number, number];
    entry.total += total; entry.completed += completed;
    byKey.set(row.note_key, entry);
  }
  const taskMap = new Map(tasks.map((task) => [task.card_id, task]));
  return rows.map((row) => {
    const body = byKey.get(row.note_key);
    const task = row.card_id ? taskMap.get(row.card_id) : null;
    const text = (body?.text.join('\n\n') ?? '').slice(0, 12000);
    return {
      key: row.note_key, title: row.title?.trim().split('\n')[0].slice(0, 100) || text.trim().split('\n')[0].slice(0, 100) || 'Untitled note', text,
      createdAt: row.created_at, updatedAt: Math.max(row.updated_at, row.last_edited_at),
      editedAt: row.last_edited_at, progressAt: row.last_progress_at, openedAt: row.last_opened_at, revisitedAt: row.last_revisited_at,
      snoozedUntil: row.snoozed_until, dismissedAt: row.dismissed_at, dismissalCount: row.dismissal_count, excluded: row.excluded === 1,
      pinned: row.pinned === 1, boardId: row.board_id, reminderAt: row.reminder_at,
      boardName: row.board_name, boardAccent: row.board_accent,
      total: (body?.total ?? 0) + (task?.total ?? 0), completed: (body?.completed ?? 0) + (task?.completed ?? 0),
    };
  });
}

export function createRevisitRepository(database: SQLiteDatabase) {
  return {
    async revision() { return (await database.getFirstAsync<{ revision: number }>('SELECT revision FROM revisit_revision WHERE id = 1'))?.revision ?? 0; },
    async supportsFTS5() { return !!(await database.getFirstAsync<{ enabled: number }>("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled"))?.enabled; },
    async page(after = '', limit = 100) { return hydrate(database, await database.getAllAsync<SourceRow>(`${SOURCES} AND n.note_key > ? ORDER BY n.note_key LIMIT ?`, after, limit)); },
    async get(key: NoteKey) { return (await hydrate(database, await database.getAllAsync<SourceRow>(`${SOURCES} AND n.note_key = ?`, key)))[0] ?? null; },
    async relationships(key?: NoteKey) { return database.getAllAsync<Relationship>(`SELECT * FROM note_relationships${key ? ' WHERE note_a = ? OR note_b = ?' : ''} ORDER BY created_at,note_a,note_b`, ...(key ? [key, key] : [])); },
    async relationshipCounts() {
      return database.getAllAsync<{ noteKey: NoteKey; count: number }>(`
        SELECT note_key AS noteKey,count(*) AS count FROM (
          SELECT note_a AS note_key FROM note_relationships
          UNION ALL SELECT note_b AS note_key FROM note_relationships
        ) GROUP BY note_key`);
    },
    async rejections() { return database.getAllAsync<{ note_a: NoteKey; note_b: NoteKey }>('SELECT note_a,note_b FROM revisit_rejections'); },
    async opened(key: NoteKey, now = Date.now()) { await database.runAsync('UPDATE revisit_notes SET last_opened_at = ? WHERE note_key = ?', now, key); },
    async review(key: NoteKey, action: 'revisit' | 'dismiss' | 'snooze' | 'exclude' | 'include', until?: number, now = Date.now()) {
      if (action === 'snooze' && (!Number.isFinite(until) || until! <= now)) throw new Error('Choose a future snooze time.');
      await database.withExclusiveTransactionAsync(async (tx) => {
        const assignments = {
          revisit: 'last_revisited_at = ?, last_opened_at = ?',
          dismiss: 'dismissed_at = ?, dismissal_count = dismissal_count + 1',
          snooze: 'snoozed_until = ?', exclude: 'excluded = 1', include: 'excluded = 0, dismissed_at = NULL, snoozed_until = NULL',
        };
        const values = action === 'revisit' ? [now, now] : action === 'dismiss' ? [now] : action === 'snooze' ? [until!] : [];
        const result = await tx.runAsync(`UPDATE revisit_notes SET ${assignments[action]} WHERE note_key = ?`, ...values, key);
        if (!result.changes) throw new Error('This note is no longer available.');
        await tx.runAsync('INSERT INTO revisit_events(note_key,event_type,created_at) VALUES (?,?,?)', key, action, now);
        // Keep bounded per-note history without losing the cumulative dismissal count.
        await tx.runAsync('DELETE FROM revisit_events WHERE note_key = ? AND id NOT IN (SELECT id FROM revisit_events WHERE note_key = ? ORDER BY id DESC LIMIT 50)', key, key);
      });
    },
    async link(a: NoteKey, b: NoteKey, type: RelationshipType = 'related', now = Date.now()) {
      const [first, second] = canonicalPair(a, b);
      await database.withExclusiveTransactionAsync(async (tx) => {
        const repo = createRevisitRepository(tx);
        if (!await repo.get(a) || !await repo.get(b)) throw new Error('One of these notes is no longer available.');
        await tx.runAsync('DELETE FROM revisit_rejections WHERE note_a = ? AND note_b = ?', first, second);
        await tx.runAsync(`INSERT INTO note_relationships(note_a,note_b,relationship_type,created_at,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(note_a,note_b) DO UPDATE SET relationship_type = excluded.relationship_type,updated_at = excluded.updated_at`, first, second, type, now, now);
      });
    },
    async unlink(a: NoteKey, b: NoteKey) {
      const [first, second] = canonicalPair(a, b);
      await database.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('DELETE FROM note_relationships WHERE note_a = ? AND note_b = ?', first, second);
        await tx.runAsync('INSERT OR REPLACE INTO revisit_rejections(note_a,note_b,rejected_at) VALUES (?,?,?)', first, second, Date.now());
      });
    },
    async reject(a: NoteKey, b: NoteKey) {
      const [first, second] = canonicalPair(a, b);
      await database.runAsync('INSERT OR REPLACE INTO revisit_rejections(note_a,note_b,rejected_at) VALUES (?,?,?)', first, second, Date.now());
    },
    async completionPlan(key: NoteKey): Promise<CompletionPlan> {
      const snapshot = await completionSnapshot(database, key);
      return { key, count: snapshot.note.total - snapshot.note.completed, signature: snapshot.signature };
    },
    // Only called after the user confirms a plan showing the exact affected
    // count. Compare all source versions inside the write transaction.
    async complete(plan: CompletionPlan) {
      const changed: string[] = [];
      await database.withExclusiveTransactionAsync(async (tx) => {
        const current = await completionSnapshot(tx, plan.key);
        if (current.signature !== plan.signature || current.note.total - current.note.completed !== plan.count || plan.count <= 0) throw new Error('The checklist changed. Review it again before marking done.');
        const now = Date.now();
        for (const message of current.messages) {
          if (!message.content_json) continue;
          const blocks: unknown = JSON.parse(message.content_json);
          if (!Array.isArray(blocks)) throw new Error('This checklist could not be read safely. Open the original note.');
          let updated = false;
          const next = blocks.map((block) => {
            if (block?.type !== 'text' || typeof block.text !== 'string' || block?.list?.kind !== 'checklist' || typeof block.list.id !== 'string' || !block.list.id || block.list.checked === true) return block;
            updated = true;
            return { ...block, list: { ...block.list, checked: true } };
          });
          if (updated) {
            await tx.runAsync('UPDATE messages SET content_json = ?, updated_at = ? WHERE id = ?', JSON.stringify(next), now, message.id);
            changed.push(message.id);
          }
        }
        if (plan.key.startsWith('card:')) await tx.runAsync('UPDATE card_subtasks SET is_completed = 1,completed_at = ?,updated_at = ? WHERE card_id = ? AND is_completed = 0', now, now, plan.key.slice('card:'.length));
      });
      for (const id of changed) notifyNoteChanged(id);
    },
    async preferences() {
      const row = await database.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'revisit_preferences'");
      try {
        const value = JSON.parse(row?.value ?? '{}');
        return { enabled: value.enabled !== false, inactivityDays: Number.isInteger(value.inactivityDays) && value.inactivityDays >= 1 && value.inactivityDays <= 365 ? value.inactivityDays as number : 14 };
      } catch { return { enabled: true, inactivityDays: 14 }; }
    },
    async setPreferences(preferences: { enabled: boolean; inactivityDays: number }) {
      if (!Number.isInteger(preferences.inactivityDays) || preferences.inactivityDays < 1 || preferences.inactivityDays > 365) throw new Error('Choose between 1 and 365 days.');
      await database.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES ('revisit_preferences',?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value,updated_at = excluded.updated_at", JSON.stringify(preferences), Date.now());
    },
  };
}
