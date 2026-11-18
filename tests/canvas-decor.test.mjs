import assert from 'node:assert/strict';
import test from 'node:test';
import { decorBounds, decorSettingKey, hitDecor, MAX_DECOR, parseDecor } from '../src/services/canvas-decor.ts';

const piece = (extra = {}) => ({ id: 'a', key: 'heart', x: 10, y: 20, scale: 1, rot: 0, behind: false, z: 1, ...extra });

test('each filter keeps its decorations under its own setting', () => {
  assert.equal(decorSettingKey('all'), 'notes_canvas_decor.all');
  assert.notEqual(decorSettingKey('all'), decorSettingKey('unorganized'));
});

test('saved pieces read back, and anything malformed or unknown is dropped rather than thrown', () => {
  const known = (key) => key === 'heart' || key === 'label-tag';
  assert.deepEqual(parseDecor(null, known), []);
  assert.deepEqual(parseDecor('not json', known), []);
  assert.deepEqual(parseDecor('{"a":1}', known), []);
  const saved = JSON.stringify([
    piece(),
    piece({ id: 'b', key: 'retired-sticker' }),
    piece({ id: 'c', x: 'far' }),
    piece({ id: 'd', key: 'label-tag', text: 'A very long label word here', ink: 'red', scale: 99, behind: true }),
  ]);
  const pieces = parseDecor(saved, known);
  assert.deepEqual(pieces.map((p) => p.id), ['a', 'd']);
  assert.equal(pieces[1].text.length, 16);
  assert.equal(pieces[1].ink, undefined);
  assert.equal(pieces[1].scale, 3);
  assert.equal(pieces[1].behind, true);
  assert.equal(parseDecor(JSON.stringify(Array.from({ length: MAX_DECOR + 10 }, (_, i) => piece({ id: `p${i}` }))), known).length, MAX_DECOR);
});

test('a touch finds the topmost piece, inside its turned outline', () => {
  const boxes = [
    { id: 'top', x: 0, y: 0, halfW: 50, halfH: 10, rot: 90 },
    { id: 'under', x: 0, y: 0, halfW: 50, halfH: 50, rot: 0 },
  ];
  // Turned a quarter, the top strip is tall and thin.
  assert.equal(hitDecor(boxes, 0, 40, 0), 'top');
  assert.equal(hitDecor(boxes, 40, 0, 0), 'under');
  assert.equal(hitDecor(boxes, 60, 0, 0), null);
  assert.equal(hitDecor(boxes, 60, 0, 12), 'under');
});

test('panning bounds reach every piece, with room for any turn', () => {
  assert.equal(decorBounds([], () => ({ w: 10, h: 10 })), null);
  const bounds = decorBounds([piece({ x: 0, y: 0, scale: 2 }), piece({ id: 'b', x: 100, y: 50 })], () => ({ w: 40, h: 20 }));
  assert.deepEqual(bounds, { x: -40, y: -40, width: 160, height: 110 });
});
