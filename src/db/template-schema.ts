export const TEMPLATE_COLUMNS = {
  note_templates: ['id', 'title', 'description', 'category', 'source', 'document_json', 'document_version', 'created_at', 'updated_at'],
  note_template_favorites: ['template_id', 'updated_at'],
};
export const TEMPLATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS note_templates (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 240),
    category TEXT NOT NULL DEFAULT 'custom',
    source TEXT NOT NULL DEFAULT 'custom' CHECK (source = 'custom'),
    document_json TEXT NOT NULL,
    document_version INTEGER NOT NULL DEFAULT 1 CHECK (document_version = 1),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_note_templates_updated ON note_templates(updated_at DESC);
  CREATE TABLE IF NOT EXISTS note_template_favorites (template_id TEXT PRIMARY KEY NOT NULL, updated_at INTEGER NOT NULL);
`;
