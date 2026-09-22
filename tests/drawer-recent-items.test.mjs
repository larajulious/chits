import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const drawer = readFileSync(new URL('src/components/navigation/app-drawer.native.tsx', root), 'utf8');

test('Recent shortcuts identify cards without redundantly labeling boards', () => {
  assert.match(drawer, /<ContextRow key=\{`\$\{item\.kind\}-\$\{item\.id\}`\} item=\{item\} close=\{close\} showKind \/>/);
  assert.match(drawer, /showKind && item\.kind === 'card'/);
  assert.match(drawer, />CARD</);
  assert.doesNotMatch(drawer, />BOARD</);
  assert.match(drawer, /styles\.contextIcon/);
  assert.match(drawer, /name=\{item\.kind === 'board' \? 'grid-outline' : 'document-text-outline'\}/);
});
