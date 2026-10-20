import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import babel from '@babel/core';
import { advanceFocus, focusClock } from '../src/services/focus-timer.ts';

const require = createRequire(import.meta.url);
const filename = 'src/features/focus/focus-timer-view.tsx';
// Match the app's Expo/React Compiler configuration, not a plain TS transpile.
const compiled = babel.transformSync(readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'), {
  filename, presets: ['babel-preset-expo'],
  caller: { name: 'metro', platform: 'ios', isDev: true, supportsReactCompiler: true },
}).code;

function mount(session) {
  const slots = [], effects = [], intervals = new Map();
  let cursor = 0, clock = session.checkpoint_at, intervalId = 0, listener, completions = 0;
  const database = {}, tokens = { textPrimary: 'ink' };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial, set: (value) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; } };
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const dependencies = {
    react: hooks,
    'react/compiler-runtime': { c(size) { const index = cursor++; return slots[index] ??= Array(size).fill(Symbol.for('react.memo_cache_sentinel')); } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { create: value => value }, AppState: { addEventListener: (_, callback) => { listener = callback; return { remove() { listener = null; } }; } } },
    'expo-sqlite': { useSQLiteContext: () => database },
    '@/components/theme-provider': { useTheme: () => ({ tokens }) },
    '@/localization/runtime': { tr: (_, values) => values.time },
    '@/services/focus-clock': { focusNow: () => clock },
    '@/services/focus-timer': { advanceFocus, focusClock },
    './focus-ui': { FocusText: 'text' },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: name => dependencies[name] ?? require(name),
    setInterval(callback) { const id = ++intervalId; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
  });
  let props = { session, onComplete: () => { completions++; } };
  const render = () => {
    cursor = 0;
    const output = exports.FocusTimer(props);
    while (effects.length) effects.shift()();
    return output.props.children;
  };
  return {
    render,
    tick(ms = 1000) { clock += ms; for (const callback of intervals.values()) callback(); return render(); },
    replace(next) { props = { ...props, session: next }; render(); return render(); },
    foreground(ms) { clock += ms; listener?.('active'); return render(); },
    get completions() { return completions; },
  };
}
const session = (changes = {}) => ({ id: 's', note_key: 'thought:a', started_at: 1000, checkpoint_at: 1000, planned_ms: 60000, focused_ms: 0, paused_ms: 0, status: 'running', ended_at: null, completed_at: null, dismissed_at: null, clock_adjusted: 0, ...changes });

test('compiled countdown advances every second without a new session prop or database checkpoint', () => {
  const timer = mount(session());
  assert.equal(timer.render(), '1:00');
  assert.equal(timer.tick(), '0:59');
  assert.equal(timer.tick(), '0:58');
  assert.equal(timer.tick(), '0:57');
  assert.equal(timer.tick(57000), '0:00');
  assert.equal(timer.completions, 1);
  timer.tick(); assert.equal(timer.completions, 1);
});
test('compiled pause/resume and background catch-up keep the displayed remaining time correct', () => {
  const timer = mount(session()); timer.render();
  assert.equal(timer.tick(10000), '0:50');
  assert.equal(timer.replace(session({ status: 'paused', checkpoint_at: 11000, focused_ms: 10000 })), '0:50');
  assert.equal(timer.tick(20000), '0:50');
  assert.equal(timer.replace(session({ checkpoint_at: 31000, focused_ms: 10000, paused_ms: 20000 })), '0:50');
  assert.equal(timer.tick(), '0:49');
  assert.equal(timer.foreground(10000), '0:39');
});
test('compiled untimed display advances independently of persisted checkpoints', () => {
  const timer = mount(session({ planned_ms: null }));
  assert.equal(timer.render(), '0:00');
  assert.equal(timer.tick(), '0:01');
  assert.equal(timer.tick(), '0:02');
  assert.equal(timer.completions, 0);
});
