import assert from 'node:assert/strict';
import test from 'node:test';

import { HEADER_SCENE_IDS, localMinute, sceneLook, sceneMixAt, sceneSky, sceneTone } from '../src/constants/header-scenes.ts';
import { HEADER_SCENE_LUMINANCE, HEADER_SCENE_PANES, HEADER_SCENE_SIZE, HEADER_SCENE_TONE } from '../src/constants/header-scenes.generated.ts';

const DAY = 24 * 60;
const minutes = Array.from({ length: DAY * 4 }, (_, i) => i / 4);
const hm = (h, m = 0) => h * 60 + m;

test('every scene was measured, and the panes sit inside the picture', () => {
  assert.deepEqual(Object.keys(HEADER_SCENE_LUMINANCE).sort(), [...HEADER_SCENE_IDS].sort());
  for (const pane of HEADER_SCENE_PANES) assert.ok(pane.x >= 0 && pane.y >= 0 && pane.x + pane.w <= HEADER_SCENE_SIZE.width && pane.y + pane.h <= HEADER_SCENE_SIZE.height);
});

test('at most two scenes show at once, and their weights sum to 1', () => {
  for (const minute of minutes) {
    const mix = Object.values(sceneMixAt(minute));
    assert.ok(mix.length >= 1 && mix.length <= 2, String(minute));
    assert.ok(mix.every((weight) => weight > 0 && weight <= 1), String(minute));
    assert.ok(Math.abs(mix.reduce((a, b) => a + b, 0) - 1) < 1e-9, String(minute));
  }
});

test('the day holds each scene at its hour', () => {
  for (const [minute, id] of [[hm(0), 'night'], [hm(3), 'night'], [hm(6, 20), 'dawn'], [hm(9), 'morning'], [hm(14), 'afternoon'], [hm(17, 30), 'golden'], [hm(19, 30), 'evening'], [hm(23), 'night']]) {
    assert.deepEqual(sceneMixAt(minute), { [id]: 1 }, `${minute / 60}h`);
  }
});

test('time changes the scene smoothly, across midnight too', () => {
  const weight = (minute, id) => sceneMixAt(minute)[id] ?? 0;
  for (const minute of [...minutes, DAY - 0.25]) {
    for (const id of HEADER_SCENE_IDS) assert.ok(Math.abs(weight(minute + 1, id) - weight(minute, id)) < 0.035, `${id} at ${minute}`);
  }
  assert.deepEqual(sceneMixAt(DAY + hm(9)), sceneMixAt(hm(9)));
  assert.deepEqual(sceneMixAt(-60), sceneMixAt(hm(23)));
});

test('dark ink by day, white ink by night, whatever the appearance', () => {
  for (const scheme of ['light', 'dark']) {
    for (const minute of [hm(6, 20), hm(9), hm(14), hm(17, 30)]) assert.equal(sceneLook(sceneMixAt(minute), scheme).ink, 'dark');
    for (const minute of [hm(19, 30), hm(23), hm(2)]) assert.equal(sceneLook(sceneMixAt(minute), scheme).ink, 'light');
  }
});

test('dark mode only dims: same ink, never a lighter veil, never heavy', () => {
  for (const minute of minutes) {
    const mix = sceneMixAt(minute);
    const light = sceneLook(mix, 'light');
    const dark = sceneLook(mix, 'dark');
    assert.equal(dark.ink, light.ink, String(minute));
    if (light.veil.color === '#000000') {
      assert.equal(dark.veil.color, '#000000', String(minute));
      assert.ok(dark.veil.opacity >= light.veil.opacity, String(minute));
    }
    for (const { veil } of [light, dark]) assert.ok(veil.opacity >= 0 && veil.opacity <= 0.4, `${minute}: ${veil.opacity}`);
  }
  assert.ok(sceneLook(sceneMixAt(hm(9)), 'dark').veil.opacity > 0, 'morning dims in dark mode');
  assert.ok(sceneLook(sceneMixAt(hm(23)), 'dark').veil.opacity > sceneLook(sceneMixAt(hm(23)), 'light').veil.opacity, 'night dims further in dark mode');
});

test('clouds by day, stars and moon by night', () => {
  const noon = sceneSky(sceneMixAt(hm(12)));
  const midnight = sceneSky(sceneMixAt(0));
  assert.ok(noon.clouds > 0.5 && noon.stars === 0 && noon.motes > 0);
  assert.ok(midnight.stars === 1 && midnight.clouds === 0 && midnight.motes === 0);
  assert.match(sceneSky(sceneMixAt(hm(18, 30))).cloudColor, /^#[0-9a-f]{6}$/);
});

test('the clock reads the local minute', () => {
  assert.equal(localMinute(new Date(2026, 9, 24, 13, 45, 30)), hm(13, 45.5));
});

test('the header waits on a tone that matches its pictures', () => {
  assert.deepEqual(Object.keys(HEADER_SCENE_TONE).sort(), [...HEADER_SCENE_IDS].sort());
  assert.equal(sceneTone({ night: 1 }).toUpperCase(), HEADER_SCENE_TONE.night);
  for (const minute of minutes) assert.match(sceneTone(sceneMixAt(minute)), /^#[0-9a-f]{6}$/, String(minute));
});
