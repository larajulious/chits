export const SPIN_COLUMNS: Record<string, string[]> = {
  spin_metadata: ['note_key', 'duration_minutes', 'priority', 'energy'],
  spin_history: ['id', 'note_key', 'category', 'selected_at', 'source_updated_at', 'opened_at', 'skipped_at', 'completed_at', 'challenge', 'focus_session_id'],
  spin_achievements: ['id', 'earned_at'],
};

// References and user-supplied metadata only. Original content remains canonical.
export const SPIN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS spin_metadata (
    note_key TEXT PRIMARY KEY NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 720),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
    energy TEXT CHECK (energy IS NULL OR energy IN ('low','medium','high'))
  );
  CREATE TABLE IF NOT EXISTS spin_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_key TEXT NOT NULL REFERENCES revisit_notes(note_key) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('tasks','unfinished','revisit','boards','quick','creative')),
    selected_at INTEGER NOT NULL, source_updated_at INTEGER NOT NULL,
    opened_at INTEGER, skipped_at INTEGER, completed_at INTEGER,
    challenge INTEGER NOT NULL DEFAULT 0 CHECK (challenge IN (0,1)),
    focus_session_id TEXT REFERENCES focus_sessions(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_spin_history_source ON spin_history(note_key,selected_at DESC);
  CREATE TRIGGER IF NOT EXISTS spin_organize AFTER INSERT ON card_messages BEGIN
    INSERT OR IGNORE INTO spin_metadata(note_key,duration_minutes,priority,energy)
      SELECT 'card:' || NEW.card_id,duration_minutes,priority,energy FROM spin_metadata WHERE note_key = 'thought:' || NEW.message_id;
    DELETE FROM spin_metadata WHERE note_key = 'thought:' || NEW.message_id;
    UPDATE spin_history SET note_key = 'card:' || NEW.card_id WHERE note_key = 'thought:' || NEW.message_id;
  END;
  CREATE TABLE IF NOT EXISTS spin_achievements (id TEXT PRIMARY KEY NOT NULL CHECK (id IN ('first','focus','quick','revisit','momentum','creative')), earned_at INTEGER NOT NULL);
`;

// Keep migration 31 stable for installed databases and old backups. SQLite CHECK
// constraints require rebuilding only this reference table to add a category.
export const SPIN_UNORGANIZED_SCHEMA = `
  DROP TRIGGER IF EXISTS spin_organize;
  CREATE TEMP TABLE spin_sequence_backup AS SELECT seq FROM sqlite_sequence WHERE name = 'spin_history';
  ALTER TABLE spin_history RENAME TO spin_history_previous;
  DROP INDEX IF EXISTS idx_spin_history_source;
  ${SPIN_SCHEMA.replace("'quick','creative'", "'quick','creative','unorganized'")}
  INSERT INTO spin_history(${SPIN_COLUMNS.spin_history.join(',')})
    SELECT ${SPIN_COLUMNS.spin_history.join(',')} FROM spin_history_previous;
  UPDATE sqlite_sequence SET seq = max(seq,coalesce((SELECT seq FROM spin_sequence_backup),0)) WHERE name = 'spin_history';
  DROP TABLE spin_history_previous;
  DROP TABLE spin_sequence_backup;
`;
