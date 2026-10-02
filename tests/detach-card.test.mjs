import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { detachConfirmationMessage } from '../src/services/detach-card.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Move back to Unorganized confirmation explains the simple and the lossy cases', () => {
  const simple = detachConfirmationMessage({ boardName: 'Work', messageCount: 1, commentCount: 0, attachmentCount: 0 });
  assert.equal(simple, 'This card will be removed from Work and its Chit will return to Unorganized.\n\nYour Chits stay in Chat.');
  const merged = detachConfirmationMessage({ boardName: 'Home', messageCount: 3, commentCount: 2, attachmentCount: 1 });
  assert.match(merged, /its 3 Chits will return to Unorganized/);
  assert.match(merged, /• 2 comments\n• 1 attachment/);
  assert.match(detachConfirmationMessage({ boardName: null, messageCount: 1, commentCount: 0, attachmentCount: 0 }), /^This card will be removed and its Chit/);
});

test('both entry points always ask before moving a card back to Unorganized', () => {
  for (const path of ['src/app/card/[id].native.tsx', 'src/app/(tabs)/index.native.tsx']) {
    const source = read(path);
    assert.match(source, /message: detachConfirmationMessage\(/, path);
    // The old shortcut that skipped the confirmation for simple cards is gone.
    assert.doesNotMatch(source, /if \(!messageParts\.length\)/, path);
  }
});

test('Card details edit controls follow the board accent', () => {
  const detail = read('src/app/card/[id].native.tsx');
  assert.match(detail, /openContentEditor\(messages\[0\]\)\}><(?:App)?Text style=\{\[styles\.inlineEditText, \{ color: contentAccentStrong \}\]\}>Edit<\/(?:App)?Text>/);
  assert.match(detail, /name="create-outline" size=\{16\} color=\{contentAccentStrong\} \/><(?:App)?Text style=\{\[styles\.inlineEditText, \{ color: contentAccentStrong \}\]\}>Edit</);
  assert.match(detail, /color=\{contentAccentStrong\} \/><(?:App)?Text style=\{\[styles\.inlineEditText, \{ color: contentAccentStrong \}\]\}>Add description</);
  assert.match(detail, /styles\.commentSend, \{ backgroundColor: [^}]*contentAccentSolid/);
  // No edit control is left on the generic theme accent.
  assert.doesNotMatch(detail, /<(?:App)?Text style=\{styles\.inlineEditText\}>/);
});
