import assert from 'node:assert/strict';
import test from 'node:test';
import { DECOR_SETTING_KEY, decorBounds, decorSettingKey, hitDecor, loadSharedDecor, MAX_DECOR, parseDecor } from '../src/services/canvas-decor.ts';

const piece = (extra = {}) => ({ id: 'a', key: 'heart', x: 10, y: 20, scale: 1, rot: 0, behind: false, z: 1, ...extra });

test('the board keeps one set of decorations, the same under every filter', () => {
  const known = () => true;
  const shared = { key: DECOR_SETTING_KEY, value: JSON.stringify([piece({ id: 's' })]) };
  const old = { key: decorSettingKey('board-1'), value: JSON.stringify([piece({ id: 'x' })]) };
  // The shared row wins, and old per-filter rows are ignored once it exists.
  assert.deepEqual(loadSharedDecor([old, shared], known), { pieces: [piece({ id: 's' })], merged: false });
  assert.deepEqual(loadSharedDecor([], known), { pieces: [], merged: false });
});

test('the old per-filter decorations merge into the shared set once: All first, each keeping its stacking', () => {
  const known = (key) => key === 'heart';
  const rows = [
    { key: decorSettingKey('board-b'), value: JSON.stringify([piece({ id: 'b2', z: 9 }), piece({ id: 'b1', z: 2 })]) },
    { key: decorSettingKey('all'), value: JSON.stringify([piece({ id: 'a1', z: 5 }), piece({ id: 'gone', key: 'retired' })]) },
    { key: decorSettingKey('board-a'), value: JSON.stringify([piece({ id: 'c1', z: 1 }), piece({ id: 'a1', z: 1 })]) },
    { key: 'notes_canvas_view', value: '{}' },
  ];
  const { pieces, merged } = loadSharedDecor(rows, known);
  assert.equal(merged, true);
  assert.deepEqual(pieces.map((p) => [p.id, p.z]), [['a1', 1], ['c1', 2], ['b1', 3], ['b2', 4]]);
  // Positions come through untouched, so nothing moves.
  assert.deepEqual([pieces[0].x, pieces[0].y], [10, 20]);
  const many = [{ key: decorSettingKey('all'), value: JSON.stringify(Array.from({ length: MAX_DECOR }, (_, i) => piece({ id: `p${i}` }))) }, { key: decorSettingKey('z'), value: JSON.stringify([piece({ id: 'extra' })]) }];
  assert.equal(loadSharedDecor(many, known).pieces.length, MAX_DECOR);
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
