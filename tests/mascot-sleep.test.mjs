import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MASCOT_STATES, nextMascotState } from '../src/features/onboarding/welcome/mascot-machine.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Chits only falls asleep from rest', () => {
  assert.equal(nextMascotState('idle', 'sleep'), 'sleeping');
  for (const state of MASCOT_STATES.filter((name) => name !== 'idle')) assert.equal(nextMascotState(state, 'sleep'), state, state);
});

test('a tap wakes Chits into the usual reaction, and scrolling does not', () => {
  assert.equal(nextMascotState('sleeping', 'tap'), 'reacting');
  assert.equal(nextMascotState('reacting', 'reacted'), 'idle');
  assert.equal(nextMascotState('sleeping', 'reacted'), 'sleeping');
  assert.equal(nextMascotState('sleeping', 'leave'), 'exiting');
});

test('a sleeping Chits swaps the smile for a sleeping mouth, and waking swaps it back', () => {
  const mascot = read('src/features/onboarding/welcome/chits-peek-mascot.tsx');
  assert.match(mascot, /const smile = useAnimatedStyle\(\(\) => \(\{ opacity: \(1 - surprise\.get\(\)\) \* \(1 - asleep\.get\(\)\)/);
  assert.match(mascot, /style=\{sleepingMouth\}><SleepingMouthPart/);
  const rig = read('src/features/onboarding/welcome/use-mascot-rig.ts');
  assert.match(rig, /settle\(asleep, 1, 500\)/);
  assert.match(rig, /asleep\.set\(reduced \? 0 : withTiming\(0/);
});

test('only the listing heroes doze, a minute after the last scroll', () => {
  const hero = read('src/components/boards/boards-mascot-hero.native.tsx');
  assert.match(hero, /const DOZE_MS = 60_000;/);
  assert.match(hero, /dozeAfter: DOZE_MS/);
  assert.match(hero, /runOnJS\(stir\)\(\)/);
  for (const path of ['src/features/plan/plan-screen.tsx', 'src/features/onboarding/screens/welcome-screen.tsx', 'src/features/spin/spin-stage.tsx']) assert.doesNotMatch(read(path), /dozeAfter/, path);
});

test('Notes and Attachments filter with a text rail and one underline, not chips', () => {
  for (const path of ['src/components/boards/cards-collection.native.tsx', 'src/app/(tabs)/attachments.native.tsx']) {
    const screen = read(path);
    assert.match(screen, /<FilterRail /, path);
    assert.doesNotMatch(screen, /<Chip\b|<ChipRow\b/, path);
  }
  const rail = read('src/components/boards/filter-rail.tsx');
  assert.match(rail, /accessibilityRole="tab"/);
  assert.match(rail, /minHeight: FILTER_RAIL_HEIGHT - 1/);
  assert.match(rail, /animated: !reduced/);
});
