export const NOTE_CANVAS_COLUMNS: Record<string, string[]> = {
  note_canvas_positions: ['note_key', 'x', 'y', 'z', 'updated_at'],
};

// Where each note sits on the Notes board. Presentation only: keyed by note key
// (card:id or thought:id) with no foreign keys, so nothing here can touch a note,
// and a note that is archived keeps its spot for when it comes back.
export const NOTE_CANVAS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS note_canvas_positions (
    note_key TEXT PRIMARY KEY NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`;
