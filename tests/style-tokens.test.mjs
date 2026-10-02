import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import { BOARD_ACCENTS } from '../src/constants/board-appearance.ts';
import { CHITS_THEME_IDS } from '../src/constants/chits-themes.ts';
import { APP_STYLES, STYLE_PRESETS, contrast, mix, noteColors, resolveAppStyle, stableTilt, styleColors } from '../src/constants/style-tokens.ts';

// theme.ts imports react-native, so load it transpiled with a tiny Platform stub.
const stub = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const themeSource = ts.transpileModule(readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]react-native['"]/, `from '${stub('export const Platform = { select: (options) => options.default ?? options.ios };')}'`)
  .replace(/from ['"]@\/constants\/chits-themes['"]/, `from '${new URL('../src/constants/chits-themes.ts', import.meta.url).href}'`);
const { getThemeTokens, chatThemes } = await import(stub(themeSource));

// Every palette a person can wear: each theme in light and dark, and Default in every accent.
const palettes = [];
for (const scheme of ['light', 'dark']) {
  for (const identity of CHITS_THEME_IDS) {
    for (const accentKey of identity === 'default' ? Object.keys(chatThemes) : ['logo']) {
      palettes.push({ label: `${identity}/${accentKey}/${scheme}`, palette: getThemeTokens(identity, accentKey, scheme) });
    }
  }
}

test('style setting resolves to Classic unless Sticky was chosen', () => {
  assert.deepEqual([...APP_STYLES], ['classic', 'sticky']);
  assert.equal(resolveAppStyle(null), 'classic');
  assert.equal(resolveAppStyle('nonsense'), 'classic');
  assert.equal(resolveAppStyle('sticky'), 'sticky');
});

test('Classic draws nothing new: no outline, edges, tape or mascot', () => {
  const classic = STYLE_PRESETS.classic;
  assert.equal(classic.outline.width, 0);
  assert.equal(classic.elevation, 'soft');
  assert.equal(classic.iconStroke, 0);
  assert.equal(classic.press, 'ripple');
  assert.deepEqual(classic.card, { tape: false, fold: false, tinted: false, tilt: 0 });
  assert.equal(classic.chatButton, 'circle');
  assert.equal(classic.mascotEmptyStates, false);
  assert.deepEqual(classic.font, { display: null, body: null, paragraph: null });
});

test('mix blends toward the second color by the given amount', () => {
  assert.equal(mix('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mix('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mix('#FF0000', '#FFFFFF', 0.6), '#FF9999');
  assert.equal(mix('#8A6500', '#000000', 0.2), '#6E5100');
});

test('Sticky colors are derived from the accent on every palette', () => {
  for (const { label, palette } of palettes) {
    const colors = styleColors(palette);
    assert.equal(colors.cardTint, mix(palette.accent, '#FFFFFF', 0.6), label);
    assert.equal(colors.cardEdge, palette.accent, label);
    assert.equal(colors.tapeEdge, mix(palette.accent, '#000000', 0.2), label);
  }
});

test('Sticky stays legible on every palette, light and dark', () => {
  const failures = [];
  const check = (label, what, a, b, minimum) => { const ratio = contrast(a, b); if (ratio < minimum) failures.push(`${label}: ${what} ${a} on ${b} = ${ratio.toFixed(2)} < ${minimum}`); };
  for (const { label, palette } of palettes) {
    const colors = styleColors(palette);
    // Outlines are control boundaries: WCAG 1.4.11 non-text contrast, 3:1.
    check(label, 'outline/page', colors.outline, palette.background, 3);
    check(label, 'outline/fill', colors.outline, colors.controlFill, 3);
    // Text: 4.5:1.
    check(label, 'text/fill', palette.textPrimary, colors.controlFill, 4.5);
    check(label, 'secondary/page', colors.textSecondary, palette.background, 4.5);
    check(label, 'secondary/fill', colors.textSecondary, colors.controlFill, 4.5);
    check(label, 'card ink', colors.cardInk, colors.cardTint, 4.5);
    check(label, 'card muted ink', colors.cardInkMuted, colors.cardTint, 4.5);
    check(label, 'pill ink', colors.cardInk, '#FFFFFF', 4.5);
    check(label, 'accent label', colors.onAccent, colors.accentFill, 4.5);
  }
  assert.deepEqual(failures, []);
});

test('notes on a colored board read in that board\'s color too', () => {
  for (const { value } of BOARD_ACCENTS) {
    if (!value) continue;
    const colors = noteColors(value);
    assert.equal(colors.cardTint, mix(value, '#FFFFFF', 0.6));
    assert.ok(contrast(colors.cardInk, colors.cardTint) >= 4.5, value);
    assert.ok(contrast(colors.cardInkMuted, colors.cardTint) >= 4.5, value);
  }
});

test('a note keeps the same small tape angle on every render', () => {
  assert.equal(stableTilt('abc', 3), stableTilt('abc', 3));
  assert.equal(stableTilt('abc', 0), 0);
  for (const id of ['a', 'note-1', 'f3c1d2', '0', 'zzzzzzzz']) {
    const angle = stableTilt(id, 3);
    assert.ok(angle >= -3 && angle <= 3, `${id}: ${angle}`);
  }
});
