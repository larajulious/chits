import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoteEditorPanels } from '../src/services/note-editor-panels.ts';

function setup(visible = false) {
  const calls = [];
  const panels = createNoteEditorPanels({ suppressKeyboard: value => calls.push(['suppress', value]), hideKeyboard: () => calls.push(['hide']), resumeKeyboard: () => calls.push(['resume']) }, visible);
  const resumes = () => calls.filter(([kind]) => kind === 'resume').length;
  return { panels, calls, resumes };
}
test('Aa waits for the keyboard to hide before exposing formatting controls', () => {
  const { panels, calls, resumes } = setup(true);
  panels.openFormatting();
  assert.equal(panels.getState().sheet, 'closed');
  assert.equal(panels.getState().keyboardClosing, true);
  assert.deepEqual(calls, [['suppress', true], ['hide']]);
  panels.keyboardChanged(false);
  assert.equal(panels.getState().sheet, 'open');
  assert.equal(resumes(), 0);
});
test('Done/body interaction waits for sheet closure and opens the keyboard once', () => {
  const { panels, resumes } = setup();
  panels.openFormatting(); panels.requestTyping();
  assert.equal(panels.getState().sheet, 'closing');
  assert.equal(resumes(), 0);
  panels.sheetClosed(); panels.sheetClosed();
  assert.equal(resumes(), 1);
  panels.keyboardChanged(true); panels.keyboardChanged(false);
  assert.equal(resumes(), 1, 'ordinary keyboard dismissal must never reopen it');
});
test('Back closes formatting without opening the keyboard, and the next Back can navigate', () => {
  const { panels, calls, resumes } = setup();
  panels.openFormatting(); assert.equal(panels.dismiss(), true);
  assert.equal(panels.getState().mode, 'idle'); panels.sheetClosed();
  assert.equal(resumes(), 0); assert.deepEqual(calls.at(-1), ['suppress', false]);
  assert.equal(panels.dismiss(), false);
});
test('Back dismisses an active keyboard without re-opening either surface', () => {
  const { panels, resumes } = setup(true);
  assert.equal(panels.dismiss(), true); panels.keyboardChanged(false);
  assert.equal(panels.getState().sheet, 'closed');
  assert.equal(panels.getState().mode, 'idle');
  assert.equal(resumes(), 0); assert.equal(panels.dismiss(), false);
});
test('Aa tapped again during keyboard dismissal cancels opening and resumes typing after hide', () => {
  const { panels, resumes } = setup(true);
  panels.openFormatting(); panels.requestTyping();
  assert.equal(resumes(), 0);
  panels.keyboardChanged(false);
  assert.equal(panels.getState().sheet, 'closed'); assert.equal(resumes(), 1);
});
test('reopening during sheet closure cancels the pending keyboard request', () => {
  const { panels, resumes } = setup();
  panels.openFormatting(); panels.requestTyping(); panels.openFormatting(); panels.sheetClosed();
  assert.equal(panels.getState().sheet, 'open'); assert.equal(resumes(), 0);
});
test('Back during a return-to-typing animation cancels the pending keyboard request', () => {
  const { panels, resumes } = setup();
  panels.openFormatting(); panels.requestTyping(); panels.dismiss(); panels.sheetClosed();
  assert.equal(panels.getState().mode, 'idle'); assert.equal(resumes(), 0);
});
test('a late keyboard show cannot leave both surfaces open', () => {
  const { panels, calls } = setup();
  panels.openFormatting(); panels.keyboardChanged(true);
  assert.equal(calls.at(-1)[0], 'hide');
  panels.keyboardChanged(false); assert.equal(panels.getState().sheet, 'open');
});
test('unmount/reset releases suppression without showing the keyboard and ignores stale completions', () => {
  const { panels, calls, resumes } = setup();
  panels.openFormatting(); panels.requestTyping(); panels.reset();
  assert.deepEqual(calls.at(-1), ['suppress', false]);
  panels.dispose(); panels.sheetClosed(); panels.keyboardChanged(false); panels.requestTyping();
  assert.equal(resumes(), 0);
  panels.activate(); panels.openFormatting(); assert.equal(panels.getState().sheet, 'open');
});

test('Back after sheet closure cancels an IME request that has not shown yet', () => {
  const { panels, calls } = setup();
  panels.openFormatting(); panels.requestTyping(); panels.sheetClosed();
  assert.equal(panels.getState().keyboardOpening, true);
  assert.equal(panels.dismiss(), true);
  assert.equal(panels.getState().keyboardOpening, false);
  assert.equal(panels.getState().mode, 'idle');
  assert.ok(calls.some(([kind]) => kind === 'hide'));
  assert.equal(panels.dismiss(), false);
});
