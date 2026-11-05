import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { REVEAL_MS, SPIN_DURATION, fitWheelLabel, SPIN_SETTLE_MS, WHEEL_TOP_ROOM, spinOvershoot, spinWheelLayout } from '../src/features/spin/spin-layout.ts';
import { HERO_EDGE_INSET as SPIN_EDGE_INSET, heroStageLayout as spinHeroLayout } from '../src/components/mascot/hero-stage-layout.ts';
import { spinLanding, spinSummary } from '../src/services/spin-engine.ts';
import { EDGE, MASCOT_CUT } from '../src/features/onboarding/welcome/stage-layout.ts';
import { MASCOT_STATES, nextMascotState } from '../src/features/onboarding/welcome/mascot-machine.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const catalog = lang => JSON.parse(read(`src/localization/locales/${lang}.json`));
const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

for (const [width, height] of [[320, 568], [360, 640], [360, 780], [390, 844], [430, 932]]) {
  test(`${width}x${height}: the hero is compact and Chits is large, cropped and clear of the words`, () => {
    const hero = spinHeroLayout(width, height);
    assert.ok(hero.height >= 110 && hero.height <= 150, `height ${hero.height}`);
    const visible = (EDGE.rest - SPIN_EDGE_INSET - 191) * hero.unit;
    assert.ok(visible / width >= 0.25 && visible / width <= 0.35, `Chits takes ${visible / width} of the width`);
    assert.ok(hero.copyWidth >= 140, 'the words keep a readable column');
    const nearestWave = width - (EDGE.wave - SPIN_EDGE_INSET - 70) * hero.unit;
    assert.ok(hero.copyLeft + hero.copyWidth + 10 <= nearestWave, 'even the wave clears the words');
    const tapeTop = hero.height - (MASCOT_CUT - 130) * hero.unit;
    assert.ok(tapeTop >= 0, 'the tape stays inside the hero');
    const eyes = width - (EDGE.rest - SPIN_EDGE_INSET - 888) * hero.unit;
    assert.ok(eyes <= width - 3, 'both eyes are on screen');
  });
  test(`${width}x${height}: the wheel leads the page and steps back for a result`, () => {
    const viewport = height - 110;
    const { size, compactSize } = spinWheelLayout(width, viewport, spinHeroLayout(width, height).height);
    assert.ok(size >= 220 && size <= width - 32, `size ${size}`);
    assert.ok(compactSize >= 150 && compactSize < size, `compact ${compactSize}`);
    assert.ok(WHEEL_TOP_ROOM > size * 0.1 * 0.62 - 1 || size >= 300, 'the pointer has room above the wheel');
  });
}
test('enlarged or translated words grow the hero rather than running under the paper', () => {
  assert.ok(spinHeroLayout(390, 844, 240).height >= 264);
});
test('a tablet centers the words over the content and keeps the wheel bounded', () => {
  const hero = spinHeroLayout(1024, 1366);
  assert.equal(hero.copyLeft, (1024 - 620) / 2 + 20);
  assert.ok(spinWheelLayout(1024, 1200, hero.height).size <= 360);
});

test('wheel labels keep whole words, stepping the type down before splitting one', () => {
  const en = catalog('en');
  for (const category of ['tasks', 'unfinished', 'revisit', 'boards', 'quick', 'creative', 'unorganized', 'suggestions']) {
    const label = en[`spin.category.${category}`];
    const { lines } = fitWheelLabel(label, 16, 2);
    assert.equal(lines.join(' '), label, label);
  }
  assert.deepEqual(fitWheelLabel('Revisit', 16, 2), { lines: ['Revisit'], size: 16 });
  assert.ok(fitWheelLabel('Unorganisiert', 16, 2).size < 16);
  const cut = fitWheelLabel('Walk the dog around the lake then call Grandma about the weekend plans', 16, 2);
  assert.equal(cut.lines.length, 2);
  assert.ok(cut.lines[1].endsWith('…'), 'a long custom item is cut, never overflowing the slice');
  assert.ok(fitWheelLabel('未完了のメモ', 16, 2).lines.length <= 2, 'unspaced scripts still fit');
});
test('a spin lasts two to three seconds and its settle never leaves the chosen slice', () => {
  assert.ok(SPIN_DURATION >= 2000 && SPIN_DURATION <= 3000);
  assert.ok(SPIN_SETTLE_MS < SPIN_DURATION / 4);
  for (const count of [1, 2, 3, 8, 12, 24, 32]) assert.ok(spinOvershoot(count) < 180 / count, `count ${count}`);
});
test('the landing rests on the selected slice after any number of spins', () => {
  for (const count of [1, 2, 3, 5, 8, 13]) for (let index = 0; index < count; index++) for (const current of [0, 47.5, 359.9]) {
    const target = spinLanding(current, index, count);
    assert.ok(target > current + 360 * 4);
    const underPointer = ((360 - target % 360) % 360) / (360 / count);
    assert.ok(Math.abs(underPointer - index) < 1e-6 || Math.abs(underPointer - index - count) < 1e-6, `${index}/${count}`);
  }
});
test('the reveal runs in order: wheel, card, details, actions', () => {
  assert.ok(REVEAL_MS.wheel < REVEAL_MS.card && REVEAL_MS.card < REVEAL_MS.details && REVEAL_MS.details < REVEAL_MS.actions);
  assert.ok(REVEAL_MS.actions <= 800, 'Start Focus is never kept waiting');
});

test('Chits watches and celebrates inside the existing state machine', () => {
  assert.ok(MASCOT_STATES.includes('watching') && MASCOT_STATES.includes('celebrating'));
  for (const state of ['peeking', 'waving', 'idle', 'reacting', 'shy']) assert.equal(nextMascotState(state, 'watch'), 'watching');
  assert.equal(nextMascotState('watching', 'celebrate'), 'celebrating');
  assert.equal(nextMascotState('watching', 'rest'), 'idle');
  assert.equal(nextMascotState('celebrating', 'reacted'), 'idle');
  assert.equal(nextMascotState('celebrating', 'watch'), 'watching', 'Spin Again can interrupt a celebration');
  assert.equal(nextMascotState('watching', 'tap'), 'watching', 'a tap never interrupts the wheel');
  assert.equal(nextMascotState('hidden', 'celebrate'), 'hidden');
});

test('the result summary is the note’s own words, without repeating its title', () => {
  assert.equal(spinSummary({ title: 'Plan the trip', text: 'Plan the trip\nBook the guesthouse' }), 'Book the guesthouse');
  assert.equal(spinSummary({ title: 'Plan the trip', text: 'Plan the trip' }), '');
  assert.equal(spinSummary({ title: 'Trip', text: 'A whole other  thought' }), 'A whole other thought');
});

test('overdue colors read as a calm warning, not an alarm', async () => {
  const source = read('src/features/spin/spin-overdue-chip.tsx');
  const [paper, ink] = [/OVERDUE_PAPER = '(#\w{6})'/, /OVERDUE_INK = '(#\w{6})'/].map(pattern => source.match(pattern)[1]);
  assert.ok(contrast(paper, ink) >= 4.5);
});

test('Spin Again keeps the last result until the new selection lands', () => {
  for (const file of ['note-spin-screen', 'custom-spin-screen']) {
    const source = read(`src/features/spin/${file}.tsx`);
    const start = source.indexOf('const spin = () => void run');
    const beforeTheWheelTurns = source.slice(start, source.indexOf('spinTo(rotation', start));
    assert.doesNotMatch(beforeTheWheelTurns.replace(/if \(!chosen\)[^\n]*/, ''), /assignResult\(null\)|setResult\(null\)/, file);
  }
});

test('the wheel is drawn from the same list the target is computed from', () => {
  const source = read('src/features/spin/note-spin-screen.tsx');
  assert.match(source, /setFrozenCategories\(wheelCategories\)/);
  assert.match(source, /spinLanding\(angle\.current, wheelCategories\.indexOf\(chosen\.category\), wheelCategories\.length\)/);
});

test('every language has Chits’ lines, and de, fr, id and tr address the reader formally', () => {
  const ours = lang => Object.entries(catalog(lang)).filter(([key]) => /^spin\.(hero|say|picked)/.test(key)).map(([, value]) => value).join(' ');
  for (const lang of ['ar', 'de', 'en', 'es', 'fil', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'tr', 'vi']) {
    for (const key of ['spin.hero.title', 'spin.picked', 'spin.say.before', 'spin.say.found.3', 'spin.say.same', 'spin.overdueShort_other']) assert.ok(catalog(lang)[key], `${lang} ${key}`);
  }
  assert.doesNotMatch(ours('de'), /\b(du|dein\w*|dir|dich)\b/i);
  assert.doesNotMatch(ours('fr'), /\b(tu|ton|ta|tes|toi)\b/i);
  assert.doesNotMatch(ours('id'), /\b(kamu|\w+mu)\b/i);
  assert.doesNotMatch(ours('tr'), /\b(sen|senin|sana)\b/i);
});
