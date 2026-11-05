import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const calendar = read('src/app/(tabs)/calendar.native.tsx');

test('Calendar uses the shared header, so a new header design reaches it', () => {
  assert.match(calendar, /<AppHeader /);
  assert.doesNotMatch(calendar, /<TopBarBackground/);
  assert.doesNotMatch(calendar, /HeaderChromeContext\.Provider/);
});

test('the month navigator sits on the page, and steps aside for search', () => {
  assert.match(calendar, /const dateNavigation = view !== 'agenda' && !searchOpen \?/);
  assert.match(calendar, /<PaperDesk>[\s\S]*\{dateNavigation\}/);
});

test('every list search uses the shared field', () => {
  for (const file of ['src/app/(tabs)/calendar.native.tsx', 'src/features/focus/focus-home.tsx']) {
    const source = read(file);
    assert.match(source, /<SearchField /, file);
    assert.doesNotMatch(source, /<TextInput/, file);
  }
});

test('the Calendar opens on today, selected, and keeps that day marked when its panel closes', () => {
  const calendar = readFileSync(new URL('../src/app/(tabs)/calendar.native.tsx', import.meta.url), 'utf8');
  assert.match(calendar, /const \[selectedKey, setSelectedKey\] = useState\(todayKey\)/);
  assert.match(calendar, /const \[panelOpen, setPanelOpen\] = useState\(true\)/);
  assert.match(calendar, /<MonthView [^>]*selectedKey=\{selectedKey\}/);
});
