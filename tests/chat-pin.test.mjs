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

test('pinned thoughts stay in Chat quick access and can be reopened', () => {
  const screen = read('src/app/(tabs)/chat.native.tsx');

  assert.match(screen, /function QuickFilterRow/);
  assert.match(screen, /accessibilityLabel=\{`Pinned: \$\{quickFilterPreview\(message\)\}`\}/);
  assert.match(screen, /<ChatHeader[\s\S]*?<QuickFilterRow pinned=\{pinnedMessages\}/);
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
