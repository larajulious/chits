import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import {
  CHITS_THEME_COLLECTIONS, CHITS_THEME_IDS, CHITS_THEME_LIST, CHITS_THEMES, DEFAULT_THEME_IDENTITY, SHARE_NOTE_COLLECTIONS, SHARE_NOTE_THEMES, THEME_SETTING_KEY,
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
  assert.deepEqual(CHITS_THEME_LIST.map((theme) => theme.name), ['Default', 'Faith', 'Casual', 'Corporate', 'Love', 'Friends', 'Boss', 'Stranger', 'Motivation', 'Calm', 'Creative', 'Cute', 'Christmas', 'Spooky', 'New Year', 'Midnight', 'Boomers', 'Gen X', 'Millennials', 'Gen Z', 'Gen Alpha', 'Game Changer']);
  assert.deepEqual(CHITS_THEME_LIST.map((theme) => theme.id), [...CHITS_THEME_IDS]);
  assert.equal(DEFAULT_THEME_IDENTITY, 'default');
  assert.equal(THEME_SETTING_KEY, 'app_theme');
});

test('only the identity is stored, and anything unknown falls back to Default', () => {
  assert.equal(resolveThemeIdentity('calm'), 'calm');
  assert.equal(resolveThemeIdentity('christian'), 'faith', 'a renamed theme keeps its selection');
  for (const value of [null, undefined, '', 'Calm', 'sunset', '{"id":"calm"}']) assert.equal(resolveThemeIdentity(value), 'default', String(value));
});

test('Default uses the logo palette while honoring the user’s accent color', () => {
  for (const scheme of ['light', 'dark']) {
    for (const accent of Object.keys(chatThemes)) {
      const tokens = getThemeTokens('default', accent, scheme);
      const tinted = accent === 'light' || accent === 'logo';
      assert.equal(tokens.accent, chatThemes[accent][scheme].accent);
      assert.equal(tokens.bubble, tinted ? tokens.accentSoft : tokens.accent);
      assert.equal(tokens.bubbleText, tinted ? tokens.textPrimary : tokens.accentText);
      assert.equal(tokens.chatBackground, tokens.background);
      assert.equal(tokens.cardPaper, scheme === 'dark' ? tokens.surface : '#FFFDF6');
      assert.equal(tokens.cardBase, scheme === 'dark' ? tokens.surface : '#FFFFFF');
    }
  }
  assert.equal(getThemeTokens('default', 'logo', 'light').background, '#F7F8F6');
  assert.equal(getThemeTokens('default', 'logo', 'dark').background, '#171612');
  assert.equal(CHITS_THEMES.default.shareNote.colors.decoration, '#FBE47E');
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

test('Settings and Share Note group themes into Personalities, Generations, then Limited Edition', () => {
  for (const collections of [CHITS_THEME_COLLECTIONS, SHARE_NOTE_COLLECTIONS]) {
    assert.deepEqual(collections.map((collection) => collection.name), ['Personalities', 'Generations', 'Limited Edition']);
    assert.deepEqual(collections[1].themes.map((theme) => theme.name), ['Boomers', 'Gen X', 'Millennials', 'Gen Z', 'Gen Alpha']);
    assert.deepEqual(collections[2].themes.map((theme) => theme.name), ['Game Changer']);
    // Limited Edition is hidden from both pickers for now; the rest are offered.
    assert.deepEqual(collections.filter((collection) => collection.shown).map((collection) => collection.name), ['Personalities', 'Generations']);
  }
  assert.equal(resolveThemeIdentity('game-changer'), 'game-changer', 'someone already wearing a hidden theme keeps it');
  // Every theme appears exactly once, in its own collection.
  assert.deepEqual(CHITS_THEME_COLLECTIONS.flatMap((collection) => collection.themes), CHITS_THEME_LIST);
  for (const collection of CHITS_THEME_COLLECTIONS) for (const theme of collection.themes) assert.equal(theme.category, collection.id, theme.id);
  assert.deepEqual(SHARE_NOTE_COLLECTIONS.flatMap((collection) => collection.themes.map((theme) => theme.id)).sort(), SHARE_NOTE_THEMES.map((theme) => theme.id).sort());
});

test('each generation keeps its brief’s palette in its native mode, and a distinct voice', () => {
  const native = {
    boomers: ['light', { background: '#F6F0E4', surface: '#FFFDF8', accent: '#7B2D3E', textPrimary: '#292521', borderSubtle: '#D8CEBF' }],
    'gen-x': ['dark', { background: '#171717', surface: '#242424', accent: '#D8A84E', textPrimary: '#F2EFE9', textMuted: '#AAA59D', borderSubtle: '#3A3A3A' }],
    millennials: ['light', { background: '#F7F4F0', surface: '#FFFFFF', textPrimary: '#30343B', borderSubtle: '#E7E0DA' }],
    'gen-z': ['dark', { background: '#121212', surface: '#1C1C1E', accent: '#B7FF3C', textPrimary: '#FFFFFF', textMuted: '#B5B5B5', borderSubtle: '#343434' }],
    'gen-alpha': ['light', { background: '#EEF7FF', surface: '#FFFFFF', textPrimary: '#1C2440', borderSubtle: '#DCE6F5' }],
  };
  for (const [id, [scheme, colors]] of Object.entries(native)) {
    for (const [key, value] of Object.entries(colors)) assert.equal(CHITS_THEMES[id].palette[scheme][key], value, `${id} ${scheme} ${key}`);
  }
  const voices = Object.keys(native).map((id) => { const { look, shareNote } = CHITS_THEMES[id]; return `${look.headingFont ?? 'system'}/${look.chatPattern}/${shareNote.fontStyle}/${shareNote.decorationStyle}`; });
  assert.equal(new Set(voices).size, voices.length, 'no two generations share a type voice and texture');
});

test('Game Changer wears its picture in the header band, with white ink that stays readable over it', async () => {
  const { topBarForIdentity, TOP_BAR_IMAGE_SCRIM } = await import('../src/constants/chits-themes.ts');
  const theme = CHITS_THEMES['game-changer'];
  assert.equal(theme.name, 'Game Changer');
  assert.equal(theme.category, 'limited-edition');
  assert.equal(theme.look.bandImage, 'game-changer');
  const bar = topBarForIdentity('game-changer');
  assert.equal(bar.image, 'game-changer');
  assert.equal(bar.ink, '#FFFFFF');
  // Worst case: a pure-white patch of the picture under the scrim of the band's first color.
  const tint = bar.colors[0];
  const mixed = `#${[1, 3, 5].map((i) => Math.round(255 + (parseInt(tint.slice(i, i + 2), 16) - 255) * TOP_BAR_IMAGE_SCRIM).toString(16).padStart(2, '0')).join('')}`;
  assert.ok(contrast(bar.ink, mixed) >= 4.5, `title over the brightest part of the picture is ${contrast(bar.ink, mixed).toFixed(2)}`);
  assert.ok(contrast(bar.inkMuted, mixed) >= 4.5, `subtitle over the brightest part of the picture is ${contrast(bar.inkMuted, mixed).toFixed(2)}`);
  // Every other theme keeps its pattern.
  for (const id of CHITS_THEME_IDS.filter((item) => item !== 'default' && item !== 'game-changer')) assert.equal(topBarForIdentity(id).image, null, id);
});
