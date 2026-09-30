import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const drawer = readFileSync(new URL('src/components/navigation/app-drawer.native.tsx', root), 'utf8');

test('Recent and Pinned share one row, telling cards from boards by icon alone', () => {
  assert.match(drawer, /<ShortcutRow key=\{`\$\{item\.kind\}-\$\{item\.id\}`\} item=\{item\} close=\{close\} \/>/);
  assert.match(drawer, /<ShortcutRow key=\{`\$\{item\.kind\}-\$\{item\.id\}`\} item=\{item\} close=\{close\} onUnpin=/);
  // No text badge: the icon already says which kind it is.
  assert.doesNotMatch(drawer, />CARD</);
  assert.doesNotMatch(drawer, />BOARD</);
  assert.match(drawer, /styles\.contextIcon/);
  assert.match(drawer, /name=\{isBoard \? 'grid-outline' : 'document-text-outline'\}/);
});
