import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import ts from 'typescript';

const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style;
// Exercise this checkout's actual RN native-prop diff: a JSX-only assertion
// misses the null gravity update caused by the prop/style collision.
const nativeSource = readFileSync(new URL('../node_modules/react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload.js', import.meta.url), 'utf8');
const nativeCode = transformSync(nativeSource, {
  babelrc: false, configFile: false,
  plugins: ['babel-plugin-syntax-hermes-parser', '@babel/plugin-transform-flow-strip-types', '@babel/plugin-transform-modules-commonjs'],
}).code;
const native = { exports: {}, require: name => ({ __esModule: true, default: name.includes('flattenStyle') ? flatten : (a, b) => JSON.stringify(a) !== JSON.stringify(b) }) };
vm.runInNewContext(nativeCode, native);
const attributes = { textAlignVertical: true, style: { textAlignVertical: true, padding: true, flex: true, minHeight: true } };
const source = readFileSync(new URL('../src/components/notes/note-blocks-editor.tsx', import.meta.url), 'utf8');
const component = 'export ' + source.slice(source.indexOf('function BlockInput('), source.indexOf('const styles = StyleSheet.create'));
const code = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(style, extra) {
  const context = {
    exports: {}, require: () => ({ jsx: (type, props) => ({ type, props }) }),
    useTheme: () => ({ tokens: {} }), useRef: current => ({ current }),
    useCallback: callback => callback, useEffect: () => {}, TextInput: 'TextInput',
  };
  vm.runInNewContext(code, context);
  return context.exports.BlockInput({ block: { key: 'active', type: 'text', text: '' }, style, extra }).props;
}
const rich = { padding: 0, minHeight: 26, textAlignVertical: 'top' };
const plain = { flex: 1, padding: 16 };
function nativeAlignmentAfter(before, after) {
  const initial = native.exports.create(before, attributes);
  const update = native.exports.diff(before, after, attributes);
  return { initial, update, alignment: { ...initial, ...update }.textAlignVertical };
}

test('native alignment stays top when a formatted input returns to fullscreen plain layout', () => {
  const { alignment } = nativeAlignmentAfter(render(rich), render(plain));
  assert.equal(alignment, 'top');
});

test('native alignment stays top across repeated plain/list/cleared transitions', () => {
  for (const [before, after] of [[plain, rich], [rich, plain], [[rich, { minHeight: 28 }], plain]]) {
    assert.equal(nativeAlignmentAfter(render(before), render(after)).alignment, 'top');
  }
});

test('compact Chat centers only when requested and returns to top when expanded', () => {
  const compact = render(plain, { textAlignVertical: 'center', scrollEnabled: false });
  const expanded = render(plain, { textAlignVertical: 'top', scrollEnabled: true });
  assert.equal(nativeAlignmentAfter(compact, expanded).alignment, 'top');
  assert.equal(nativeAlignmentAfter(expanded, compact).alignment, 'center');
  assert.equal(compact.scrollEnabled, false);
  assert.equal(expanded.scrollEnabled, true);
});
