import { contentTextStyle, languageDirection } from '../src/localization/text-layout.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('native boundary/paste binding follows mounted input layout and focus, then cleans up the latest registration', () => {
  const source = readFileSync(new URL('../src/components/notes/note-blocks-editor.tsx', import.meta.url), 'utf8');
  const component = 'export ' + source.slice(source.indexOf('function BlockInput('), source.indexOf('const styles = StyleSheet.create'));
  const compiled = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const effects = [], operations = [];
  const context = {
    cancelNativeNoteKeyboard: () => operations.push(['cancel keyboard']), nativeNoteFormattingAvailable: false, syncNativeNoteFormatting: () => {}, detachNativeNoteFormatting: () => {}, useLayoutEffect: () => {},
    exports: {}, noteHeadingStyle: () => undefined, noteTextSpans: block => block.text, contentTextStyle, languageDirection, useLocale: () => 'en', require: () => ({ jsx: (type, props) => ({ type, props }) }),
    useFontStyle: () => ({}), needsSystemFont: () => false, StyleSheet: { flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style }, useTheme: () => ({ tokens: {} }), useRef: value => ({ current: value }),
    useCallback: callback => callback, useEffect: callback => effects.push(callback),
    TextInput: 'TextInput', Text: 'Text', setTimeout, clearTimeout,
    bindNativeImagePaste: (input, key) => { operations.push(['attach', input, key]); return () => operations.push(['detach', input, key]); },
    subscribeNativeBoundaryBackspace: () => () => {},
  };
  vm.runInNewContext(compiled, context);
  let focuses = 0;
  const element = context.exports.BlockInput({
    block: { key: 'active', type: 'text', text: '' }, editable: true,
    register: () => {}, onFocusBlock: () => focuses++, onBoundaryBackspace: () => {},
  });
  const input = { focus: () => assert.fail('binding must not force focus'), setNativeProps: () => assert.fail('binding must not change selection') };
  element.props.ref(input);
  const cleanups = effects.map(effect => effect());
  assert.equal(operations.at(-1)[0], 'attach');
  element.props.onLayout();
  assert.equal(operations.at(-2)[0], 'detach');
  assert.equal(operations.at(-1)[0], 'attach');
  element.props.onFocus();
  assert.equal(focuses, 1);
  assert.equal(operations.at(-2)[0], 'detach');
  assert.equal(operations.at(-1)[0], 'attach');
  for (const cleanup of cleanups) cleanup?.();
  assert.equal(operations.at(-1)[0], 'detach');
  assert.equal(operations.filter(([kind]) => kind === 'attach').length, 3);
  assert.equal(operations.filter(([kind]) => kind === 'detach').length, 3);
  element.props.ref(null);
  assert.equal(operations.at(-1)[0], 'cancel keyboard', 'unmount cancels queued IME work before releasing the native input');
});
