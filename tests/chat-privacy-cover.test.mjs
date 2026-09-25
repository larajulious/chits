import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('privacy migration is backward-safe and does not alter stored content', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE messages (id TEXT PRIMARY KEY, text TEXT, updated_at INTEGER NOT NULL);
    INSERT INTO messages VALUES ('old', 'private original', 100);
    ALTER TABLE messages ADD COLUMN is_hidden_content INTEGER NOT NULL DEFAULT 0;
  `);
  assert.deepEqual({ ...database.prepare('SELECT text, updated_at, is_hidden_content FROM messages WHERE id = ?').get('old') }, { text: 'private original', updated_at: 100, is_hidden_content: 0 });
  database.prepare('UPDATE messages SET is_hidden_content = ? WHERE id = ?').run(1, 'old');
  assert.deepEqual({ ...database.prepare('SELECT text, updated_at, is_hidden_content FROM messages WHERE id = ?').get('old') }, { text: 'private original', updated_at: 100, is_hidden_content: 1 });

  const migrations = read('src/db/migrations.ts');
  const repository = read('src/db/repositories.ts');
  assert.match(migrations, /version: 18[\s\S]*?ALTER TABLE messages ADD COLUMN is_hidden_content INTEGER NOT NULL DEFAULT 0/);
  assert.match(repository, /UPDATE messages SET is_hidden_content = \? WHERE id = \? AND deleted_at IS NULL/);
  assert.doesNotMatch(repository, /UPDATE messages SET is_hidden_content = \?, updated_at/);
});

test('covered Chat rows do not mount the original attachment renderer', () => {
  const row = read('src/components/chat/message-row.native.tsx');
  assert.match(row, /const covered = message\.isHiddenContent && !temporarilyRevealed/);
  assert.match(row, /covered\s*\? <HiddenMessageCover[\s\S]*?: <View style=\{styles\.revealedWrap\}>/);
  assert.match(row, /<BlurTargetView[\s\S]*?<BlurView[\s\S]*?intensity=\{95\}/);
  assert.match(row, /blurMethod="dimezisBlurViewSdk31Plus"/);
  assert.match(row, /Hidden photo\. Double tap to reveal\./);
  assert.match(row, /Hidden video\. Double tap to reveal\./);
  assert.match(row, /Hidden Chit\. Double tap to reveal\./);
});

test('temporary hide control lives with message metadata instead of floating over content', () => {
  const row = read('src/components/chat/message-row.native.tsx');
  const cards = read('src/components/chat/message-note-cards.native.tsx');
  assert.match(cards, /accessibilityLabel="Hide again"[\s\S]*?styles\.privacyAction/);
  assert.match(row, /onHideAgain=\{message\.isHiddenContent/);
  assert.match(row, /styles\.mediaPrivacy/);
  assert.doesNotMatch(row, /left: '18%'/);
});

test('temporary reveal is session-only and clears on navigation and background', () => {
  const screen = read('src/app/(tabs)/chat.native.tsx');
  assert.match(screen, /temporarilyRevealedIds/);
  assert.match(screen, /return \(\) => setTemporarilyRevealedIds\(new Set\(\)\)/);
  assert.match(screen, /AppState\.addEventListener\('change'[\s\S]*?state !== 'active'[\s\S]*?setTemporarilyRevealedIds\(new Set\(\)\)/);
  assert.match(screen, /repository\.setHiddenContent\(message\.id, true\)/);
  assert.match(screen, /repository\.setHiddenContent\(message\.id, false\)/);
});

test('covered actions and secondary surfaces do not expose content', () => {
  const actions = read('src/components/chat/message-actions.tsx');
  const chat = read('src/app/(tabs)/chat.native.tsx');
  const repositories = read('src/db/repositories.ts');
  const boards = read('src/app/(tabs)/index.native.tsx');
  const unorganized = read('src/app/unorganized.native.tsx');

  assert.match(actions, /const covered = message\.isHiddenContent && !temporarilyRevealed/);
  assert.match(actions, /covered \? 'Hidden Chit'/);
  assert.match(actions, /label="Reveal"/);
  assert.match(actions, /label="Show content"/);
  assert.match(actions, /label="Hide again"/);
  assert.match(actions, /!covered && copyable/);
  assert.match(chat, /if \(message\.isHiddenContent\) return 'Hidden Chit'/);
  assert.match(chat, /if \(message\.isHiddenContent\) return 'eye-off-outline'/);
  assert.match(repositories, /CASE WHEN is_hidden_content = 1 THEN 'Hidden Chit' ELSE text END AS title/);
  assert.match(repositories, /CASE WHEN is_hidden_content = 1 THEN 'Hidden Chit' ELSE COALESCE\(text, 'Attachment'\) END AS title/);
  assert.match(boards, /if \(row\.isHiddenContent === 1\) return 'Hidden Chit'/);
  assert.match(unorganized, /if \(message\.isHiddenContent\) return 'Hidden Chit'/);
  assert.match(unorganized, /if \(message\.isHiddenContent\) return <View accessibilityLabel="Hidden content"/);
});
