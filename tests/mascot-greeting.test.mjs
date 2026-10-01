import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url).pathname;
const modules = new Map();
function load(source) {
  const path = resolve(root, source);
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = (specifier) => load(resolve(dirname(path), `${specifier}.ts`));
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

const greetings = load('src/constants/mascot-greetings/index.ts');

test('local clock selects all six greeting periods at their boundaries', () => {
  const periodAt = (hour, minute = 0) => greetings.getGreetingPeriod(new Date(2026, 9, 2, hour, minute));
  assert.equal(periodAt(2), 'lateNight');
  assert.equal(periodAt(3, 59), 'lateNight');
  assert.equal(periodAt(4), 'earlyMorning');
  assert.equal(periodAt(5, 30), 'earlyMorning');
  assert.equal(periodAt(7), 'morning');
  assert.equal(periodAt(9), 'morning');
  assert.equal(periodAt(12), 'afternoon');
  assert.equal(periodAt(14), 'afternoon');
  assert.equal(periodAt(17), 'evening');
  assert.equal(periodAt(18, 30), 'evening');
  assert.equal(periodAt(21), 'night');
  assert.equal(periodAt(22), 'night');
});

test('Filipino and Tagalog locales have their own library; other locales use English', () => {
  for (const locale of ['fil-PH', 'tl-PH', 'FIL_us']) assert.equal(greetings.getGreetingLanguage(locale), 'fil');
  for (const locale of ['en-US', 'en-GB', 'ja-JP', 'de-DE', null]) assert.equal(greetings.getGreetingLanguage(locale), 'en');
  assert.notDeepEqual(greetings.getGreetingsForPeriod('fil', 'morning'), greetings.getGreetingsForPeriod('en', 'morning'));
});

test('English has at least 200 unique local greetings and every period has choices', () => {
  const periods = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'lateNight'];
  const english = periods.flatMap((period) => greetings.getGreetingsForPeriod('en', period));
  assert.ok(english.length >= 200);
  assert.equal(new Set(english).size, english.length);
  for (const period of periods) {
    assert.ok(greetings.getGreetingsForPeriod('en', period).length >= 30);
    assert.ok(greetings.getGreetingsForPeriod('fil', period).length > 0);
  }
});

test('selection excludes the recent five and stores only five unique lines', () => {
  const pool = greetings.getGreetingsForPeriod('en', 'morning');
  const recent = pool.slice(0, 5);
  const selected = greetings.chooseGreeting(pool, recent, () => 0);
  assert.equal(selected, pool[5]);
  assert.deepEqual(greetings.nextRecentGreetings(recent, selected), [selected, ...recent.slice(0, 4)]);
  assert.deepEqual(greetings.nextRecentGreetings([selected, ...recent], selected), [selected, ...recent.slice(0, 4)]);
});

test('a brief app switch does not rearm Sticky; 30 minutes does', () => {
  const session = load('src/services/mascot-session.ts');
  assert.equal(session.claimMascotGreeting(), true);
  assert.equal(session.claimMascotGreeting(), false);
  session.updateMascotAppState('background', 1000);
  session.updateMascotAppState('active', 1000 + 29 * 60 * 1000);
  assert.equal(session.canShowMascotGreeting(), false);
  session.updateMascotAppState('background', 2_000_000);
  session.updateMascotAppState('active', 2_000_000 + 30 * 60 * 1000);
  assert.equal(session.claimMascotGreeting(), true);
});
