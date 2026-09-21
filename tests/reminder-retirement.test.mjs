import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function sourceFiles(directory) {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(relative) : /\.[jt]sx?$/.test(entry.name) ? [relative] : [];
  });
}

test('active app has no retired route, UI, service, or package', () => {
  const appFiles = sourceFiles('src').filter((path) => path !== 'src/db/migrations.ts');
  const activeSource = appFiles.map(read).join('\n');
  const packageJson = JSON.parse(read('package.json'));
  const appJson = JSON.parse(read('app.json'));

  assert.doesNotMatch(activeSource, /\breminders?\b|remind me|remind later|\bhasReminder\b/i);
  assert.equal(packageJson.dependencies['expo-notifications'], undefined);
  assert.equal(packageJson.dependencies['@react-native-community/datetimepicker'], undefined);
  assert.equal(appJson.expo.plugins.some((plugin) => plugin === 'expo-notifications'), false);
  assert.equal(appFiles.some((path) => path.includes('/reminders.') || path.includes('notification-observer') || path.includes('/reminder-')), false);
  assert.doesNotMatch(read('src/app/_layout.tsx'), /name=["']reminders["']/i);
  assert.doesNotMatch(read('src/components/navigation/app-drawer.native.tsx'), /['"]\/reminders['"]/i);
});

test('retirement migration removes only deprecated scheduling data', () => {
  const migrationSource = read('src/db/migrations.ts');
  const sql = migrationSource.match(/RETIRED_SCHEDULING_DATA_MIGRATION = "([^"]+)"/)?.[1];
  assert.ok(sql, 'retirement SQL must remain directly testable');

  const database = new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE messages (id TEXT PRIMARY KEY, text TEXT);
    CREATE TABLE boards (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE board_columns (id TEXT PRIMARY KEY, board_id TEXT, name TEXT);
    CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT, column_id TEXT, title TEXT);
    CREATE TABLE attachments (id TEXT PRIMARY KEY, message_id TEXT, local_uri TEXT);
    CREATE TABLE timeline_events (id TEXT PRIMARY KEY, event_type TEXT);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
    CREATE TABLE reminders (id TEXT PRIMARY KEY, card_id TEXT, scheduled_at INTEGER, notification_id TEXT);
    INSERT INTO messages VALUES ('message-1', 'Keep this thought');
    INSERT INTO boards VALUES ('board-1', 'Keep this board');
    INSERT INTO board_columns VALUES ('column-1', 'board-1', 'Keep this column');
    INSERT INTO cards VALUES ('card-1', 'board-1', 'column-1', 'Keep this card');
    INSERT INTO attachments VALUES ('attachment-1', 'message-1', 'file:///keep.jpg');
    INSERT INTO timeline_events VALUES ('event-1', 'reminder_created');
    INSERT INTO app_settings VALUES ('reminder_default_minutes', '540', 1);
    INSERT INTO app_settings VALUES ('appearance', 'dark', 1);
    INSERT INTO reminders VALUES ('reminder-1', 'card-1', 1, 'native-id');
  `);

  database.exec(sql);

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'reminders'").get().count, 0);
  for (const table of ['messages', 'boards', 'board_columns', 'cards', 'attachments', 'timeline_events']) {
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1, `${table} content must survive`);
  }
  assert.equal(database.prepare("SELECT value FROM app_settings WHERE key = 'appearance'").get().value, 'dark');
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM app_settings WHERE key = 'reminder_default_minutes'").get().count, 0);
  assert.equal(database.prepare("SELECT event_type FROM timeline_events WHERE id = 'event-1'").get().event_type, 'reminder_created');
});

test('current system-event contract remains board and column creation only', () => {
  const types = read('src/db/types.ts');
  assert.match(types, /CHAT_TIMELINE_EVENT_TYPES\s*=\s*\['board_created',\s*'column_created'\]/);
});
