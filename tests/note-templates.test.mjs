import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadModule, migration, runtime, service } from './helpers/backup-runtime.mjs';
import { i18n, LANGUAGES, setFormattingPreferences } from '../src/localization/runtime.ts';
const templates = await loadModule('src/services/note-templates');
const { createMessageRepository, createBoardRepository, createSpaceRepository } = await loadModule('src/db/repositories');
const { serializeNoteContent, parseNoteContent, noteBlocksText } = await loadModule('src/services/note-content');
const task = { type: 'text', text: 'Task', list: { kind: 'checklist', id: 'old-group', checked: true } };
const document = [{ type: 'text', text: 'Today: {{date}}\n\n' }, task, { type: 'text', text: 'Details' }];
async function fixture(t) {
  const env = runtime(); t.after(() => env.cleanup());
  const db = await env.sqlite.openDatabaseAsync('chits.db');
  await migration.migrateDatabase(db);
  return { env, db, repository: templates.createTemplateRepository(db), messages: createMessageRepository(db) };
}

test('all eight built-ins use existing editor types and actionable checklists', () => {
  const builtins = templates.builtinTemplates();
  assert.equal(builtins.length, 8);
  assert.equal(new Set(builtins.map(t => t.id)).size, 8);
  for (const template of builtins) {
    assert.ok(template.title.length && template.description.length);
    assert.ok(templates.normalizeTemplateDocument(template.document).length);
    assert.ok(template.document.every(b => b.type === 'text'));
  }
  for (const id of ['meeting','todo','project','shopping']) assert.ok(builtins.find(t => t.id === `builtin:${id}`).document.some(b => b.list?.kind === 'checklist'));
});

test('built-in titles, descriptions and starter labels exist in all supported languages with fallback', async () => {
  const en = JSON.parse(readFileSync(new URL('../src/localization/locales/en.json', import.meta.url)));
  for (const lang of LANGUAGES) {
    const catalog = JSON.parse(readFileSync(new URL(`../src/localization/locales/${lang}.json`, import.meta.url)));
    for (const key of Object.keys(en).filter(k => k.startsWith('templates.'))) assert.equal(typeof catalog[key], 'string', `${lang}:${key}`);
    await i18n.changeLanguage(lang);
    assert.equal(templates.builtinTemplates()[0].title, catalog['templates.meeting.title']);
    assert.ok(templates.builtinTemplates().every(t => !noteBlocksText(t.document).includes('templates.section.')));
  }
  await i18n.changeLanguage('unsupported');
  assert.equal(templates.builtinTemplates()[0].title, en['templates.meeting.title']);
  await i18n.changeLanguage('en');
});

test('source snapshots drop identity, media references, metadata and completion without touching the source', () => {
  const source = { id: 'source', content: [task, { type: 'image', attachmentId: 'private-photo' }], text: 'Task', pinned: true, reminderAt: 12, attachments: [{ id: 'private-photo', storagePath: 'private' }] };
  const before = JSON.stringify(source);
  const copy = templates.templateFromNote(source);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(copy, [{ type: 'text', text: 'Task', list: { kind: 'checklist', id: 'g0', checked: false } }]);
  assert.ok(!JSON.stringify(copy).includes('private'));
});

test('plain text templates preserve whitespace and arbitrary text exactly', () => {
  const text = 'Heading\n\nLong paragraph\nWith lines\n\nhttps://example.org';
  assert.equal(templates.templateFromNote({ text, content: null })[0].text, text);
  assert.equal(templates.documentFromTemplateDraft(templates.templateDraft([{ type: 'text', text }]))[0].text, text);
});

test('creation expands only the supported placeholder using the local formatting locale', () => {
  const now = new Date(2026, 9, 19, 12);
  setFormattingPreferences('de-DE');
  const draft = templates.instantiateTemplate([{ type: 'text', text: '{{date}} {{name}}' }], now);
  assert.equal(draft[0].text, `${new Intl.DateTimeFormat('de-DE', { year: 'numeric', month: 'long', day: 'numeric' }).format(now)} {{name}}`);
  setFormattingPreferences('en');
  const first = templates.instantiateTemplate(document, now), second = templates.instantiateTemplate(document, now);
  assert.notEqual(first[1].list.id, second[1].list.id);
  assert.notEqual(first[0].key, second[0].key);
  assert.equal(first[1].list.checked, false);
  assert.equal(document[1].list.checked, true);
});

test('invalid documents and oversized expansions are rejected without executing or inventing blocks', () => {
  for (const input of [null, [], [{ type: 'heading', text: 'no' }], [{ type: 'image', attachmentId: 'x' }], [{ type: 'text', text: '' }], [{ type: 'text', text: 'x'.repeat(10001) }], [{ type: 'text', text: 'x', list: { kind: 'bad', id: 'g' } }]]) assert.throws(() => templates.normalizeTemplateDocument(input));
  assert.throws(() => templates.instantiateTemplate([{ type: 'text', text: 'x'.repeat(9992) + '{{date}}' }]));
});

test('template CRUD, rename, duplicate and favorites remain independent of notes and built-ins', async t => {
  const { repository, db } = await fixture(t);
  const id = await repository.create('Mine', 'Reusable', document);
  let item = (await repository.list()).find(t => t.id === id);
  assert.equal(item.document[1].list.checked, false);
  await repository.favorite(id, true);
  await repository.favorite('builtin:meeting', true);
  assert.equal((await repository.list()).filter(t => t.favorite).length, 2);
  await repository.favorite(id, true);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM note_template_favorites').get().n, 2);
  await repository.rename(id, 'Renamed');
  item = (await repository.list()).find(t => t.id === id);
  assert.equal(item.title, 'Renamed');
  const duplicate = await repository.duplicate(item);
  await repository.update(id, 'Changed', '', [{ type: 'text', text: 'Different' }]);
  assert.deepEqual((await repository.list()).find(t => t.id === duplicate).document, item.document);
  await repository.remove(id);
  assert.ok(!(await repository.list()).some(t => t.id === id));
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM note_template_favorites WHERE template_id = ?').get(id).n, 0);
  await repository.favorite('builtin:meeting', false);
  await assert.rejects(repository.remove('builtin:meeting'));
  await assert.rejects(repository.create('', '', document));
  await assert.rejects(repository.update('missing', 'Name', '', document));
  await assert.rejects(repository.favorite('missing', true));
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n, 0);
});

test('migration is additive and idempotent and preserves notes through upgrading from schema 27', async t => {
  const { db, messages } = await fixture(t);
  const before = await messages.createText('Existing note');
  db.raw.exec('DROP TABLE note_template_favorites; DROP TABLE note_templates; PRAGMA user_version = 27;');
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(db.raw.prepare('PRAGMA user_version').get().user_version, migration.LATEST_SCHEMA_VERSION);
  assert.equal((await messages.getActiveById(before.id)).text, 'Existing note');
  assert.equal((await templates.createTemplateRepository(db).list()).length, 8);
});

test('two notes created from one template reopen with formatting; editing or deleting the template never changes them', async t => {
  const { repository, messages } = await fixture(t);
  const id = await repository.create('Reusable', '', document);
  const template = (await repository.list()).find(t => t.id === id);
  const a = await messages.createNote({ blocks: templates.instantiateTemplate(template.document) });
  const b = await messages.createNote({ blocks: templates.instantiateTemplate(template.document) });
  assert.notEqual(a, b);
  const original = await messages.getActiveById(a);
  assert.deepEqual(parseNoteContent(serializeNoteContent(original.content)), original.content);
  await messages.updateContent(a, templates.instantiateTemplate([{ type: 'text', text: 'Edited note' }]));
  await repository.update(id, 'New template', '', [{ type: 'text', text: 'Changed template' }]);
  await repository.remove(id);
  assert.equal((await messages.getActiveById(a)).text, 'Edited note');
  assert.ok((await messages.getActiveById(b)).content.some(b => b.list?.kind === 'checklist'));
});

test('Board and Space creation use ordinary notes with destination and atomic capacity protection', async t => {
  const { db, messages } = await fixture(t);
  db.raw.exec("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('c','b','Column',0,1,1)");
  const board = createBoardRepository(db);
  const result = await board.createNoteCard({ boardId: 'b', columnId: 'c', text: '', blocks: templates.instantiateTemplate(document) });
  assert.ok(result);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM card_messages').get().n, 1);
  const space = createSpaceRepository(db);
  const noteId = await space.createNote('desk', { blocks: templates.instantiateTemplate(document) });
  assert.ok((await messages.getActiveById(noteId)).content.some(b => b.list?.kind === 'checklist'));
  assert.equal((await space.placementFor('thought', noteId)).spaceId, 'desk');
  for (let i = 1; i < 12; i++) await space.createNote('desk', { blocks: templates.instantiateTemplate(document) });
  const count = db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n;
  await assert.rejects(space.createNote('desk', { blocks: templates.instantiateTemplate(document) }));
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n, count);
});

test('single-flight rejects rapid duplicate submissions and unlocks after failure', async () => {
  const run = templates.createSingleFlight(); let count = 0; let release;
  const pending = run(async () => { count++; await new Promise(resolve => { release = resolve; }); return 'saved'; });
  assert.equal(await run(async () => { count++; }), undefined);
  assert.equal(count, 1); release(); assert.equal(await pending, 'saved');
  await assert.rejects(run(async () => { throw new Error('failed'); }));
  await run(async () => { count++; }); assert.equal(count, 2);
});

test('custom templates and both kinds of favorites survive a real backup/restore round trip', async t => {
  const { env, db, repository } = await fixture(t);
  const id = await repository.create('Backup', 'Description', document);
  await repository.favorite(id, true); await repository.favorite('builtin:study', true);
  const before = await repository.list();
  const backup = await service.createBackup(db);
  const checked = await service.validateBackup(backup.uri);
  assert.equal(checked.valid, true);
  await service.restoreBackup(checked, db);
  const reopened = await env.sqlite.openDatabaseAsync('chits.db');
  assert.deepEqual(await templates.createTemplateRepository(reopened).list(), before);
});

test('backup validation refuses templates referencing media or unsupported document types', async t => {
  const { db, repository } = await fixture(t);
  const id = await repository.create('Bad', '', document);
  db.raw.prepare('UPDATE note_templates SET document_json = ? WHERE id = ?').run(JSON.stringify([{ type: 'image', attachmentId: 'foreign' }]), id);
  await assert.rejects(service.createBackup(db));
});

test('an older schema-27 backup upgrades with empty custom templates and keeps ordinary notes', async t => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { env, db } = await fixture(t);
  const directory = join(env.location, 'older'); mkdirSync(directory);
  const older = await env.sqlite.openDatabaseAsync('database.sqlite', {}, directory);
  await migration.migrateDatabase(older);
  const message = await createMessageRepository(older).createText('Older note');
  older.raw.exec('DROP TABLE note_template_favorites; DROP TABLE note_templates; PRAGMA user_version = 27; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
  await older.closeAsync();
  writeFileSync(join(directory, 'metadata.json'), JSON.stringify({ app: 'Chits', backupVersion: 1, schemaVersion: 27, createdAt: '2026-10-18T00:00:00Z' }));
  const archive = join(env.location, 'older.zip'); await env.archive.zip(directory, archive);
  const checked = await service.validateBackup(archive); assert.equal(checked.valid, true);
  await service.restoreBackup(checked, db);
  const restored = await env.sqlite.openDatabaseAsync('chits.db');
  assert.equal((await createMessageRepository(restored).getActiveById(message.id)).text, 'Older note');
  assert.equal((await templates.createTemplateRepository(restored).list()).length, 8);
});

test('the actual Add Note submission handler creates only once during rapid taps', async t => {
  const { runInNewContext } = await import('node:vm');
  const content = await loadModule('src/services/note-content');
  const { messages, db } = await fixture(t);
  const source = readFileSync(new URL('../src/components/boards/add-note-sheet.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const submit = async () => {');
  const body = source.slice(start, source.indexOf('\n\n  return (', start));
  let release, calls = 0, closed = 0;
  const blocks = templates.instantiateTemplate(document);
  const context = { canAdd: true, blocks, trimmed: content.noteBlocksText(blocks), draft: null, runSubmit: templates.createSingleFlight(), setSaving: () => {}, setError: () => {}, setDraft: () => {}, setBlocks: () => {}, textDraft: content.textDraft, draftHasRichContent: content.draftHasRichContent, tr: () => '', onClose: () => { closed++; }, onSubmit: async input => { calls++; await new Promise(resolve => { release = resolve; }); return messages.createNote({ blocks: input.blocks }); } };
  runInNewContext(body + '\nglobalThis.invokeSubmit = submit;', context);
  const pending = context.invokeSubmit();
  await context.invokeSubmit(); assert.equal(calls, 1);
  release(); await pending;
  assert.equal(closed, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
});

test('custom empty checklists are valid normal notes in Board and Space destinations', async t => {
  const { db, messages } = await fixture(t);
  const blocks = templates.instantiateTemplate([{ ...task, text: '' }]);
  db.raw.exec("INSERT INTO boards(id,name,created_at,updated_at) VALUES ('b','Board',1,1); INSERT INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES ('c','b','Column',0,1,1)");
  await createBoardRepository(db).createNoteCard({ boardId: 'b', columnId: 'c', text: '', blocks });
  const id = await createSpaceRepository(db).createNote('desk', { blocks });
  assert.equal((await messages.getActiveById(id)).content[0].list.kind, 'checklist');
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n, 2);
});
