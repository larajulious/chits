// Additive metadata only. Original content, attachments and completion states stay
// in their existing tables; a card and an unorganized thought are distinct notes.
export const REVISIT_COLUMNS: Record<string, string[]> = {
  revisit_notes: ['note_key', 'message_id', 'card_id', 'last_edited_at', 'last_progress_at', 'last_opened_at', 'last_revisited_at', 'snoozed_until', 'dismissed_at', 'dismissal_count', 'excluded'],
  note_relationships: ['note_a', 'note_b', 'relationship_type', 'created_at', 'updated_at'],
  revisit_rejections: ['note_a', 'note_b', 'rejected_at'],
  revisit_events: ['id', 'note_key', 'event_type', 'created_at'],
  revisit_revision: ['id', 'revision'],
};

const checklist = (row: string) => `(SELECT json_group_array(json_object('text', json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END, '$.text'), 'list', json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END, '$.list'))) FROM json_each(CASE WHEN json_valid(${row}.content_json) THEN ${row}.content_json ELSE '[]' END) WHERE type = 'object' AND json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END, '$.type') = 'text' AND json_extract(CASE WHEN type = 'object' THEN value ELSE '{}' END, '$.list.kind') = 'checklist')`;
const clock = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
// When an existing thought is organized, its explicit connections follow it
// to the containing card. Canonical ordering still prevents duplicate pairs.
const promoteThought = `
  INSERT OR IGNORE INTO note_relationships(note_a,note_b,relationship_type,created_at,updated_at)
    SELECT min('card:' || NEW.card_id, CASE WHEN note_a = 'thought:' || NEW.message_id THEN note_b ELSE note_a END),
      max('card:' || NEW.card_id, CASE WHEN note_a = 'thought:' || NEW.message_id THEN note_b ELSE note_a END), relationship_type,created_at,updated_at
    FROM note_relationships WHERE (note_a = 'thought:' || NEW.message_id OR note_b = 'thought:' || NEW.message_id)
      AND note_a != 'card:' || NEW.card_id AND note_b != 'card:' || NEW.card_id;
  INSERT OR IGNORE INTO revisit_rejections(note_a,note_b,rejected_at)
    SELECT min('card:' || NEW.card_id, CASE WHEN note_a = 'thought:' || NEW.message_id THEN note_b ELSE note_a END),
      max('card:' || NEW.card_id, CASE WHEN note_a = 'thought:' || NEW.message_id THEN note_b ELSE note_a END),rejected_at
    FROM revisit_rejections WHERE (note_a = 'thought:' || NEW.message_id OR note_b = 'thought:' || NEW.message_id)
      AND note_a != 'card:' || NEW.card_id AND note_b != 'card:' || NEW.card_id;
  DELETE FROM note_relationships WHERE note_a = 'thought:' || NEW.message_id OR note_b = 'thought:' || NEW.message_id;
  DELETE FROM revisit_rejections WHERE note_a = 'thought:' || NEW.message_id OR note_b = 'thought:' || NEW.message_id;
  UPDATE revisit_notes SET
    last_opened_at = max(coalesce(last_opened_at,0),coalesce((SELECT last_opened_at FROM revisit_notes WHERE message_id = NEW.message_id),0)),
    last_revisited_at = max(coalesce(last_revisited_at,0),coalesce((SELECT last_revisited_at FROM revisit_notes WHERE message_id = NEW.message_id),0)),
    snoozed_until = max(coalesce(snoozed_until,0),coalesce((SELECT snoozed_until FROM revisit_notes WHERE message_id = NEW.message_id),0)),
    dismissed_at = max(coalesce(dismissed_at,0),coalesce((SELECT dismissed_at FROM revisit_notes WHERE message_id = NEW.message_id),0)),
    dismissal_count = max(dismissal_count,coalesce((SELECT dismissal_count FROM revisit_notes WHERE message_id = NEW.message_id),0)),
    excluded = max(excluded,coalesce((SELECT excluded FROM revisit_notes WHERE message_id = NEW.message_id),0))
    WHERE card_id = NEW.card_id;
`;

export const REVISIT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS revisit_notes (
    note_key TEXT PRIMARY KEY NOT NULL,
    message_id TEXT UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    card_id TEXT UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
    last_edited_at INTEGER NOT NULL, last_progress_at INTEGER NOT NULL,
    last_opened_at INTEGER, last_revisited_at INTEGER, snoozed_until INTEGER,
    dismissed_at INTEGER, dismissal_count INTEGER NOT NULL DEFAULT 0 CHECK (dismissal_count >= 0),
    excluded INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0,1)),
    CHECK ((message_id IS NULL) != (card_id IS NULL)),
    CHECK (note_key = CASE WHEN message_id IS NOT NULL THEN 'thought:' || message_id ELSE 'card:' || card_id END)
  );
  CREATE INDEX IF NOT EXISTS idx_revisit_inactivity ON revisit_notes(excluded, snoozed_until, last_edited_at);
  CREATE TABLE IF NOT EXISTS note_relationships (
    note_a TEXT NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    note_b TEXT NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'related' CHECK (relationship_type IN ('related','follow-up','reference')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (note_a, note_b), CHECK (note_a < note_b)
  );
  CREATE INDEX IF NOT EXISTS idx_note_relationships_target ON note_relationships(note_b);
  CREATE TABLE IF NOT EXISTS revisit_rejections (
    note_a TEXT NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    note_b TEXT NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    rejected_at INTEGER NOT NULL, PRIMARY KEY (note_a, note_b), CHECK (note_a < note_b)
  );
  CREATE INDEX IF NOT EXISTS idx_revisit_rejections_target ON revisit_rejections(note_b);
  CREATE TABLE IF NOT EXISTS revisit_events (
    id INTEGER PRIMARY KEY, note_key TEXT NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('revisit','snooze','dismiss','exclude','include')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_revisit_events_note ON revisit_events(note_key, created_at DESC);
  CREATE TABLE IF NOT EXISTS revisit_revision (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL);
  INSERT OR IGNORE INTO revisit_revision VALUES (1, 0);
  INSERT OR IGNORE INTO revisit_notes (note_key, message_id, last_edited_at, last_progress_at)
    SELECT 'thought:' || id, id, updated_at, updated_at FROM messages WHERE deleted_at IS NULL;
  INSERT OR IGNORE INTO revisit_notes (note_key, card_id, last_edited_at, last_progress_at, last_opened_at)
    SELECT 'card:' || c.id, c.id,
      max(c.updated_at, coalesce((SELECT max(m.updated_at) FROM messages m JOIN card_messages cm ON cm.message_id = m.id WHERE cm.card_id = c.id),0)),
      max(c.updated_at, coalesce((SELECT max(updated_at) FROM card_subtasks WHERE card_id = c.id),0), coalesce((SELECT max(m.updated_at) FROM messages m JOIN card_messages cm ON cm.message_id = m.id WHERE cm.card_id = c.id),0)),
      c.last_opened_at FROM cards c;
  CREATE TRIGGER IF NOT EXISTS revisit_message_insert AFTER INSERT ON messages WHEN NEW.deleted_at IS NULL BEGIN
    INSERT OR IGNORE INTO revisit_notes (note_key,message_id,last_edited_at,last_progress_at) VALUES ('thought:' || NEW.id,NEW.id,NEW.updated_at,NEW.updated_at);
  END;
  CREATE TRIGGER IF NOT EXISTS revisit_message_restore AFTER UPDATE OF deleted_at ON messages WHEN NEW.deleted_at IS NULL BEGIN
    INSERT OR IGNORE INTO revisit_notes (note_key,message_id,last_edited_at,last_progress_at) VALUES ('thought:' || NEW.id,NEW.id,NEW.updated_at,NEW.updated_at);
  END;
  CREATE TRIGGER IF NOT EXISTS revisit_message_delete AFTER UPDATE OF deleted_at ON messages WHEN NEW.deleted_at IS NOT NULL BEGIN
    DELETE FROM revisit_notes WHERE message_id = NEW.id;
  END;
  CREATE TRIGGER IF NOT EXISTS revisit_card_insert AFTER INSERT ON cards BEGIN
    INSERT OR IGNORE INTO revisit_notes (note_key,card_id,last_edited_at,last_progress_at) VALUES ('card:' || NEW.id,NEW.id,NEW.updated_at,NEW.updated_at);
  END;
  CREATE TRIGGER IF NOT EXISTS revisit_message_edit AFTER UPDATE OF text,content_json ON messages
    WHEN NEW.text IS NOT OLD.text OR NEW.content_json IS NOT OLD.content_json BEGIN
    UPDATE revisit_notes SET last_edited_at = NEW.updated_at,
      last_progress_at = CASE WHEN ${checklist('NEW')} IS NOT ${checklist('OLD')} THEN NEW.updated_at ELSE last_progress_at END
      WHERE message_id = NEW.id OR card_id IN (SELECT card_id FROM card_messages WHERE message_id = NEW.id);
  END;
  CREATE TRIGGER IF NOT EXISTS revisit_card_title AFTER UPDATE OF title ON cards WHEN NEW.title IS NOT OLD.title BEGIN
    UPDATE revisit_notes SET last_edited_at = NEW.updated_at WHERE card_id = NEW.id;
  END;
  CREATE TRIGGER IF NOT EXISTS revisit_card_open AFTER UPDATE OF last_opened_at ON cards BEGIN
    UPDATE revisit_notes SET last_opened_at = NEW.last_opened_at WHERE card_id = NEW.id;
  END;
  ${['INSERT','UPDATE','DELETE'].map((operation) => `
    CREATE TRIGGER IF NOT EXISTS revisit_subtask_${operation} AFTER ${operation} ON card_subtasks BEGIN
      UPDATE revisit_notes SET last_progress_at = ${clock}, last_edited_at = ${clock} WHERE card_id = ${operation === 'DELETE' ? 'OLD' : 'NEW'}.card_id;
    END;
    CREATE TRIGGER IF NOT EXISTS revisit_membership_${operation} AFTER ${operation} ON card_messages BEGIN
      ${operation === 'INSERT' ? promoteThought : ''}
      UPDATE revisit_notes SET last_progress_at = ${clock}, last_edited_at = ${clock}
        WHERE card_id = ${operation === 'DELETE' ? 'OLD' : 'NEW'}.card_id ${operation === 'UPDATE' ? 'OR card_id = OLD.card_id' : ''};
    END;`).join('\n')}
  ${['messages','cards','boards','card_messages','card_subtasks','message_reminders','card_reminders','revisit_notes','note_relationships','revisit_rejections','app_settings'].flatMap((table) => ['INSERT','UPDATE','DELETE'].map((operation) => `
    CREATE TRIGGER IF NOT EXISTS revisit_revision_${table}_${operation} AFTER ${operation} ON ${table} BEGIN
      UPDATE revisit_revision SET revision = revision + 1 WHERE id = 1;
    END;`)).join('\n')}
`;
