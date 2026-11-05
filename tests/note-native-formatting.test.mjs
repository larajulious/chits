import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { nativeNoteFormattingRuns } from '../src/services/note-native-formatting-data.ts';
import { formatRange } from '../src/services/note-rich-text.ts';

test('native appearance snapshots retain UTF-16 ranges, registered faces and independent color/highlight marks', () => {
  const block = formatRange({ type: 'text', text: '😀 A\ntextB' }, 5, 10, { bold: true, italic: true, color: 'red', highlight: 'pink', underline: true });
  const [run] = nativeNoteFormattingRuns(block, 'Nunito_600SemiBold');
  assert.deepEqual(run, { start: 5, end: 10, bold: true, italic: true, fontFamily: 'Nunito_700Bold_Italic', underline: true, color: '#C1444C', backgroundColor: '#F7DCE5' });
  assert.equal(block.text, '😀 A\ntextB');
  assert.deepEqual(nativeNoteFormattingRuns({ ...block, spans: undefined }), []);
  assert.equal(nativeNoteFormattingRuns(formatRange(block, 5, 10, { color: 'default' }))[0].color, '#24231F');
  const heading = formatRange({ type: 'text', text: 'Heading', heading: 1 }, 0, 7, { italic: true });
  assert.equal(nativeNoteFormattingRuns(heading, 'Nunito_600SemiBold')[0].fontFamily, 'Nunito_700Bold_Italic');
  assert.equal(nativeNoteFormattingRuns(heading)[0].bold, true, 'system heading keeps its weight when italic is applied');
  assert.deepEqual(nativeNoteFormattingRuns({ type: 'text', text: 'Heading', heading: 1 }, 'Nunito_600SemiBold'), [{ start: 0, end: 7, bold: true, fontFamily: 'Nunito_700Bold' }]);
});

const bridgeSource = readFileSync(new URL('../src/services/native-note-formatting.native.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(bridgeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function bridge(platform, native) {
  const context = { exports: {}, Date, Math, JSON, require: name => name === 'expo' ? { requireOptionalNativeModule: () => native } : name === 'react-native' ? { Platform: { OS: platform }, findNodeHandle: () => 42 } : { nativeNoteFormattingRuns } };
  vm.runInNewContext(code, context);
  return context.exports;
}
test('native bridge sends text intact, orders rapid snapshots and detaches without changing text or selection', () => {
  const calls = [];
  const native = {
    applyNoteTextFormatting: (...args) => { calls.push(args); return Promise.resolve(true); },
    detachNoteTextFormatting: tag => { calls.push(['detach', tag]); return Promise.resolve(); },
  };
  const api = bridge('android', native);
  assert.equal(api.nativeNoteFormattingAvailable, true);
  const input = { setNativeProps: () => assert.fail('must not replace native text/selection') };
  const block = formatRange({ type: 'text', text: '\ntextA\n\ntextB\n' }, 8, 13, { color: 'red' });
  api.syncNativeNoteFormatting(input, block);
  api.syncNativeNoteFormatting(input, block);
  assert.equal(calls[0][1], block.text);
  assert.deepEqual(JSON.parse(calls[0][2]), nativeNoteFormattingRuns(block));
  assert.ok(calls[1][3] > calls[0][3]);
  assert.ok(Number.isSafeInteger(calls[0][3]));
  api.detachNativeNoteFormatting(input);
  assert.deepEqual(calls.at(-1), ['detach', 42]);
});
test('old native binaries and iOS retain the attributed fallback', () => {
  assert.equal(bridge('android', {}).nativeNoteFormattingAvailable, false);
  assert.equal(bridge('ios', { applyNoteTextFormatting() {}, detachNoteTextFormatting() {} }).nativeNoteFormattingAvailable, false);
});
