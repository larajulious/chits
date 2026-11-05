import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/notes/note-formatting-sheet.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source.slice(source.indexOf('export function NoteFormattingSheet')), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture() {
  const refs = [], states = [], effects = [], pending = [], animations = [];
  let ri, si, ei;
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, require: () => ({ jsx, jsxs: jsx }),
    useLocale: () => {}, useTheme: () => ({ tokens: {} }), useReducedMotion: () => false,
    useRef: value => refs[ri++] ?? (refs[ri - 1] = { current: value }),
    useState: initial => { const index = si++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = value; }]; },
    useLayoutEffect: callback => pending.push(callback),
    useEffect: (callback, deps) => {
      const index = ei++, old = effects[index];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; });
    },
    Animated: { View: 'AnimatedView', Value: class {}, timing: () => {
      let done;
      const animation = { start: callback => { done = callback; }, stop: () => done?.({ finished: false }), finish: () => done?.({ finished: true }) };
      animations.push(animation); return animation;
    } },
    View: 'View', AppText: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
    formattingText: value => value, NOTE_TEXT_COLORS: {}, NOTE_HIGHLIGHTS: {}, StyleSheet: { create: value => value },
  };
  vm.runInNewContext(code, context);
  const editor = { current: null };
  return { animations, render(open, closing, onClosed) {
    ri = 0; si = 0; ei = 0;
    context.exports.NoteFormattingSheet({ editor, open, closing, onClose: () => {}, onClosed });
    while (pending.length) pending.shift()();
  } };
}
test('sheet reports completion only after a finished close, using the latest callback', () => {
  const f = fixture(), calls = [];
  f.render(false, false, () => calls.push('initial')); assert.equal(calls.length, 0);
  f.render(true, false, () => calls.push('open'));
  f.render(false, true, () => calls.push('old'));
  const closing = f.animations.at(-1);
  f.render(false, true, () => calls.push('latest'));
  assert.equal(f.animations.at(-1), closing, 'callback changes cannot restart the animation');
  closing.finish(); assert.deepEqual(calls, ['latest']);
});
test('rapid reopen cancels the old completion; a close before mounting an open frame still completes', () => {
  const f = fixture(), calls = [];
  f.render(true, false, () => calls.push('open'));
  f.render(false, true, () => calls.push('old'));
  f.render(true, false, () => calls.push('new'));
  assert.deepEqual(calls, []);
  const fast = fixture(); fast.render(false, false, () => {});
  fast.render(false, true, () => calls.push('unpresented close'));
  assert.deepEqual(calls, ['unpresented close']);
});
