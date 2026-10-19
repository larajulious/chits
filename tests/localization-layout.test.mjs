import assert from 'node:assert/strict';
import test from 'node:test';
import { contentTextStyle, firstStrongDirection, isolateDisplayValues, languageDirection, navigationIconName, needsSystemFont } from '../src/localization/text-layout.ts';
import { filterLanguageOptions, languageSearchText } from '../src/localization/language-search.ts';
import { LANGUAGES, i18n, countLabel, resolveLanguage } from '../src/localization/runtime.ts';

test('native, English, locale and accent-insensitive language search', () => {
  for (const query of ['日本語', 'Japanese', 'ja']) assert.equal(filterLanguageOptions(query)[0].id, 'ja');
  for (const query of ['Tiếng Việt', 'tieng viet', 'vi']) assert.ok(filterLanguageOptions(query).some(row => row.id === 'vi'));
  assert.equal(filterLanguageOptions('العربية')[0].id, 'ar');
  assert.equal(languageSearchText('Türkçe'), 'turkce');
  assert.equal(filterLanguageOptions('missing').length, 0);
  assert.equal(filterLanguageOptions('').length, 14);
});
test('all regional device languages resolve; unsupported locales fall back safely', () => {
  for (const locale of LANGUAGES) assert.equal(resolveLanguage('system', [locale]), locale);
  assert.equal(resolveLanguage('system', ['zh-CN', 'ar-SA']), 'ar');
  assert.equal(resolveLanguage('system', ['zh-CN']), 'en');
  assert.equal(resolveLanguage('ja', ['ar']), 'ja');
});
test('content direction and font fallback depend on the actual script', () => {
  assert.equal(languageDirection('ar-SA'), 'rtl');
  assert.equal(firstStrongDirection('2026 مرحبا URL'), 'rtl');
  assert.equal(firstStrongDirection('https://example.com مرحبا'), 'ltr');
  assert.equal(contentTextStyle('مرحبا').textAlign, 'right');
  for (const text of ['日本語', '한국어', 'हिन्दी', 'العربية']) assert.equal(needsSystemFont(text), true);
  assert.equal(needsSystemFont('Tiếng Việt', 'vi'), true);
  assert.equal(navigationIconName('arrow-back', 'rtl'), 'arrow-forward');
  assert.equal(navigationIconName('play', 'rtl'), 'play');
  assert.equal(navigationIconName('constructor', 'rtl'), 'constructor');
});
test('Arabic interpolation isolates display values without mutating source values', () => {
  const values = { name: 'work/ملف.pdf', count: 2 };
  assert.deepEqual(isolateDisplayValues(values, 'ar'), { name: '\u2068work/ملف.pdf\u2069', count: 2 });
  assert.equal(values.name, 'work/ملف.pdf');
  assert.equal(isolateDisplayValues(values, 'ja'), values);
});
test('all CLDR categories select a bundled count phrase offline', async () => {
  for (const locale of LANGUAGES) {
    await i18n.changeLanguage(locale);
    for (const number of [0, 1, 2, 3, 7, 11, 100, 1.5, 1000000]) {
      assert.doesNotMatch(countLabel('note', number), /counts\.|\{\{/);
      assert.ok(countLabel('note', number).includes(String(number)));
    }
  }
  await i18n.changeLanguage('en');
});
