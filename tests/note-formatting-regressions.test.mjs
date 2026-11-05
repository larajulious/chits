import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { noteFontStyle } from '../src/services/note-text-style.ts';
import { STICKY_FONT_FAMILIES } from '../src/constants/style-tokens.ts';
import { cleanMarks, formatRange, marksAt } from '../src/services/note-rich-text.ts';

const source = readFileSync(new URL('../src/components/notes/note-blocks-editor.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, context) {
  let node;
  const visit = current => {
    if (ts.isVariableDeclaration(current) && current.name.getText(ast) === name) node = current.initializer.arguments[0];
    ts.forEachChild(current, visit);
  };
  visit(ast); assert.ok(node, name);
  const code = ts.transpileModule(`const callback = ${node.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code + '\ncallback;', context);
}

test('bold, italic and their combination use actual registered Nunito faces and toggle back independently', () => {
  for (const [marks, face] of [
    [{}, 'Nunito_600SemiBold'], [{ bold: true }, 'Nunito_700Bold'],
    [{ italic: true }, 'Nunito_600SemiBold_Italic'],
    [{ bold: true, italic: true }, 'Nunito_700Bold_Italic'],
    [{ bold: false, italic: true }, 'Nunito_600SemiBold_Italic'],
    [{ bold: true, italic: false }, 'Nunito_700Bold'], [{ bold: false, italic: false }, 'Nunito_600SemiBold'],
  ]) {
    const style = noteFontStyle(marks, 'Nunito_600SemiBold');
    assert.equal(style.fontFamily, face);
    assert.equal(style.fontWeight, 'normal');
    assert.equal(style.fontStyle, 'normal');
    assert.ok(STICKY_FONT_FAMILIES.includes(face), `${face} must be registered before use`);
  }
  assert.equal(noteFontStyle({ italic: true }, 'Nunito_800ExtraBold').fontFamily, 'Nunito_800ExtraBold_Italic');
  assert.equal(noteFontStyle({ bold: true, italic: true }).fontStyle, 'italic', 'system script fallback retains native styles');
});

test('restoring a range for an inline action never requests scrolling to the block top', () => {
  const pendingFocus = { current: null }, pendingScroll = { current: 'old' };
  let target, requests = 0;
  const restore = callback('scheduleFocus', { keyboardSuppressedRef: { current: false }, formattingCursor: { current: null }, pendingFocus, pendingScroll, setFocusTarget: value => { target = value; }, setFocusRequest: update => { requests = update(requests); } });
  const cursor = { key: 'long-note', start: 900, end: 914 };
  restore(cursor, false);
  assert.equal(pendingFocus.current, cursor);
  assert.equal(target, cursor);
  assert.equal(pendingScroll.current, null);
  restore(cursor);
  assert.equal(pendingScroll.current, 'long-note', 'structural operations can still reveal a new block');
});

test('actual inline formatting handler retains the selected range and requests no block scroll', () => {
  const cursor = { key: 'body', start: 7, end: 12 };
  const liveBlocks = { current: [{ key: 'body', type: 'text', text: 'Before words after' }] };
  const restores = [];
  const action = callback('formatAction', {
    editable: true, liveBlocks, pendingMarks: { current: null }, cleanMarks, formatRange, marksAt,
    currentCursor: () => cursor, notifyFormat: () => {},
    commit: blocks => { liveBlocks.current = blocks; }, scheduleFocus: (...args) => restores.push(args),
  });
  action({ bold: true }, cursor); action({ italic: true }, cursor);
  assert.equal(liveBlocks.current[0].text, 'Before words after');
  assert.equal(marksAt(liveBlocks.current[0], 7, 12).bold, true);
  assert.equal(marksAt(liveBlocks.current[0], 7, 12).italic, true);
  assert.equal(restores.length, 2);
  assert.ok(restores.every(([range, reveal]) => range === cursor && reveal === false));
});

test('formatter retains selection, waits for keyboard dismissal and releases suppression on close/unmount', () => {
  const component = source.slice(source.indexOf('export function NoteToolbar('), source.indexOf('const toolbarStyles ='));
  const code = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const jsx = (type, props) => ({ type, props });
  const calls = [], range = { key: 'long-note', start: 900, end: 914 }, states = [false, false];
  let liveCursor = range, stateIndex, selection = { current: null }, effect, cleanup, previousDeps, onHidden, visible = true;
  const context = {
    exports: {}, require: () => ({ jsx, jsxs: jsx }), useLocale: () => {}, useDesk: () => ({}),
    useTheme: () => ({ tokens: {} }), useSafeAreaInsets: () => ({ bottom: 0 }), useKeyboardInset: () => visible ? 300 : 0,
    useState: () => { const index = stateIndex++; return [states[index], update => { states[index] = typeof update === 'function' ? update(states[index]) : update; }]; },
    useRef: () => selection,
    useLayoutEffect: (callback, deps) => {
      if (!previousDeps || deps.some((dep, i) => dep !== previousDeps[i])) { effect = callback; previousDeps = deps; }
    },
    Keyboard: { isVisible: () => visible, addListener: (event, callback) => { assert.equal(event, 'keyboardDidHide'); onHidden = callback; return { remove: () => { onHidden = null; } }; }, dismiss: () => calls.push(['dismiss']) },
    formattingText: key => key, View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', AppText: 'Text',
    NoteFormattingSheet: 'Sheet', NoteListButtons: 'Lists', styles: {}, toolbarStyles: {},
  };
  vm.runInNewContext(code, context);
  const editor = { current: { cursor: () => liveCursor, focusAt: (...args) => calls.push(['range', ...args]), setKeyboardSuppressed: value => calls.push(['suppress', value]) } };
  const render = disabled => {
    stateIndex = 0; effect = null;
    const tree = context.exports.NoteToolbar({ editor, disabled });
    if (effect) { cleanup?.(); cleanup = effect(); } return tree;
  };
  let tree = render();
  const button = tree.props.children[1].props.children[0];
  button.props.onPressIn(); liveCursor = null; button.props.onPress();
  tree = render();
  assert.equal(tree.props.children[0].props.open, false, 'controls wait while the viewport changes');
  assert.deepEqual(calls.slice(-3), [['suppress', true], ['range', range, false], ['dismiss']]);
  visible = false; onHidden(); tree = render();
  assert.equal(tree.props.children[0].props.open, true);
  tree.props.children[0].props.onClose(); render();
  assert.deepEqual(calls.at(-1), ['suppress', false]);
  assert.equal(onHidden, null);
  states[0] = true; render(); tree = render();
  assert.equal(tree.props.children[0].props.open, true, 'already-hidden keyboards do not need another hide event');
  render(true);
  assert.deepEqual(calls.at(-1), ['suppress', false]);
  render(); cleanup();
  assert.deepEqual(calls.at(-1), ['suppress', false]);
});

test('range restoration retains selection without native refocus while the keyboard is suppressed', () => {
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useLayoutEffect' && node.arguments[0]?.getText(ast).includes('const target = pendingFocus.current')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(effect);
  const code = ts.transpileModule(`const restore = ${effect.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const keyboardSuppressed of [true, false]) {
    const range = { key: 'body', start: 7, end: 12 }, selections = { current: new Map() };
    const pendingFocus = { current: range }, lastFocused = { current: null }, focused = [];
    const restore = vm.runInNewContext(code + '\nrestore;', {
      pendingFocus, lastFocused, selections, editable: true, keyboardSuppressed,
      inputs: { current: new Map([['body', { isFocused: () => false }]]) }, focusBlock: key => focused.push(key),
    });
    restore();
    assert.equal(pendingFocus.current, null);
    assert.equal(lastFocused.current, 'body');
    assert.deepEqual({ ...selections.current.get('body') }, { start: 7, end: 12 });
    assert.deepEqual(focused, keyboardSuppressed ? [] : ['body']);
  }
});

test('late keyboard blur cannot collapse a formatting session range after native acknowledgement', () => {
  const range = { key: 'body', start: 6, end: 11 };
  const formattingCursor = { current: range }, selections = { current: new Map([['body', range]]) };
  const selected = callback('selected', {
    formattingCursor, selections, pendingFocus: { current: null }, focusTarget: null,
    lastFocused: { current: 'body' }, pendingMarks: { current: null },
    setFocusTarget: () => {}, notifyFormat: () => {},
  });
  selected('body', { start: 11, end: 11 });
  assert.equal(selections.current.get('body'), range, 'blur cannot turn selected text into future typing marks');
  selected('body', { start: 6, end: 11 });
  assert.deepEqual({ ...selections.current.get('body') }, { start: 6, end: 11 });
  formattingCursor.current = null; // Direct body interaction releases the range.
  selected('body', { start: 2, end: 2 });
  assert.deepEqual({ ...selections.current.get('body') }, { start: 2, end: 2 });
});

test('explicit body interaction cancels pending formatting selection and scroll requests', () => {
  const range = { key: 'body', start: 6, end: 11 };
  const formattingCursor = { current: range }, pendingFocus = { current: range }, pendingScroll = { current: 'body' };
  let target = range;
  callback('releaseRequestedSelection', { formattingCursor, pendingFocus, pendingScroll, setFocusTarget: value => { target = value; } })();
  assert.equal(formattingCursor.current, null);
  assert.equal(pendingFocus.current, null);
  assert.equal(pendingScroll.current, null);
  assert.equal(target, null);
});
