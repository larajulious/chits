import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/board/[id].native.tsx', import.meta.url), 'utf8');
const navigator = source.slice(source.indexOf('function ColumnNavigator'), source.indexOf('function DragDots'));

test('column navigator is a compact text rail rather than a chip control', () => {
  assert.doesNotMatch(navigator, />COLUMNS</);
  assert.doesNotMatch(navigator, /navigatorCount|navigatorHeader|navigatorLabel/);
  assert.doesNotMatch(navigator, /borderColor: selected|backgroundColor: selected/);
  assert.match(navigator, /columnIndex \+ 1} of \{columns\.length/);
  assert.match(navigator, /styles\.navigatorNameSelected/);
});

test('column navigator centers the active item and animates one underline', () => {
  assert.match(navigator, /activeLayout\.x \+ activeLayout\.width \/ 2 - viewportWidth \/ 2/);
  assert.match(navigator, /withTiming\(nextX, \{ duration: 220 \}\)/);
  assert.match(navigator, /<Animated\.View[^>]+styles\.navigatorIndicator/);
  assert.match(navigator, /animated: !reduceMotion/);
  assert.match(navigator, /onPress=\{\(\) => onSelect\(index\)\}/);
});

test('active card lane reserves the measured navigator dock', () => {
  assert.match(source, /paddingBottom: reservedNavigatorHeight \? reservedNavigatorHeight \+ spacing\.md : spacing\.lg/);
});
