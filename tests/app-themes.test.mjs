import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// theme.ts imports react-native (not loadable in Node), so read its values from source.
const source = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8');
const tokensOf = (name) => Object.fromEntries([...source.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\}`))[1].matchAll(/(\w+): '(#[0-9A-F]{6})'/gi)].map((m) => [m[1], m[2]]));
const base = { light: tokensOf('lightTokens'), dark: tokensOf('darkTokens') };
const themes = Object.fromEntries([...source.matchAll(/^  (\w+): \{ name: '([^']+)', light: \{([^}]+)\}, dark: \{([^}]+)\} \},$/gm)].map(([, key, name, light, dark]) => {
  const parse = (body) => Object.fromEntries([...body.matchAll(/(\w+): '(#[0-9A-F]{6})'/gi)].map((m) => [m[1], m[2]]));
  return [key, { name, light: parse(light), dark: parse(dark) }];
}));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('the added app color themes keep text readable in light and dark', () => {
  const added = ['teal', 'plum', 'honey', 'cherry', 'midnight'];
  assert.equal(Object.keys(themes).length, 12);
  assert.equal(new Set(Object.values(themes).map((theme) => theme.name)).size, 12);
  for (const key of added) {
    assert.ok(themes[key], key);
    for (const scheme of ['light', 'dark']) {
      const tokens = { ...base[scheme], ...themes[key][scheme] };
      assert.ok(contrast(tokens.accent, tokens.accentText) >= 4.5, `${key} ${scheme} button text`);
      assert.ok(contrast(tokens.accentStrong, tokens.background) >= 4.5, `${key} ${scheme} accent text on page`);
      assert.ok(contrast(tokens.accentStrong, tokens.accentSoft) >= 4.5, `${key} ${scheme} accent text on tint`);
    }
  }
});
