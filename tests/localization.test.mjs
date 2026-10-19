import { reminderBody, reminderBodyAlternatives, planReminderSync } from '../src/services/reminder-content.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { countLabel, getFormattingLocale, i18n, LANGUAGES, normalizePreference, resolveLanguage, setFormattingPreferences, tr } from '../src/localization/runtime.ts';
import { readLanguagePreference, saveLanguagePreference } from '../src/localization/preferences.ts';
import { formatReminder, formatReminderClock } from '../src/services/reminder-time.ts';
import { getGreetingLanguage, getGreetingsForPeriod } from '../src/constants/mascot-greetings/index.ts';

const catalogs = Object.fromEntries(LANGUAGES.map(l => [l, JSON.parse(readFileSync(new URL(`../src/localization/locales/${l}.json`, import.meta.url), 'utf8'))]));
const placeholders = value => [...value.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
test('native declarations, picker registry and bundled runtime languages agree', () => {
  const registry = JSON.parse(readFileSync(new URL('../src/localization/languages.json', import.meta.url), 'utf8'));
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  assert.deepEqual(registry.map(item => item.id), [...LANGUAGES]);
  const plugins = config.plugins.filter(item => (Array.isArray(item) ? item[0] : item) === 'expo-localization');
  assert.equal(plugins.length, 1);
  for (const platform of ['ios', 'android']) assert.deepEqual(plugins[0][1].supportedLocales[platform], [...LANGUAGES]);
  assert.deepEqual(Object.keys(config.locales), [...LANGUAGES]);
});
for (const language of LANGUAGES) test(`${language}: bundled keys and interpolation match English`, () => {
  const en = catalogs.en, catalog = catalogs[language];
  // Additional CLDR plural categories are allowed for Portuguese and Spanish.
  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof catalog[key], 'string', key);
    assert.ok(catalog[key].trim().length, key);
    assert.deepEqual(placeholders(catalog[key]), placeholders(value), key);
  }
});

test('system chooses supported preferences in priority order and preserves a deliberate override', () => {
  assert.equal(resolveLanguage('system', ['ja-JP', 'es-MX', 'pt-BR']), 'ja');
  assert.equal(resolveLanguage('system', ['pt-PT']), 'pt-BR');
  assert.equal(resolveLanguage('system', ['tl-PH']), 'fil');
  assert.equal(resolveLanguage('system', ['de-DE']), 'de');
  assert.equal(resolveLanguage('fil', ['es-MX']), 'fil');
  assert.equal(normalizePreference('corrupt value'), 'system');
  assert.equal(normalizePreference(''), 'system');
});

test('every saved language survives closing SQLite and overrides changed device languages', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'chits-language-persistence-'));
  const file = join(directory, 'settings.sqlite');
  const open = () => {
    const database = new DatabaseSync(file);
    return { database, adapter: {
      getFirstSync: (sql, ...args) => database.prepare(sql).get(...args),
      runAsync: async (sql, ...args) => database.prepare(sql).run(...args),
    } };
  };
  let connection = open();
  try {
    connection.database.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER)');
    for (const language of [...LANGUAGES, 'system']) {
      await saveLanguagePreference(connection.adapter, language);
      connection.database.close();
      connection = open();
      const saved = readLanguagePreference(connection.adapter);
      assert.equal(saved, language);
      for (const tags of [['ja-JP'], ['ar-SA'], ['es-MX'], ['zh-CN']]) {
        assert.equal(resolveLanguage(saved, tags), language === 'system' ? resolveLanguage('system', tags) : language);
      }
    }
  } finally {
    connection.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('all languages switch offline, announce changes and fall back to English for an absent translation', async () => {
  const observed = [];
  const listener = l => observed.push(l);
  i18n.on('languageChanged', listener);
  for (const l of LANGUAGES) {
    await i18n.changeLanguage(l);
    assert.equal(tr('settings.language'), catalogs[l]['settings.language']);
    assert.equal(countLabel('note', 1).includes('1'), true);
    assert.equal(countLabel('note', 2).includes('2'), true);
  }
  i18n.addResource('en', 'translation', 'test.fallback', 'English fallback');
  assert.equal(tr('test.fallback'), 'English fallback');
  i18n.removeResourceBundle('es', 'unused-test-namespace');
  i18n.off('languageChanged', listener);
  assert.ok(observed.includes('fil') && observed.includes('pt-BR') && observed.includes('es'));
  await i18n.changeLanguage('en');
});

test('plural rules cover one, other and large counts without English suffixes', async () => {
  const expected = { en: ['1 note', '2 notes'], fil: ['1 tala', '2 tala'], 'pt-BR': ['1 nota', '2 notas'], es: ['1 nota', '2 notas'] };
  for (const l of Object.keys(expected)) {
    await i18n.changeLanguage(l);
    assert.deepEqual([countLabel('note', 1), countLabel('note', 2)], expected[l]);
    for (const count of [0, 1, 2, 5, 1000000]) for (const noun of ['card', 'reminder', 'checklistItem']) assert.doesNotMatch(countLabel(noun, count), /counts\.|\{\{/);
  }
  await i18n.changeLanguage('en');
});

test('the saved preference survives a new read and changes no user content, schema or reminder instant', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER); CREATE TABLE notes(id TEXT PRIMARY KEY,content TEXT,reminder_at INTEGER);');
  const content = 'Olá, kumusta 👋\nmañana 日本語 한국어 हिन्दी Tiếng Việt العربية Türkçe 🧑🏽‍💻 é';
  const instant = 1792324800000;
  db.prepare('INSERT INTO notes VALUES (?, ?, ?)').run('n1', content, instant);
  db.prepare('INSERT INTO app_settings VALUES (?, ?, ?)').run('app_style', 'sticky', 1);
  const adapter = { getFirstSync: (sql, ...args) => db.prepare(sql).get(...args), runAsync: async (sql, ...args) => db.prepare(sql).run(...args) };
  const schema = db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
  for (const l of [...LANGUAGES, 'system']) { await saveLanguagePreference(adapter, l); assert.equal(readLanguagePreference(adapter), l); }
  assert.deepEqual(db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(), schema);
  assert.equal(db.prepare('SELECT value FROM app_settings WHERE key=?').get('app_style').value, 'sticky');
  assert.deepEqual({ ...db.prepare('SELECT content,reminder_at FROM notes').get() }, { content, reminder_at: instant });
  assert.equal(db.prepare('SELECT content FROM notes WHERE content LIKE ?').get('%日本語%').content, content);
  await assert.rejects(saveLanguagePreference({ ...adapter, runAsync: async () => { throw new Error('disk full'); } }, 'es'));
  assert.equal(readLanguagePreference(adapter), 'system');
  db.close();
});

test('regional date and clock formatting changes only presentation', async () => {
  const now = new Date(2026, 9, 18, 8), later = new Date(2026, 9, 18, 17, 30);
  const instant = later.getTime();
  await i18n.changeLanguage('pt-BR'); setFormattingPreferences('pt-BR', true);
  assert.match(formatReminder(later, now), /Hoje/);
  assert.equal(formatReminderClock(later), '17:30');
  const date = new Intl.DateTimeFormat(getFormattingLocale(), { dateStyle: 'long' }).format(later);
  assert.match(date, /18 de outubro de 2026/);
  await i18n.changeLanguage('es'); setFormattingPreferences('es-MX', true);
  assert.match(formatReminder(later, now), /Hoy/);
  assert.equal(later.getTime(), instant);
  await i18n.changeLanguage('en'); setFormattingPreferences('en', null);
});

test('all mascot languages have local greetings for every time period', () => {
  for (const l of LANGUAGES) {
    assert.equal(getGreetingLanguage(l), l);
    for (const period of ['earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'lateNight']) assert.ok(getGreetingsForPeriod(l, period).length > 0);
  }
});

test('language changes do not key/remount the navigator or editor and do not reschedule reminders', () => {
  const read = p => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  assert.doesNotMatch(read('localization/provider.tsx'), /requestReminderSync|scheduleNotification|triggerAppReset|router\.|key=/);
  assert.doesNotMatch(read('app/_layout.tsx'), /key=\{(?:language|locale|i18n)/);
  assert.doesNotMatch(read('components/notes/note-blocks-editor.tsx'), /key=\{(?:language|locale|i18n)/);
});


test('changing display language does not cancel or replace an existing fallback reminder', async () => {
  const source = { hidden: true, text: 'Private words', title: null, attachmentType: 'photo' };
  await i18n.changeLanguage('en');
  const scheduled = [{ identifier: 'existing', cardId: 'c1', body: reminderBody(source) }];
  await i18n.changeLanguage('es');
  const row = { cardId: 'c1', scheduledAt: 2000, notificationId: 'existing', cardActive: true, body: reminderBody(source), bodyAlternatives: reminderBodyAlternatives(source) };
  assert.deepEqual(planReminderSync([row], scheduled, 1000), { deleteRows: [], cancel: [], schedule: [] });
  const edited = { ...source, hidden: false, text: 'New user text 📝' };
  const plan = planReminderSync([{ ...row, body: reminderBody(edited), bodyAlternatives: reminderBodyAlternatives(edited) }], scheduled, 1000);
  assert.equal(plan.schedule[0].body, edited.text);
  assert.deepEqual(plan.cancel, ['existing']);
  await i18n.changeLanguage('en');
});
