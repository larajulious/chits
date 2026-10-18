import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual toolbar handlers, with JSX represented as objects. Native UI
// behavior is covered separately by the Maestro formatting fixture.
function toolbar() {
  const source = readFileSync(new URL('../src/components/notes/note-blocks-editor.tsx', import.meta.url), 'utf8');
  const component = source.slice(source.indexOf('export function NoteListButtons('));
  const compiled = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {},
    require(name) { assert.equal(name, 'react/jsx-runtime'); return { jsx, jsxs: jsx }; },
    useTheme: () => ({ tokens: { textSecondary: '#555' } }),
    useState: value => [value, () => {}],
    useRef: value => ({ current: value }),
    useEffect: () => {},
    View: 'View', Pressable: 'Pressable', Icon: 'Icon', List: 'List', ListOrdered: 'Ordered', SquareCheck: 'Check', styles: {},
  };
  vm.runInNewContext(compiled, context);
  let selection = { key: 'current', start: 4, end: 4 };
  const calls = [];
  const editor = { current: { cursor: () => ({ ...selection }), toggleList: (...args) => calls.push(args) } };
  const view = context.exports.NoteListButtons({ editor });
  const buttons = view.props.children[0];
  return { calls, buttons, select: value => { selection = value; } };
}

test('toolbar applies the selection captured before a press can blur or move the caret', () => {
  for (const index of [0, 1, 2]) {
    const fixture = toolbar();
    const button = fixture.buttons[index];
    button.props.onPressIn();
    fixture.select({ key: 'other', start: 0, end: 0 });
    button.props.onPress();
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0][1].key, 'current');
    assert.equal(fixture.calls[0][1].start, 4);
    assert.equal(fixture.calls[0][1].end, 4);
  }
});

test('accessibility press without a touch snapshot uses the live editor selection', () => {
  const fixture = toolbar();
  fixture.buttons[0].props.onPress();
  assert.equal(fixture.calls[0][1], undefined);
});

test('one formatting press cannot reuse the previous press snapshot', () => {
  const fixture = toolbar();
  fixture.buttons[0].props.onPressIn();
  fixture.buttons[0].props.onPress();
  fixture.buttons[0].props.onPress();
  assert.equal(fixture.calls[1][1], undefined);
  fixture.buttons[0].props.onPressIn();
  fixture.buttons[1].props.onPress();
  assert.equal(fixture.calls[2][1], undefined);
});
