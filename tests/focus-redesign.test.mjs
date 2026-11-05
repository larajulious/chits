import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { focusCelebrates, focusDialSize, focusPickerNotes, focusFraction, focusHeroKeys, focusOutcome, focusPhase, focusPose, focusPrimaryKey } from '../src/features/focus/focus-phase.ts';
import { heroStageLayout } from '../src/components/mascot/hero-stage-layout.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const catalog = lang => JSON.parse(read(`src/localization/locales/${lang}.json`));
const MIN = 60_000;

test('the phase is the session’s own status, and no session is ready', () => {
  assert.equal(focusPhase(null), 'ready');
  for (const status of ['running', 'paused', 'unfinished', 'completed']) assert.equal(focusPhase({ status }), status);
});

test('only real focus reads as a success', () => {
  assert.equal(focusOutcome({ planned_ms: 25 * MIN, focused_ms: 25 * MIN }), 'full');
  assert.equal(focusOutcome({ planned_ms: null, focused_ms: 20 * MIN }), 'open');
  assert.equal(focusOutcome({ planned_ms: 25 * MIN, focused_ms: 10 * MIN }), 'early');
  assert.equal(focusOutcome({ planned_ms: 25 * MIN, focused_ms: 5000 }), 'brief');
  assert.equal(focusOutcome({ planned_ms: null, focused_ms: 5000 }), 'brief');
  assert.ok(focusCelebrates('full') && focusCelebrates('open'));
  assert.ok(!focusCelebrates('early') && !focusCelebrates('brief'));
  assert.equal(focusHeroKeys('completed', 'brief').title, 'focus.hero.brief.title');
  assert.equal(focusHeroKeys('completed', 'early').title, 'focus.hero.early.title');
  assert.equal(focusHeroKeys('completed', 'full').title, 'focus.hero.completed.title');
});

test('each phase has its heading, its line and one obvious action, in every language', () => {
  const expected = { ready: 'Start Focus', running: 'Pause Focus', paused: 'Resume Focus', unfinished: 'Resume Focus', completed: 'View Session Recap' };
  const en = catalog('en');
  for (const [phase, label] of Object.entries(expected)) assert.equal(en[focusPrimaryKey(phase)], label);
  assert.equal(en[focusHeroKeys('running', null).title], 'Shh... focus time.');
  for (const lang of ['ar', 'de', 'en', 'es', 'fil', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'tr', 'vi']) {
    const strings = catalog(lang);
    for (const phase of Object.keys(expected)) for (const key of Object.values(focusHeroKeys(phase, null))) assert.ok(strings[key], `${lang} ${key}`);
    for (const outcome of ['full', 'open', 'early', 'brief']) assert.ok(strings[`focus.recap.status.${outcome}`], `${lang} ${outcome}`);
  }
});

test('de, fr, id and tr address the reader formally', () => {
  const ours = lang => Object.entries(catalog(lang)).filter(([key]) => /^focus\.(hero|say|recap|pauseFocus|openNote|showTimer|focusingOn)/.test(key)).map(([, value]) => value).join(' ');
  assert.doesNotMatch(ours('de'), /\b(du|dein\w*|dir|dich)\b/i);
  assert.doesNotMatch(ours('fr'), /\b(tu|ton|ta|tes|toi)\b/i);
  assert.doesNotMatch(ours('id'), /\b(kamu|\w+mu)\b/i);
  assert.doesNotMatch(ours('tr'), /\b(sen|senin|sana)\b/i);
});

test('Chits is nearly still only while someone works, and tilts a curious head on a break', () => {
  assert.equal(focusPose('running').calm, true);
  for (const phase of ['ready', 'paused', 'unfinished', 'completed']) assert.equal(focusPose(phase).calm, false);
  assert.ok(focusPose('paused').restTilt > 0);
});

test('progress comes from the session, and an untimed one has none to show', () => {
  assert.equal(focusFraction({ planned_ms: 100, focused_ms: 25 }), 0.25);
  assert.equal(focusFraction({ planned_ms: 100, focused_ms: 500 }), 1);
  assert.equal(focusFraction({ planned_ms: null, focused_ms: 25 }), null);
  assert.equal(focusFraction(null), null);
});

for (const [width, height] of [[320, 568], [360, 640], [360, 780], [390, 844], [430, 932]]) {
  test(`${width}x${height}: the timer stays large and inside the screen`, () => {
    const size = focusDialSize(width, height - 110, heroStageLayout(width, height).height);
    assert.ok(size >= 180 && size <= 290, `size ${size}`);
    assert.ok(size <= width - 72);
  });
}

test('the ring reads on the white face in the default yellow', async () => {
  const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const { mix } = await import('../src/constants/style-tokens.ts');
  const ring = mix('#FBE47E', '#2B2620', 0.55);
  const white = (await import('../src/constants/paper.ts')).PAPER_WHITE;
  const [hi, lo] = [luminance(white), luminance(ring)].sort((a, b) => b - a);
  assert.ok((hi + 0.05) / (lo + 0.05) >= 3, 'non-text contrast');
});

test('the timer engine is untouched: the dial only reads the projection', () => {
  const source = read('src/features/focus/focus-dial.tsx');
  assert.doesNotMatch(source, /setInterval|Date\.now|advanceFocus|focusNow/);
  const screen = read('src/features/focus/focus-screen.tsx');
  assert.doesNotMatch(screen, /setInterval/);
  assert.equal((screen.match(/<FocusTimer /g) ?? []).length, 2, 'one for each view');
  assert.match(screen, /noteOpen \? <View style=\{styles\.stripWrap\}>/, 'the strip’s timer only mounts in the note view, so completion can’t fire twice');
});

test('the note editor stays mounted under the corner, so drafts and Quick Capture survive', () => {
  const screen = read('src/features/focus/focus-screen.tsx');
  assert.match(screen, /note && workspaceOpen \? <View style=\{\[styles\.flex, !noteOpen && styles\.hidden\]\}>/);
  assert.match(screen, /<FocusNoteEditor key=\{note\.key\} ref=\{editor\}/);
});

test('Chits celebrates a session finishing live, never one opened from history', () => {
  const screen = read('src/features/focus/focus-screen.tsx');
  assert.match(screen, /isFocusActive\(sessionRef\.current\) && next\?\.status === 'completed'\) setFinished/);
});


test('the side panel reaches Focus and Spin, and Spin follows its Settings switch', () => {
  const drawer = read('src/components/navigation/app-drawer.native.tsx');
  assert.match(drawer, /NavigationRow destination=\{focusDestination\}/);
  assert.match(drawer, /showSpin \? <NavigationRow destination=\{spinDestination\}/);
  assert.match(drawer, /createSpinRepository\(database\)\.visibility\(\)/);
});

test('opening Focus without a note resumes a session or asks, and never starts one', () => {
  const route = read('src/app/focus.native.tsx');
  assert.match(route, /if \(!params\.note\) return <FocusHome \/>/);
  const home = read('src/features/focus/focus-home.tsx');
  assert.match(home, /loadCardsFocus\(database\)/);
  assert.doesNotMatch(home, /repository\.(start|update)\(/);
});

test('the picker leaves out hidden notes, which Focus can’t open, and stays a short list', () => {
  const notes = Array.from({ length: 60 }, (_, i) => ({ id: String(i), hidden: i === 0 }));
  const picked = focusPickerNotes(notes);
  assert.equal(picked.length, 40);
  assert.ok(picked.every(note => !note.hidden));
});
