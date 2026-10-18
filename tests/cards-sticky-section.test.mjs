import assert from 'node:assert/strict';
import test from 'node:test';

import { findStickySection } from '../src/components/boards/cards-sticky-section.ts';

const headers = [0, 5, 12];
const layouts = new Map([[0, { y: 0, height: 40 }], [5, { y: 400, height: 40 }], [12, { y: 1000, height: 40 }]]);
const layout = (index) => layouts.get(index);

test('section moves into the app header only after its inline heading scrolls away', () => {
  for (const [offset, expected] of [[0, undefined], [39, undefined], [40, 0], [439, 0], [440, 5], [1039, 5], [1040, 12], [500, 5], [100, 0], [0, undefined], [-30, undefined]]) {
    assert.equal(findStickySection(headers, offset, 44, 44, layout), expected);
  }
});

test('heading threshold accounts for measured list padding and filter height', () => {
  assert.equal(findStickySection(headers, 459, 60, 80, layout), 0);
  assert.equal(findStickySection(headers, 460, 60, 80, layout), 5);
});

test('empty filters and not-yet-measured sections stay safe', () => {
  assert.equal(findStickySection([], 200, 44, 44, layout), undefined);
  assert.equal(findStickySection(headers, 900, 44, 44, () => undefined), undefined);
  assert.equal(findStickySection([0, 5], 900, 44, 44, (index) => index === 0 ? { y: 0, height: 40 } : undefined), 0);
});

test('measured heading height controls promotion after font size changes', () => {
  const largeHeading = () => ({ y: 0, height: 64 });
  assert.equal(findStickySection([0], 63, 44, 44, largeHeading), undefined);
  assert.equal(findStickySection([0], 64, 44, 44, largeHeading), 0);
});
