import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { i18n, LANGUAGES, matchSupportedLanguage, resolveLanguage, tr } from '../src/localization/runtime.ts';
import { filterLanguageOptions } from '../src/localization/language-search.ts';
import { needsSystemFont } from '../src/localization/text-layout.ts';
import { reminderBody, reminderBodyAlternatives, planReminderSync } from '../src/services/reminder-content.ts';
import { getGreetingsForPeriod } from '../src/constants/mascot-greetings/index.ts';

const languages = { hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు', bn: 'বাংলা', mr: 'मराठी', kn: 'ಕನ್ನಡ', ml: 'മലയാളം', gu: 'ગુજરાતી' };
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Indian device tags resolve in order, while every existing saved override wins', () => {
  for (const [language, name] of Object.entries(languages)) {
    assert.equal(matchSupportedLanguage(`${language}-IN`), language);
    assert.equal(matchSupportedLanguage(`${language}_IN`), language);
    assert.equal(resolveLanguage('system', ['zh-CN', `${language}-IN`, 'en-US']), language);
    for (const saved of LANGUAGES) assert.equal(resolveLanguage(saved, [`${language}-IN`]), saved);
    for (const query of [language, name]) assert.ok(filterLanguageOptions(query).some(option => option.id === language));
    assert.equal(needsSystemFont(name, 'en-US'), true, `${language}: content fallback in English UI`);
    assert.equal(needsSystemFont('123', `${language}-IN`), true, `${language}: locale fallback for neutral input`);
  }
});

test('each Indian locale localizes new reminders and retains already scheduled reminders and user text', async () => {
  const hidden = { hidden: true, text: 'Private user words', title: null, attachmentType: 'photo' };
  await i18n.changeLanguage('en');
  const previous = reminderBody(hidden);
  try {
    for (const language of Object.keys(languages)) {
      await i18n.changeLanguage(language);
      assert.notEqual(reminderBody(hidden), previous);
      const row = { cardId: 'c1', scheduledAt: 2000, notificationId: 'n1', cardActive: true, body: reminderBody(hidden), bodyAlternatives: reminderBodyAlternatives(hidden) };
      assert.deepEqual(planReminderSync([row], [{ identifier: 'n1', cardId: 'c1', body: previous }], 1000), { cancel: [], deleteRows: [], schedule: [] });
      assert.equal(reminderBody({ ...hidden, hidden: false }), hidden.text);
      assert.ok(tr('plan.notify.evening').trim());
      assert.notEqual(tr('plan.notify.evening'), i18n.getFixedT('en')('plan.notify.evening'));
    }
  } finally { await i18n.changeLanguage('en'); }
});

test('new native permissions, mascot periods and Android widget gallery copy are bundled', () => {
  for (const language of Object.keys(languages).filter(language => language !== 'hi')) {
    const catalog = JSON.parse(read(`src/localization/locales/${language}.json`));
    const native = JSON.parse(read(`src/localization/native/${language}.json`)).ios;
    for (const value of Object.values(native)) { assert.match(value, /Chits/); assert.match(value, /[^\x00-\x7F]/); }
    for (const period of ['earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'lateNight']) {
      const lines = getGreetingsForPeriod(language, period);
      assert.ok(lines.length >= 3);
      for (const line of lines) assert.match(line, /[^\x00-\x7F]/);
    }
    for (const [file, name, key] of [['anywhere_strings.xml', 'anywhere_quick', 'anywhere.quick'], ['plan_strings.xml', 'plan_widget_name', 'plan.widget.name']]) {
      const xml = read(`modules/chits-attachments/android/src/main/res/values-${language}/${file}`);
      assert.ok(xml.includes(`name="${name}"`));
      assert.ok(xml.includes(catalog[key]));
    }
  }
});

test('bundled plural rules support Indian counts even without native Intl.PluralRules', () => {
  const script = `
    import assert from 'node:assert/strict';
    Intl.PluralRules = undefined;
    await import('./src/localization/plurals.ts');
    for (const language of ${JSON.stringify(Object.keys(languages))}) {
      const rules = new Intl.PluralRules(language);
      assert.equal(rules.resolvedOptions().locale, language);
      for (const count of [0, 1, 2, 11, 100000, 1.5]) assert.ok(rules.select(count));
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
});

test('Indian catalogs contain only reviewed brands/technical English and no generation artifacts', () => {
  const allowedWords = new Set('Chits NoteSpace Focus Spin Anywhere PDF Android iOS iPhone SQLite chitsbackup MB AM PM Expo Pictures'.split(' '));
  const allowedIdentical = new Set(['chat.chitsValueValueValue', 'chat.chitsValueValue', 'pdfviewer.pdfValueValue', 'dates.withTime', 'common.withMoreAttachments', 'calendar.daySummary', 'common.withDuration', 'focus.title', 'anywhere.brand', 'spin.title']);
  const source = JSON.parse(read('src/localization/locales/en.json'));
  for (const language of Object.keys(languages)) {
    const catalog = JSON.parse(read(`src/localization/locales/${language}.json`));
    for (const [key, value] of Object.entries(catalog)) {
      assert.doesNotMatch(value, /ZXQ|QXZ|98765432\d{4}|87654321\d{4}|\\u[0-9a-fA-F]{4}/, `${language}:${key}`);
      if (value === source[key]) assert.ok(allowedIdentical.has(key), `${language}:${key}: untranslated English`);
      for (const word of value.replace(/\{\{.*?\}\}/g, '').match(/[A-Za-z][A-Za-z]+/g) ?? []) assert.ok(allowedWords.has(word), `${language}:${key}: unexpected English ${word}`);
    }
  }
});

test('script-aware native input retains refs, Unicode values, selections and IME handlers', async () => {
  const ts = await import('typescript');
  const vm = await import('node:vm');
  const code = ts.transpileModule(read('src/components/ui/app-text-input.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let locale = 'en';
  const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const module = { exports: {} };
  const scope = {
    module, exports: module.exports,
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'react-native') return { TextInput: 'TextInput', StyleSheet: { flatten } };
      if (name.endsWith('/provider')) return { useLocale: () => locale };
      if (name.endsWith('/text-layout')) return { needsSystemFont };
      if (name === './app-text') return { useFontStyle: () => ({ fontFamily: 'LatinTheme' }) };
      throw new Error(name);
    },
  };
  vm.runInNewContext(code, scope);
  const render = scope.exports.AppTextInput;
  const handlers = { onChangeText() {}, onSelectionChange() {}, onKeyPress() {} };
  const selection = { start: 1, end: 3 };
  const ref = { current: null };
  for (const [language, nativeName] of Object.entries(languages)) {
    // Content fallback also works when the interface is English.
    for (locale of ['en', language]) {
      const value = `${nativeName} e\u0301 👩🏽‍💻`;
      const tree = render({ value, selection, ref, ...handlers, style: { fontFamily: 'LatinTheme', fontSize: 18, lineHeight: 20 } });
      assert.equal(tree.props.value, value);
      assert.equal(tree.props.ref, ref);
      assert.equal(tree.props.selection, selection);
      for (const [key, handler] of Object.entries(handlers)) assert.equal(tree.props[key], handler);
      const style = flatten(tree.props.style);
      assert.equal(style.fontFamily, undefined);
      assert.equal(style.includeFontPadding, true);
      assert.equal(style.lineHeight, 27);
    }
  }
  locale = 'en';
  assert.equal(flatten(render({ value: 'Hello', style: { fontFamily: 'ExistingFace' } }).props.style).fontFamily, 'ExistingFace');
});
