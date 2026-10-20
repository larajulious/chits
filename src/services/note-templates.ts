import type { SQLiteDatabase } from 'expo-sqlite';
import { tr, localizedDate } from '@/localization/runtime';
import { newBlockKey, noteBlocksText, textDraft, type NoteText, type NoteDraftBlock, type NoteList } from './note-content';
import type { Message } from '@/db/types';

export const BUILTIN_TEMPLATE_IDS = ['meeting', 'journal', 'brainstorm', 'todo', 'project', 'shopping', 'study', 'expense'] as const;
export type BuiltinTemplateId = typeof BUILTIN_TEMPLATE_IDS[number];
export type NoteTemplate = { id: string; title: string; description: string; category: string; source: 'builtin' | 'custom'; document: NoteText[]; favorite: boolean; createdAt: number; updatedAt: number };
// Uses the existing text/list block schema. Templates intentionally own no media files.
export function normalizeTemplateDocument(value: unknown): NoteText[] {
  if (!Array.isArray(value) || !value.length || value.length > 2000) throw new Error(tr('templates.invalidDocument'));
  let length = 0;
  const groups = new Map<string, string>();
  const result = value.map((item): NoteText => {
    if (!item || item.type !== 'text' || typeof item.text !== 'string') throw new Error(tr('templates.invalidDocument'));
    length += item.text.length;
    if (length > 10000) throw new Error(tr('templates.invalidDocument'));
    let list: NoteList | undefined;
    if (item.list !== undefined) {
      const data = item.list;
      if (!data || !['bullet', 'numbered', 'checklist'].includes(data.kind) || typeof data.id !== 'string' || !data.id) throw new Error(tr('templates.invalidDocument'));
      if (!groups.has(data.id)) groups.set(data.id, `g${groups.size}`);
      list = data.kind === 'checklist' ? { kind: 'checklist', id: groups.get(data.id)!, checked: false } : { kind: data.kind, id: groups.get(data.id)! };
    }
    return { type: 'text', text: item.text, ...(list ? { list } : {}) };
  });
  if (!result.some((block) => block.text.trim() || block.list)) throw new Error(tr('templates.invalidDocument'));
  return result;
}
export function templateFromNote(note: Pick<Message, 'content' | 'text'>): NoteText[] {
  const blocks = note.content?.filter((block) => block.type === 'text');
  return normalizeTemplateDocument(blocks?.length ? blocks : [{ type: 'text', text: note.text ?? '' }]);
}
export function instantiateTemplate(document: NoteText[], now = new Date()): NoteDraftBlock[] {
  const date = localizedDate(now, { year: 'numeric', month: 'long', day: 'numeric' });
  const groups = new Map<string, string>();
  const expanded = normalizeTemplateDocument(document).map((block) => {
    const list = block.list;
    if (list && !groups.has(list.id)) groups.set(list.id, newBlockKey());
    return { ...block, key: newBlockKey(), text: block.text.replaceAll('{{date}}', date), ...(list ? { list: { ...list, id: groups.get(list.id)! } } : {}) };
  });
  normalizeTemplateDocument(expanded);
  return expanded;
}
export function templateDraft(document: NoteText[]): NoteDraftBlock[] {
  return normalizeTemplateDocument(document).map((block) => ({ ...block, key: newBlockKey() }));
}
export function documentFromTemplateDraft(blocks: NoteDraftBlock[]): NoteText[] {
  return normalizeTemplateDocument(blocks.filter((block) => block.type === 'text'));
}
const sections: Record<BuiltinTemplateId, string[]> = {
  meeting: ['date', 'agenda', 'discussion', 'decisions', 'actionItems', 'followUp'],
  journal: ['date', 'mood', 'highlights', 'gratitude', 'reflection'],
  brainstorm: ['problem', 'ideas', 'alternatives', 'nextSteps'],
  todo: ['priority', 'tasks', 'completedItems', 'notes'],
  project: ['overview', 'goals', 'milestones', 'tasks', 'deadlines'],
  shopping: ['categories', 'items', 'quantities', 'checklist'],
  study: ['subject', 'concepts', 'explanations', 'questions', 'summary'],
  expense: ['date', 'purchases', 'amounts', 'categories', 'notes'],
};
function builtinDocument(id: BuiltinTemplateId): NoteText[] {
  const result: NoteText[] = [];
  let paragraphs: string[] = [];
  const flush = () => { if (paragraphs.length) result.push({ type: 'text', text: paragraphs.join('\n\n') }); paragraphs = []; };
  for (const section of sections[id]) {
    const label = tr(`templates.section.${section}`);
    paragraphs.push(section === 'date' ? `${label}: {{date}}` : `${label}:`);
    const checklist = ['tasks', 'actionItems', 'checklist'].includes(section);
    const bullet = ['agenda', 'ideas', 'goals', 'milestones', 'items', 'questions'].includes(section);
    if (checklist || bullet) {
      flush();
      result.push({ type: 'text', text: tr('templates.starterItem'), list: checklist ? { kind: 'checklist', id: section, checked: false } : { kind: 'bullet', id: section } });
    }
  }
  flush();
  return result;
}
export function builtinTemplates(): NoteTemplate[] {
  return BUILTIN_TEMPLATE_IDS.map((id) => ({
    id: `builtin:${id}`, title: tr(`templates.${id}.title`), description: tr(`templates.${id}.description`), category: id, source: 'builtin', favorite: false, createdAt: 0, updatedAt: 0,
    document: builtinDocument(id),
  }));
}
export function createSingleFlight() {
  let active = false;
  return async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    if (active) return undefined;
    active = true;
    try { return await work(); } finally { active = false; }
  };
}
type Row = { id: string; title: string; description: string; category: string; document_json: string; created_at: number; updated_at: number };
export function createTemplateRepository(database: SQLiteDatabase) {
  const read = (row: Row): NoteTemplate => ({ id: row.id, title: row.title, description: row.description, category: row.category, source: 'custom', document: normalizeTemplateDocument(JSON.parse(row.document_json)), favorite: false, createdAt: row.created_at, updatedAt: row.updated_at });
  const metadata = (title: string, description: string) => {
    if (!title.trim() || title.trim().length > 120 || description.trim().length > 240) throw new Error(tr('templates.invalidTitle'));
    return [title.trim(), description.trim()] as const;
  };
  const repository = {
    async list(): Promise<NoteTemplate[]> {
      const rows = await database.getAllAsync<Row>('SELECT * FROM note_templates ORDER BY updated_at DESC, id');
      const favorites = new Set((await database.getAllAsync<{ template_id: string }>('SELECT template_id FROM note_template_favorites')).map((row) => row.template_id));
      return [...builtinTemplates(), ...rows.map(read)].map((template) => ({ ...template, favorite: favorites.has(template.id) }));
    },
    async create(title: string, description: string, document: NoteText[]) {
      const [name, summary] = metadata(title, description);
      const json = JSON.stringify(normalizeTemplateDocument(document));
      const id = `custom:${newBlockKey()}:${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      await database.runAsync('INSERT INTO note_templates (id, title, description, document_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, summary, json, now, now);
      return id;
    },
    async update(id: string, title: string, description: string, document: NoteText[]) {
      const [name, summary] = metadata(title, description);
      const json = JSON.stringify(normalizeTemplateDocument(document));
      const result = await database.runAsync('UPDATE note_templates SET title = ?, description = ?, document_json = ?, updated_at = ? WHERE id = ?', name, summary, json, Date.now(), id);
      if (!result.changes) throw new Error(tr('templates.unavailable'));
    },
    async rename(id: string, title: string) {
      const [name] = metadata(title, '');
      const result = await database.runAsync('UPDATE note_templates SET title = ?, updated_at = ? WHERE id = ?', name, Date.now(), id);
      if (!result.changes) throw new Error(tr('templates.unavailable'));
    },
    async duplicate(template: NoteTemplate) { return repository.create(tr('templates.copyTitle', { title: template.title }).slice(0,120), template.description, template.document); },
    async remove(id: string) {
      await database.withExclusiveTransactionAsync(async (tx) => {
        if (!await tx.getFirstAsync('SELECT id FROM note_templates WHERE id = ?', id)) throw new Error(tr('templates.unavailable'));
        await tx.runAsync('DELETE FROM note_template_favorites WHERE template_id = ?', id);
        await tx.runAsync('DELETE FROM note_templates WHERE id = ?', id);
      });
    },
    async favorite(id: string, favorite: boolean) {
      await database.withExclusiveTransactionAsync(async (tx) => {
        if (!BUILTIN_TEMPLATE_IDS.some((key) => `builtin:${key}` === id) && !await tx.getFirstAsync('SELECT id FROM note_templates WHERE id = ?', id)) throw new Error(tr('templates.unavailable'));
        if (favorite) await tx.runAsync('INSERT INTO note_template_favorites (template_id, updated_at) VALUES (?, ?) ON CONFLICT(template_id) DO UPDATE SET updated_at = excluded.updated_at', id, Date.now());
        else await tx.runAsync('DELETE FROM note_template_favorites WHERE template_id = ?', id);
      });
    },
  };
  return repository;
}
export const emptyTemplateDraft = () => textDraft();
export const templateSearchText = (template: NoteTemplate, locale?: string) => `${template.title} ${template.description} ${noteBlocksText(template.document)}`.toLocaleLowerCase(locale);
