export const FOCUS_COLUMNS: Record<string, string[]> = {
  focus_sessions: ['id', 'note_key', 'started_at', 'ended_at', 'planned_ms', 'focused_ms', 'paused_ms', 'checkpoint_at', 'status', 'completed_at', 'dismissed_at', 'clock_adjusted'],
};

// A historical reference deliberately survives note deletion. Never store note
// text, titles, files or checklist snapshots in a session.
export const FOCUS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS focus_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    note_key TEXT NOT NULL CHECK (note_key GLOB 'thought:?*' OR note_key GLOB 'card:?*'),
    started_at INTEGER NOT NULL, ended_at INTEGER,
    planned_ms INTEGER CHECK (planned_ms IS NULL OR planned_ms BETWEEN 60000 AND 43200000),
    focused_ms INTEGER NOT NULL DEFAULT 0 CHECK (focused_ms >= 0),
    paused_ms INTEGER NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
    checkpoint_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','paused','unfinished','completed')),
    completed_at INTEGER, dismissed_at INTEGER,
    clock_adjusted INTEGER NOT NULL DEFAULT 0 CHECK (clock_adjusted IN (0,1)),
    CHECK (planned_ms IS NULL OR focused_ms <= planned_ms),
    CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
    CHECK ((status IN ('unfinished','completed')) = (ended_at IS NOT NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_single_active ON focus_sessions((1)) WHERE status IN ('running','paused');
  CREATE INDEX IF NOT EXISTS idx_focus_note_history ON focus_sessions(note_key,started_at DESC);
  CREATE TRIGGER IF NOT EXISTS focus_organize AFTER INSERT ON card_messages BEGIN
    UPDATE focus_sessions SET note_key = 'card:' || NEW.card_id WHERE note_key = 'thought:' || NEW.message_id;
  END;
`;
