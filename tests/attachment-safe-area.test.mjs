import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('attachment detail and fullscreen media modals own their safe-area context', () => {
  const attachments = read('src/app/(tabs)/attachments.native.tsx');
  const media = read('src/components/chat/message-row.native.tsx');
  const photo = read('src/components/attachments/photo-attachment-viewer.native.tsx');

  assert.match(attachments, /<Modal[^>]+presentationStyle="fullScreen"[^>]+statusBarTranslucent=\{false\}/);
  assert.match(attachments, /<SafeAreaProvider>[\s\S]+<SafeAreaView edges=\{\['top', 'right', 'bottom', 'left'\]\}/);
  for (const viewer of [media, photo]) {
    assert.match(viewer, /<SafeAreaProvider>/);
    assert.match(viewer, /presentationStyle="fullScreen"/);
  }
  assert.match(photo, /top: insets\.top \+ 8/);
  assert.doesNotMatch(media, /viewerClose:\s*\{[^}]*top:\s*54/);
});

test('chat composer clears the system navigation bar without doubling the inset under the keyboard', () => {
  const chat = readFileSync(new URL('../src/app/(tabs)/chat.native.tsx', import.meta.url), 'utf8');
  assert.match(chat, /const insets = useSafeAreaInsets\(\);/);
  assert.match(chat, /const composerBottomPadding = keyboardVisible \? spacing\.xs : insets\.bottom > 0 \? insets\.bottom \+ spacing\.xxs : spacing\.sm;/);
  assert.match(chat, /styles\.composerDock, \{ paddingBottom: composerBottomPadding \}/);
  // The list's end spacing is derived from the measured dock (padding included), never a fixed number.
  assert.match(chat, /ListFooterComponent=\{<View style=\{\{ height: composerHeight \+ spacing\.md/);
  assert.doesNotMatch(chat, /paddingBottom: keyboardVisible \? spacing\.xs : spacing\.sm/);
});
