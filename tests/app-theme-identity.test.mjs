import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import {
  CHITS_THEME_IDS, CHITS_THEME_LIST, CHITS_THEMES, DEFAULT_THEME_IDENTITY, SHARE_NOTE_THEMES, THEME_SETTING_KEY,
  resolveThemeIdentity, shareNoteThemeForIdentity,
} from '../src/constants/chits-themes.ts';

// theme.ts imports react-native, so load it transpiled with a tiny Platform stub.
const stub = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const themeSource = ts.transpileModule(readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]react-native['"]/, `from '${stub('export const Platform = { select: (options) => options.default ?? options.ios };')}'`)
  .replace(/from ['"]@\/constants\/chits-themes['"]/, `from '${new URL('../src/constants/chits-themes.ts', import.meta.url).href}'`);
const { getThemeTokens, chatThemes } = await import(stub(themeSource));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('Settings offers Default plus every personality, in order', () => {
  assert.deepEqual(CHITS_THEME_LIST.map((theme) => theme.name), ['Default', 'Faith', 'Casual', 'Corporate', 'Love', 'Friends', 'Boss', 'Stranger', 'Motivation', 'Calm', 'Creative', 'Cute', 'Christmas', 'Spooky', 'New Year', 'Midnight']);
  assert.deepEqual(CHITS_THEME_LIST.map((theme) => theme.id), [...CHITS_THEME_IDS]);
  assert.equal(DEFAULT_THEME_IDENTITY, 'default');
  assert.equal(THEME_SETTING_KEY, 'app_theme');
});

test('only the identity is stored, and anything unknown falls back to Default', () => {
  assert.equal(resolveThemeIdentity('calm'), 'calm');
  assert.equal(resolveThemeIdentity('christian'), 'faith', 'a renamed theme keeps its selection');
  for (const value of [null, undefined, '', 'Calm', 'sunset', '{"id":"calm"}']) assert.equal(resolveThemeIdentity(value), 'default', String(value));
});

test('Default keeps the classic Chits look exactly, in the user’s accent color', () => {
  for (const scheme of ['light', 'dark']) {
    for (const accent of Object.keys(chatThemes)) {
      const tokens = getThemeTokens('default', accent, scheme);
      const tinted = accent === 'light';
      assert.equal(tokens.accent, chatThemes[accent][scheme].accent);
      assert.equal(tokens.bubble, tinted ? tokens.accentSoft : tokens.accent);
      assert.equal(tokens.bubbleText, tinted ? tokens.textPrimary : tokens.accentText);
      assert.equal(tokens.chatBackground, tokens.background);
      assert.equal(tokens.cardPaper, scheme === 'dark' ? tokens.surface : '#FBFAF6');
      assert.equal(tokens.cardBase, scheme === 'dark' ? tokens.surface : '#FFFFFF');
    }
  }
  assert.equal(getThemeTokens('default', 'light', 'light').background, '#FFFFFF');
  assert.equal(getThemeTokens('default', 'light', 'dark').background, '#121311');
});

test('personality themes bring their own palette; the Default accent setting does not leak into them', () => {
  for (const theme of CHITS_THEME_LIST.filter((item) => item.palette)) {
    for (const scheme of ['light', 'dark']) {
      assert.deepEqual(getThemeTokens(theme.id, 'teal', scheme), theme.palette[scheme], `${theme.id} ${scheme}`);
      assert.deepEqual(getThemeTokens(theme.id, 'light', scheme), getThemeTokens(theme.id, 'cherry', scheme));
    }
  }
});

test('every theme is readable in light and dark: text, buttons, bubbles, cards and errors', () => {
  const keys = Object.keys(getThemeTokens('default', 'light', 'light')).sort();
  const rules = [
    ['textPrimary', 'background', 7], ['textPrimary', 'surface', 7], ['textPrimary', 'cardPaper', 7], ['textPrimary', 'chatBackground', 7],
    ['textSecondary', 'background', 4.5], ['textSecondary', 'surface', 4.5], ['textSecondary', 'chatBackground', 4.5],
    ['textMuted', 'background', 4.5], ['textMuted', 'surface', 4.5], ['textMuted', 'surfaceElevated', 4.5],
    ['accentText', 'accent', 4.5], ['accentStrong', 'background', 4.5], ['accentStrong', 'surface', 4.5], ['accentStrong', 'accentSoft', 4.5],
    ['bubbleText', 'bubble', 4.5], ['danger', 'background', 4.5], ['danger', 'surface', 4.5],
    // Controls and icons in the accent color stay visible on the page (non-text contrast).
    ['accent', 'background', 3],
  ];
  for (const theme of CHITS_THEME_LIST.filter((item) => item.palette)) {
    for (const scheme of ['light', 'dark']) {
      const palette = theme.palette[scheme];
      assert.deepEqual(Object.keys(palette).sort(), keys, `${theme.id} ${scheme} has every token`);
      for (const [key, value] of Object.entries(palette)) assert.match(value, /^#[0-9A-F]{6}$/i, `${theme.id} ${scheme} ${key}`);
      for (const [fg, bg, min] of rules) assert.ok(contrast(palette[fg], palette[bg]) >= min, `${theme.id} ${scheme}: ${fg} on ${bg} is ${contrast(palette[fg], palette[bg]).toFixed(2)}`);
      assert.ok(lum(palette.background) > 0.5 === (scheme === 'light'), `${theme.id} ${scheme} is actually ${scheme}`);
    }
  }
});

test('one identity powers the app theme and its Share Note design', () => {
  for (const id of CHITS_THEME_IDS) {
    const shareId = shareNoteThemeForIdentity(id);
    assert.equal(shareId, CHITS_THEMES[id].shareNote.id);
    assert.ok(SHARE_NOTE_THEMES.some((theme) => theme.id === shareId), id);
  }
  assert.equal(new Set(SHARE_NOTE_THEMES.map((theme) => theme.id)).size, SHARE_NOTE_THEMES.length);
  // Share Note keeps every theme's design selectable.
  assert.ok(SHARE_NOTE_THEMES.length >= CHITS_THEME_IDS.length);
});

test('the top bar wears the theme’s Share Note background, with readable header ink and status bar', async () => {
  const { topBarForIdentity } = await import('../src/constants/chits-themes.ts');
  assert.equal(topBarForIdentity('default'), null, 'Default keeps its familiar plain header');
  for (const id of CHITS_THEME_IDS.filter((item) => item !== 'default')) {
    const bar = topBarForIdentity(id);
    const share = CHITS_THEMES[id].shareNote;
    assert.equal(bar.share, share, `${id} reuses its Share Note design`);
    assert.deepEqual(bar.colors, [share.colors.background, share.colors.backgroundEnd], `${id} same gradient as the image`);
    for (const stop of bar.colors) {
      assert.ok(contrast(bar.ink, stop) >= 4.5, `${id}: title on ${stop} is ${contrast(bar.ink, stop).toFixed(2)}`);
      assert.ok(contrast(bar.inkMuted, stop) >= 4.5, `${id}: subtitle on ${stop} is ${contrast(bar.inkMuted, stop).toFixed(2)}`);
    }
    // Light status-bar icons exactly when the band is dark.
    assert.equal(bar.dark, bar.ink === '#FFFFFF', `${id} status bar style`);
  }
  assert.equal(topBarForIdentity('boss').dark, true);
  assert.equal(topBarForIdentity('love').dark, false);
});

test('Faith carries the cross of Jesus Christ through the app and every Share Note', () => {
  const faith = CHITS_THEMES.faith;
  assert.equal(faith.name, 'Faith');
  assert.equal(faith.shareNote.mark, 'cross', 'a cross opens a text note');
  assert.equal(faith.shareNote.decorationStyle, 'cross', 'a cross of light stands behind every note and in the top bar');
  assert.equal(faith.look.chatPattern, 'cross', 'a quiet cross stands behind Chat');
});
