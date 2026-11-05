import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { NOTE_HIGHLIGHTS, NOTE_TEXT_COLORS, formatRange, marksAt } from '../src/services/note-rich-text.ts';
import { noteFontStyle } from '../src/services/note-text-style.ts';
import { draftContentForStorage, draftFromNote, parseNoteContent } from '../src/services/note-content.ts';

const jsx = (type, props) => ({ type, props });
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const richSource = readFileSync(new URL('../src/components/notes/note-rich-text.tsx', import.meta.url), 'utf8');
const richContext = { exports: {}, require: () => ({ jsx, jsxs: jsx }), Text: 'Text', noteFontStyle, NOTE_HIGHLIGHTS, NOTE_TEXT_COLORS };
vm.runInNewContext(compile(richSource.slice(richSource.indexOf('export function noteMarkStyle'))), richContext);
const source = readFileSync(new URL('../src/components/notes/note-blocks-editor.tsx', import.meta.url), 'utf8');
const context = {
    nativeNoteFormattingAvailable: false, syncNativeNoteFormatting: () => {}, detachNativeNoteFormatting: () => {}, useLayoutEffect: () => {},
  exports: {}, require: () => ({ jsx, jsxs: jsx }), ...richContext.exports,
  TextInput: 'TextInput', Text: 'Text', useLocale: () => 'en', useTheme: () => ({ tokens: {} }),
  useFontStyle: () => ({ fontFamily: 'Nunito_600SemiBold' }), needsSystemFont: () => false,
  StyleSheet: { flatten: value => value }, contentTextStyle: () => ({}), languageDirection: () => 'ltr',
  useRef: current => ({ current }), useCallback: callback => callback, useEffect: () => {},
};
vm.runInNewContext(compile('export ' + source.slice(source.indexOf('function BlockInput('), source.indexOf('const styles = StyleSheet.create'))), context);
const render = block => context.exports.BlockInput({ block, editable: true, style: {}, maxLength: 10000 }).props;
const words = node => node == null ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : words(node.props.children);

test('plain, colored and highlighted text keep one attributed native root without switching input value modes', () => {
  let block = { key: 'body', type: 'text', text: 'textA\ntextB' };
  for (const patch of [null, { color: 'red' }, { highlight: 'pink' }, { color: 'blue' }, { highlight: 'none', color: 'default' }]) {
    if (patch) block = formatRange(block, 6, 11, patch);
    const props = render(block);
    assert.equal(props.value, undefined, 'no value-to-children transition on the first color');
    assert.equal(props.children.type, 'Text', 'one stable native text root');
    assert.equal(props.multiline, true);
    assert.equal(words(props.children), 'textA\ntextB');
  }
});

test('color and highlight runs preserve exact line separators, blank lines and trailing Enter through render and reopen', () => {
  for (const text of ['textA\ntextB', '\ntextA\n\ntextB\n', 'textA\r\ntextB', '😀 textA\ntextB\n']) {
    const start = text.indexOf('textB');
    let block = { key: 'body', type: 'text', text };
    for (const patch of [{ color: 'red' }, { highlight: 'pink' }, { color: 'green', bold: true }, { color: 'default', highlight: 'none', bold: false }]) {
      block = formatRange(block, start, start + 5, patch);
      assert.equal(words(render(block).children), text);
      const content = draftContentForStorage([block]);
      const reopened = draftFromNote({ text, content: parseNoteContent(content), attachments: [] });
      assert.equal(reopened[0].text, text);
      assert.deepEqual(marksAt(reopened[0], start, start + 5), marksAt(block, start, start + 5));
    }
  }
});

test('native Android keeps the canonical value and never sends styled children during formatting', () => {
  context.nativeNoteFormattingAvailable = true;
  try {
    let block = { key: 'body', type: 'text', text: 'textA\ntextB\n\ntextC' };
    for (const patch of [null, { color: 'red' }, { highlight: 'pink' }, { bold: true, italic: true }, { color: 'default', highlight: 'none', bold: false, italic: false }]) {
      if (patch) block = formatRange(block, 6, 11, patch);
      const props = render(block);
      assert.equal(props.value, 'textA\ntextB\n\ntextC');
      assert.equal(props.children, undefined);
      assert.equal(props.multiline, true);
    }
  } finally { context.nativeNoteFormattingAvailable = false; }
});
