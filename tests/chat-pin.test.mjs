import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('pinning targets the message selected by the action sheet', () => {
  const sheet = read('src/components/chat/message-actions.tsx');
  const screen = read('src/app/(tabs)/chat.native.tsx');
  const repository = read('src/db/repositories.ts');

  assert.match(sheet, /onPin: \(message: Message\) => void/);
  assert.match(sheet, /label=\{message\.pinned \? 'Unpin' : 'Pin'\} onPress=\{\(\) => onPin\(message\)\}/);
  assert.match(screen, /const togglePin = \(message: Message\) => \{ const pinned = !message\.pinned;/);
  assert.match(screen, /repository\.setPinned\(message\.id, pinned\)/);
  assert.match(screen, /repository\.setPinned\(message\.id, pinned\);[\s\S]*?await refreshPinned\(\)/);
  assert.match(repository, /UPDATE messages SET pinned = \?, updated_at = \? WHERE id = \? AND deleted_at IS NULL AND archived_at IS NULL/);
  assert.match(repository, /async listPinned\(\)/);
});

test('pinned thoughts stay inline in the Chat header row and can be reopened', () => {
  const header = read('src/components/chat/chat-header.tsx');
  const screen = read('src/app/(tabs)/chat.native.tsx');

  assert.match(header, /Pinned thought: \$\{pinnedPreview\(message\)\}/);
  assert.match(header, /styles\.pinnedList/);
  assert.ok(header.indexOf('accessibilityLabel="Search Chat"') < header.indexOf('styles.pinnedList'), 'pinned items sit after the search icon');
  assert.ok(header.indexOf('styles.pinnedList') < header.indexOf('accessibilityLabel="Close"'), 'pinned items sit before the close icon — search icon, pinned items, and close icon all in one row');
  assert.match(header, /style=\{\[styles\.overlay, \{ backgroundColor: tokens\.background \}\]\}/);
  assert.match(screen, /<ChatHeader[\s\S]*?onHeight=\{\(height\) => \{ setHeaderHeight\(height\);/);
  assert.match(screen, /const openPinned = useCallback\(\(message: Message\) => \{[\s\S]*?setFocusedId\(message\.id\);/);
});

test('the action sheet backdrop cannot receive taps meant for Pin', () => {
  const sheet = read('src/components/chat/message-actions.tsx');

  assert.match(sheet, /<Pressable accessibilityRole="button" accessibilityLabel="Close thought actions" onPress=\{onDismiss\} style=\{StyleSheet\.absoluteFill\} \/>/);
  assert.match(sheet, /<SafeAreaView edges=\{\['bottom'\]\} style=\{styles\.sheet\}>\s*<BottomSheetSurface>/);
  assert.doesNotMatch(sheet, /sheetTapShield/);
});

test('removing a pinned thought refreshes the pinned header', () => {
  const screen = read('src/app/(tabs)/chat.native.tsx');

  assert.match(screen, /await repository\.archive\(message\.id\);[\s\S]*?await refreshPinned\(\)/);
  assert.match(screen, /await repository\.deletePermanently\(message\.id\);[\s\S]*?await refreshPinned\(\)/);
  assert.match(screen, /const refreshPinned = useCallback\(async \(\) => \{[\s\S]*?repository\.listPinned\(\)/);
});
