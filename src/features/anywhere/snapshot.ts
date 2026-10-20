export type WidgetPrivacy = 'hidden' | 'titles' | 'previews';
export const WIDGET_PRIVACY_KEY = 'anywhere_privacy';
export function widgetPrivacy(value?: string | null): WidgetPrivacy {
  return value === 'titles' || value === 'previews' ? value : 'hidden';
}
export type RecentWidgetNote = { kind: 'card' | 'thought'; id: string; title: string; preview: string | null; updatedAt: number };
export function widgetNoteURL(note: Pick<RecentWidgetNote, 'kind' | 'id'>) {
  return `chits:///anywhere?kind=${note.kind}&id=${encodeURIComponent(note.id)}`;
}
export function widgetNotes(notes: RecentWidgetNote[], privacy: WidgetPrivacy) {
  if (privacy === 'hidden') return [];
  const seen = new Set<string>();
  return notes.filter(note => {
    const key = `${note.kind}:${note.id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id)).slice(0, 5).map(note => ({
    ...note, title: note.title.replace(/\s+/g, ' ').trim().slice(0, 100),
    preview: privacy === 'previews' ? note.preview?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null : null,
    url: widgetNoteURL(note),
  }));
}
export type AnywhereSnapshot = {
  version: 1; privacy: WidgetPrivacy; notes: ReturnType<typeof widgetNotes>;
  brand: string; quick: string; recent: string; empty: string; hidden: string;
  locale: string; rtl: boolean; mascot: string;
  background: string; foreground: string; secondary: string; accent: string; onAccent: string;
};

/** SQLite reports the schema alias (usually "main") separately from the file.
 * Match the provider's file, including exclusive-transaction connections. */
export function isWidgetDatabaseChange(event: { databaseFilePath: string; tableName: string }, databasePath: string) {
  const normalize = (path: string) => {
    try { return decodeURIComponent(path.replace(/^file:\/\//, '')).replace(/^\/private\/var\//, '/var/'); }
    catch { return path; }
  };
  return normalize(event.databaseFilePath) === normalize(databasePath)
    && ['messages', 'cards', 'boards', 'card_messages', 'attachments', 'app_settings'].includes(event.tableName);
}
