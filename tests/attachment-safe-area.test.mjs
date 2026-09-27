import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('attachment detail and fullscreen media modals own their safe-area context', () => {
  const attachments = read('src/app/(tabs)/attachments.native.tsx');
  const media = read('src/components/chat/message-row.native.tsx');

  assert.match(attachments, /<Modal[^>]+presentationStyle="fullScreen"[^>]+statusBarTranslucent=\{false\}/);
  assert.match(attachments, /<SafeAreaProvider>[\s\S]+<SafeAreaView edges=\{\['top', 'right', 'bottom', 'left'\]\}/);
  assert.equal((media.match(/<SafeAreaProvider>/g) ?? []).length, 2);
  assert.equal((media.match(/presentationStyle="fullScreen"/g) ?? []).length, 2);
  assert.doesNotMatch(media, /viewerClose:\s*\{[^}]*top:\s*54/);
});
