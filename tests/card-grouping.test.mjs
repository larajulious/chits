import assert from 'node:assert/strict';
import test from 'node:test';

import { groupByMonth, groupRecentNotes } from '../src/services/card-grouping.ts';

const at = (year, month, day) => ({ id: `${year}-${month}-${day}`, updatedAt: new Date(year, month - 1, day, 12).getTime() });

test('cards group into consecutive Month Year sections, newest first', () => {
  const items = [at(2026, 9, 27), at(2026, 9, 2), at(2026, 8, 30), at(2026, 7, 1), at(2025, 9, 24), at(2025, 9, 1)];
  const groups = groupByMonth(items, 'en-US');
  assert.deepEqual(groups.map((group) => group.title), ['September 2026', 'August 2026', 'July 2026', 'September 2025']);
  assert.deepEqual(groups.map((group) => [group.month, group.year]), [['September', '2026'], ['August', '2026'], ['July', '2026'], ['September', '2025']]);
  assert.deepEqual(groups.map((group) => group.items.length), [2, 1, 1, 2]);
  assert.deepEqual(groups.flatMap((group) => group.items), items);
  assert.deepEqual(groupByMonth([]), []);
});

test('recent note headings use local calendar days, then months with older years', () => {
  const now = new Date(2026, 9, 2, 10);
  const items = [
    at(2026, 10, 2), at(2026, 10, 1), at(2026, 9, 29),
    at(2026, 9, 25), at(2026, 8, 30), at(2025, 9, 24),
  ];
  const groups = groupRecentNotes(items, now, 'en-US');
  assert.deepEqual(groups.map((group) => group.title), ['Today', 'Yesterday', 'This week', 'September', 'August', 'September 2025']);
  assert.deepEqual(groups.flatMap((group) => group.items), items);
  assert.deepEqual(groupRecentNotes([], now), []);
});
