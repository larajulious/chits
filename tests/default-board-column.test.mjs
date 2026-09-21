import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('new boards start with a Notes column', () => {
  const repository = readFileSync(new URL('src/db/repositories.ts', root), 'utf8');

  assert.match(repository, /newId\(\), board\.id, 'Notes', 0, now, now/);
});
