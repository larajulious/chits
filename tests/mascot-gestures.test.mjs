import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { GESTURES, GESTURE_WEIGHTS, chooseMascotGesture, createMascotGestureController, gestureDuration } from '../src/components/mascot/mascot-gestures.ts';
import { nextMascotState } from '../src/features/onboarding/welcome/mascot-machine.ts';

test('weights match the brief and the selector reaches all ten gestures without repeating', () => {
  assert.equal(Object.values(GESTURE_WEIGHTS).reduce((sum, value) => sum + value), 100);
  const counts = Object.fromEntries(Object.keys(GESTURE_WEIGHTS).map(key => [key, 0]));
  for (let i = 0; i < 10000; i++) counts[chooseMascotGesture(null, 'general', () => (i + 0.5) / 10000)]++;
  for (const [key, weight] of Object.entries(GESTURE_WEIGHTS)) assert.equal(counts[key], weight * 100);
  for (const previous of Object.keys(GESTURE_WEIGHTS)) for (let i = 0; i < 1000; i++) assert.notEqual(chooseMascotGesture(previous, 'general', () => i / 1000), previous);
  const welcome = Array.from({ length: 1000 }, (_, i) => chooseMascotGesture(null, 'welcome', () => i / 1000));
  assert.ok(welcome.filter(key => key === 'wave').length > 350);
});

test('ten distinct finite timelines include individual arm and supported expression changes, and return to rest', () => {
  assert.equal(new Set(Object.values(GESTURES).map(value => JSON.stringify(value))).size, 11);
  for (const [key, frames] of Object.entries(GESTURES)) {
    assert.deepEqual(frames.at(-1).pose, {}, `${key}: final rest`);
    assert.ok(gestureDuration(key) > 500 && gestureDuration(key) < 3000, key);
    assert.ok(frames.some(frame => frame.pose.arm !== undefined || frame.pose.farArm !== undefined), key);
    for (const frame of frames) {
      assert.ok(frame.ms > 0 && frame.ms <= 700, key);
      assert.ok(Object.values(frame.pose).every(Number.isFinite), key);
      assert.ok(Math.abs(frame.pose.tilt ?? 0) <= 6, 'controlled rotations');
      assert.ok(Math.abs(frame.pose.stretch ?? 0) <= 0.04, 'restrained squash and stretch');
    }
  }
  assert.ok(GESTURES.shy.some(frame => frame.pose.farArm < -90));
  assert.ok(GESTURES.laugh.some(frame => frame.pose.happy === 1));
  assert.ok(GESTURES.sleepy.some(frame => frame.pose.blink === 1));
  assert.equal(GESTURES.happy.filter(frame => (frame.pose.lift ?? 0) < -20).length, 2);
});

test('normal taps cannot overlap even in the same React batch; the fifth tap preempts with one egg', () => {
  const gate = createMascotGestureController(() => 0);
  const first = gate.tap(0, 'general', true);
  assert.ok(first);
  assert.equal(gate.tap(200, 'general', true), null);
  assert.equal(gate.tap(400, 'general', false), null);
  assert.equal(gate.tap(600, 'general', false), null);
  const egg = gate.tap(800, 'general', false);
  assert.equal(egg.gesture, 'easteregg');
  assert.notEqual(egg.token, first.token);
  assert.equal(gate.complete(first.token), false, 'a stale completion cannot unlock the egg');
  assert.equal(gate.tap(1000, 'general', false), null);
  assert.equal(gate.start('dance'), null);
  assert.equal(gate.complete(egg.token), true);
  const next = gate.tap(1200, 'general', true);
  assert.notEqual(next.gesture, first.gesture);
});

test('separated taps do not trigger the egg and background cancellation drops its tap history', () => {
  const gate = createMascotGestureController(() => 0.8);
  for (let i = 0; i < 20; i++) {
    const request = gate.tap(i * 2200, 'general', true);
    assert.notEqual(request.gesture, 'easteregg');
    gate.complete(request.token);
  }
  const current = gate.start('thinking');
  gate.tap(50000, 'general', false); gate.tap(50100, 'general', false);
  gate.cancel();
  assert.equal(gate.complete(current.token), false);
  assert.equal(gate.tap(50200, 'general', false), null, 'unfocused state admits nothing');
  assert.notEqual(gate.tap(50300, 'general', true).gesture, 'easteregg');
});

test('navigation and background cancellation release normal reactions while a watched activity keeps ownership', () => {
  for (const state of ['reacting', 'celebrating', 'shy', 'peeking', 'waving']) assert.equal(nextMascotState(state, 'cancel'), 'idle');
  assert.equal(nextMascotState('watching', 'cancel'), 'watching');
  assert.equal(nextMascotState('sleeping', 'cancel'), 'sleeping');
  assert.equal(nextMascotState('watching', 'tap'), 'watching');
  assert.equal(nextMascotState('watching', 'gesture'), 'reacting', 'a result can become a reaction');
});

// Exercise the actual animation adapter without a native bridge. Inspect its
// scheduled targets, cancellation and final poses, rather than restating them.
const stub = `export const cancelAnimation = value => { value.cancelled++ }; export const Easing = { sin: 0, inOut: value => value }; export const withTiming = (to, config) => ({to, ...config}); export const withSequence = (...steps) => ({steps});`;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let animation = ts.transpileModule(readFileSync(new URL('../src/components/mascot/gesture-animation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
animation = animation.replace(/from 'react-native-reanimated'/, `from '${url(stub)}'`).replace(/from '.\/mascot-gestures'/, `from '${new URL('../src/components/mascot/mascot-gestures.ts', import.meta.url).href}'`);
const { animateMascotGesture } = await import(url(animation));
const rest = { arm: 104, farArm: 0, tilt: -6, lift: 0, stretch: 0, blink: 0, happy: 0, surprise: 0, blush: 0, gaze: -24 };
const values = () => Object.fromEntries(Object.keys(rest).map(key => [key, { cancelled: 0, set(value) { this.result = value; } }]));
test('every full and compact gesture cancels old tracks and lands exactly on the screen-specific rest pose', () => {
  for (const gesture of Object.keys(GESTURES)) for (const compact of [false, true]) {
    const tracks = values(); animateMascotGesture(gesture, tracks, rest, compact, false);
    for (const [key, track] of Object.entries(tracks)) {
      assert.equal(track.cancelled, 1);
      assert.equal(track.result.steps.at(-1).to, rest[key], `${gesture}: ${key}`);
      assert.equal(track.result.steps.reduce((sum, step) => sum + step.duration, 0), gestureDuration(gesture));
    }
    if (compact) assert.ok(tracks.lift.result.steps.every(step => step.to <= 42 && step.to >= -15));
  }
});
test('reduced motion schedules no arm travel, bounce, stretch or rotations for any gesture, including the egg', () => {
  for (const gesture of Object.keys(GESTURES)) {
    const tracks = values(); animateMascotGesture(gesture, tracks, rest, true, true);
    for (const key of ['arm', 'farArm', 'tilt', 'lift', 'stretch', 'gaze']) assert.equal(tracks[key].result, rest[key]);
    assert.equal(tracks.happy.result, 1);
  }
});
