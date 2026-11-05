import assert from 'node:assert/strict';
import test from 'node:test';

import { HEADER_SCENE_DARK_INK, HEADER_SCENE_IDS, HEADER_SCENE_SUN_RADIUS, localMinute, sceneLook, sceneMixAt, sceneSky, sceneTone, sunAt } from '../src/constants/header-scenes.ts';
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

test('header ink follows appearance at every hour, including evening and night', () => {
  for (const minute of minutes) {
    const mix = sceneMixAt(minute);
    assert.equal(sceneLook(mix, 'light').ink, 'dark', String(minute));
    assert.equal(sceneLook(mix, 'dark').ink, 'light', String(minute));
  }
});

test('the room uses warm paper in light mode and warm charcoal in dark mode', () => {
  for (const minute of minutes) {
    const mix = sceneMixAt(minute);
    const light = sceneLook(mix, 'light');
    const dark = sceneLook(mix, 'dark');
    assert.equal(light.veil.color, '#FFFDF6');
    assert.equal(dark.veil.color, '#221E18');
    for (const { veil } of [light, dark]) assert.ok(veil.opacity > 0 && veil.opacity <= 0.75, `${minute}: ${veil.opacity}`);
  }
  assert.ok(sceneLook(sceneMixAt(hm(23)), 'light').veil.opacity > sceneLook(sceneMixAt(hm(9)), 'light').veil.opacity, 'night lifts more in light mode');
  assert.ok(sceneLook(sceneMixAt(hm(9)), 'dark').veil.opacity > sceneLook(sceneMixAt(hm(23)), 'dark').veil.opacity, 'day dims more in dark mode');
});

test('tinted scene bounds retain text and status-bar contrast through every blend', () => {
  const decode = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const encode = value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = rgb => rgb.map(decode).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  for (const minute of minutes) for (const scheme of ['light', 'dark']) {
    const mix = sceneMixAt(minute);
    const { ink, veil } = sceneLook(mix, scheme);
    const tint = channels(veil.color);
    for (const region of ['text', 'status']) {
      const end = ink === 'dark' ? 0 : 1;
      const base = Object.entries(mix).reduce((sum, [id, weight]) => sum + weight * encode(HEADER_SCENE_LUMINANCE[id][region][end]), 0);
      const background = luminance(tint.map(value => base * (1 - veil.opacity) + value * veil.opacity));
      const foreground = luminance(channels(ink === 'dark' ? HEADER_SCENE_DARK_INK.text : '#FFFFFF'));
      assert.ok(contrast(foreground, background) >= (region === 'text' ? 4.5 : 3), `${scheme} ${minute} ${region}`);
      if (region === 'text' && ink === 'dark') assert.ok(contrast(luminance(channels(HEADER_SCENE_DARK_INK.muted)), background) >= 3, `${minute} muted`);
    }
  }
});

test('clouds by day, stars and moon by night', () => {
  const noon = sceneSky(sceneMixAt(hm(12)));
  const midnight = sceneSky(sceneMixAt(0));
  assert.ok(noon.clouds > 0.5 && noon.stars === 0 && noon.motes > 0);
  assert.ok(midnight.stars === 1 && midnight.clouds === 0 && midnight.motes === 0);
  assert.match(sceneSky(sceneMixAt(hm(18, 30))).cloudColor, /^#[0-9a-f]{6}$/);
});

test('birds fly by day and stars fall by night', () => {
  const noon = sceneSky(sceneMixAt(hm(12)));
  const midnight = sceneSky(sceneMixAt(0));
  assert.ok(noon.birds > 0.5 && noon.meteors === 0);
  assert.ok(midnight.birds === 0 && midnight.meteors === 1);
  assert.match(sceneSky(sceneMixAt(hm(18, 30))).sunColor, /^#[0-9a-f]{6}$/);
});

test('the sun crosses the window with the clock and sets behind the hills', () => {
  for (const minute of [0, hm(3), hm(6), hm(19), hm(23)]) assert.equal(sunAt(minute), null, String(minute));
  const [top] = HEADER_SCENE_PANES;
  const morning = sunAt(hm(9));
  const noon = sunAt(hm(12, 30));
  const evening = sunAt(hm(17, 30));
  assert.ok(morning.x < noon.x && noon.x < evening.x, 'east to west');
  assert.ok(noon.y - HEADER_SCENE_SUN_RADIUS >= top.y && noon.y < top.y + top.h, 'high in the top panes at midday');
  // Just after rising and just before setting, the disc is still under the hills' lowest crest.
  for (const minute of [hm(6, 16), hm(18, 49)]) assert.ok(sunAt(minute).y - HEADER_SCENE_SUN_RADIUS > 385, String(minute));
});

test('the clock reads the local minute', () => {
  assert.equal(localMinute(new Date(2026, 9, 24, 13, 45, 30)), hm(13, 45.5));
});

test('the header waits on a tone that matches its pictures', () => {
  assert.deepEqual(Object.keys(HEADER_SCENE_TONE).sort(), [...HEADER_SCENE_IDS].sort());
  assert.equal(sceneTone({ night: 1 }).toUpperCase(), HEADER_SCENE_TONE.night);
  for (const minute of minutes) assert.match(sceneTone(sceneMixAt(minute)), /^#[0-9a-f]{6}$/, String(minute));
});
