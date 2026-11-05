import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ENTRANCE_MS, MASCOT_STATES, nextMascotState, nextSpeechIndex, SPEECH_MS } from '../src/features/onboarding/welcome/mascot-machine.ts';
import { EDGE, heroLayout, MASCOT_CUT, stageLayout } from '../src/features/onboarding/welcome/stage-layout.ts';
import { welcomeSurfaces } from '../src/features/onboarding/welcome/welcome-surfaces.ts';
import { FEATURE_STEPS, TOUR_STEP, TOUR_STEP_COUNT } from '../src/features/onboarding/welcome/tour-steps.ts';
import { contrast } from '../src/constants/style-tokens.ts';

const walk = (events, from = 'hidden') => events.reduce(nextMascotState, from);

test('the entrance runs hidden → peeking → waving → idle in 2.2 seconds', () => {
  assert.equal(walk(['enter']), 'peeking');
  assert.equal(walk(['enter', 'noticed']), 'waving');
  assert.equal(walk(['enter', 'noticed', 'settled']), 'idle');
  assert.equal(ENTRANCE_MS.sneak + ENTRANCE_MS.wave + ENTRANCE_MS.settle, 2200);
});

test('reduced motion goes straight to idle', () => {
  assert.equal(walk(['skipEntrance']), 'idle');
});

test('repeated taps cannot stack reactions', () => {
  assert.equal(walk(['tap'], 'idle'), 'reacting');
  assert.equal(walk(['tap', 'tap', 'tap'], 'idle'), 'reacting');
  assert.equal(walk(['tap', 'reacted'], 'idle'), 'idle');
  assert.ok(SPEECH_MS >= 2000 && SPEECH_MS <= 3000);
});

test('Chits only reacts once the entrance has finished', () => {
  for (const state of ['hidden', 'peeking', 'waving', 'shy', 'exiting']) assert.equal(nextMascotState(state, 'tap'), state);
});

test('a long press hides Chits, and letting go brings them back without a new wave', () => {
  assert.equal(walk(['hold'], 'idle'), 'shy');
  assert.equal(walk(['tap', 'hold'], 'idle'), 'shy');
  assert.equal(walk(['hold', 'release', 'settled'], 'idle'), 'idle');
  assert.equal(nextMascotState('idle', 'release'), 'idle');
});

test('the primary action can interrupt every visible state', () => {
  for (const state of MASCOT_STATES.filter((name) => name !== 'hidden' && name !== 'exiting')) assert.equal(nextMascotState(state, 'leave'), 'exiting', state);
  assert.equal(walk(['returned', 'settled'], 'exiting'), 'idle');
});

test('no state is a dead end', () => {
  const events = ['enter', 'skipEntrance', 'noticed', 'settled', 'tap', 'reacted', 'hold', 'release', 'leave', 'returned'];
  for (const state of MASCOT_STATES) assert.ok(events.some((event) => nextMascotState(state, event) !== state), state);
});

test('speech never repeats the line just shown, and covers every line', () => {
  const seen = new Set();
  let index = -1;
  for (let turn = 0; turn < 400; turn += 1) {
    const next = nextSpeechIndex(index, 4);
    assert.notEqual(next, index);
    assert.ok(next >= 0 && next < 4);
    seen.add(next);
    index = next;
  }
  assert.equal(seen.size, 4);
  assert.equal(nextSpeechIndex(-1, 4, () => 0.999), 3);
});

for (const [name, width, height, top, bottom] of [
  ['iPhone SE', 375, 667, 20, 0],
  ['iPhone 17', 402, 874, 62, 34],
  ['Pro Max', 440, 956, 62, 34],
  ['small Android', 360, 640, 24, 16],
  ['tablet', 820, 1180, 24, 20],
]) {
  test(`${name}: Chits is clipped by the screen edge and clear of the status bar`, () => {
    const stage = stageLayout(width, height, { top, bottom });
    const [meetTop, spacesTop] = stage.sheetTops;
    const zoom = stage.zooms[0];
    const onScreen = (column) => width - (EDGE.rest - column) * stage.unit * zoom;
    // Chits is big: wider than half the screen on a phone, and cut off at the right.
    assert.ok(onScreen(1037) > width, 'the far edge of the body is outside the screen');
    if (width < 500) assert.ok(onScreen(1037) - onScreen(191) > width * 0.75, 'body is larger than a normal illustration');
    assert.ok(onScreen(466) > 0 && onScreen(818) < width, 'both eyes are on screen at rest');
    assert.ok(width - (EDGE.hidden - 102) * stage.unit * zoom >= width, 'fully hidden is really outside the screen');
    assert.ok(meetTop - MASCOT_CUT * stage.unit * zoom + 146 * stage.unit * zoom >= top, 'the tape clears the status bar');
    assert.ok(height - meetTop - bottom >= 280, 'the sheet keeps room for the copy and button');
    assert.ok(height - spacesTop - bottom >= 300, 'the Spaces preview gets most of the screen');
    assert.ok(stage.zooms[1] < zoom, 'Chits shrinks to make room on Your Space');
    assert.equal(stage.sheetTops.length, TOUR_STEP_COUNT);
    for (const step of FEATURE_STEPS) assert.equal(stage.sheetTops[step], spacesTop, 'the sheet holds still between demos');
    assert.ok(height - stage.sheetTops[TOUR_STEP.finish] - bottom >= 280, 'the last step keeps room for its words and button');
    assert.ok(stage.zooms[TOUR_STEP.finish] < zoom, 'Chits stays compact on the last step');
  });
}

test('the first run still ends at the first note, after the last tour step', () => {
  const layer = readFileSync(new URL('../src/features/onboarding/onboarding-layer.native.tsx', import.meta.url), 'utf8');
  assert.match(layer, /if \(tour\.mode === 'first-run'\) await endTour\(database\);/);
  const screen = readFileSync(new URL('../src/features/onboarding/screens/welcome-screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /router\.dismissTo\('\/chat'\)/);
  assert.doesNotMatch(screen, /focusInput=1/, 'opening the first-note screen does not request the keyboard');
  assert.doesNotMatch(screen, /createMessageRepository|INSERT INTO/, 'the note is saved by the real composer');
});

test('reduced motion removes movement, not the speech bubble', () => {
  const rig = readFileSync(new URL('../src/features/onboarding/welcome/use-mascot-rig.ts', import.meta.url), 'utf8');
  assert.match(rig, /[^a-zA-Z]after\(SPEECH_MS, /, 'reading time must not collapse to zero');
  assert.doesNotMatch(rig, /afterMotion\(SPEECH_MS/);
});

test('only an undecided launch covers Home, so returning users never see a blank frame', () => {
  const layer = readFileSync(new URL('../src/features/onboarding/onboarding-layer.native.tsx', import.meta.url), 'utf8');
  assert.match(layer, /useState\(\(\) => pathname === '\/' && \(!database\.getFirstSync\(.*ONBOARDING_KEYS\.firstRun\) \|\| canResumeTour\(/);
  assert.match(layer, /\.catch\(\(\) => false\)[\s\S]*setCovering\(false\)/, 'a failed launch check still uncovers the app');
});

// Read from the desk kit itself, so these hold for the colors that really ship.
const kit = ['paper-desk', 'desk-surface'].map((file) => readFileSync(new URL(`../src/components/desk/${file}.tsx`, import.meta.url), 'utf8')).join('\n');
const paperFile = readFileSync(new URL('../src/constants/paper.ts', import.meta.url), 'utf8');
const constant = (name) => paperFile.match(new RegExp(`${name} = '(#[0-9A-Fa-f]{6})'`))[1];
const deskFor = (scheme) => {
  const row = kit.match(new RegExp(`${scheme}: \\{ desk: '(#\\w+)'.*?ink: '(#\\w+)', inkMuted: '(#\\w+)'`));
  return { desk: row[1], ink: row[2], inkMuted: row[3] };
};
const paperTokens = { white: constant('PAPER_WHITE'), ink: constant('PAPER_INK'), yellow: constant('PAPER_YELLOW') };

for (const scheme of ['light', 'dark']) {
  test(`${scheme}: the two surfaces separate, and everything on the paper reads`, () => {
    const desk = deskFor(scheme);
    const surfaces = welcomeSurfaces(scheme, desk, paperTokens);
    assert.ok(contrast(surfaces.paper, desk.desk) >= 1.2, 'paper stands apart from the desk');
    assert.ok(contrast(surfaces.ink, surfaces.paper) >= 7, 'heading');
    assert.ok(contrast(surfaces.inkMuted, surfaces.paper) >= 4.5, 'description and reassurance');
    assert.ok(contrast(surfaces.ink, surfaces.control) >= 4.5, 'unselected space labels');
    assert.ok(contrast(surfaces.action, surfaces.paper) >= 3, 'the button shape is visible against the paper');
    assert.ok(contrast(surfaces.onAction, surfaces.action) >= 7, 'the button label');
    assert.ok(contrast(surfaces.ink, surfaces.card) >= 7 && contrast(surfaces.inkMuted, surfaces.card) >= 4.5, 'an open task');
    assert.ok(contrast(surfaces.ink, surfaces.cardDone) >= 7 && contrast(surfaces.inkMuted, surfaces.cardDone) >= 4.5, 'a finished task');
    assert.ok(contrast(surfaces.inkMuted, surfaces.control) >= 4.5, 'the count on the progress surface');
    assert.ok(contrast(surfaces.action, surfaces.track) >= 3, 'a filled segment against an empty one');
    assert.ok(contrast(desk.ink, desk.desk) >= 7 && contrast(desk.inkMuted, desk.desk) >= 4.5, 'the hero words on the desk');
  });
}

test('the yellow accent never carries the main action on light paper, where it nearly disappears', () => {
  assert.ok(contrast(paperTokens.yellow, paperTokens.white) < 3);
  assert.equal(welcomeSurfaces('light', deskFor('light'), paperTokens).action, paperTokens.ink);
  assert.equal(welcomeSurfaces('dark', deskFor('dark'), paperTokens).action, paperTokens.yellow);
});

test('dark mode is its own design, not the light surfaces inverted', () => {
  const light = welcomeSurfaces('light', deskFor('light'), paperTokens);
  const dark = welcomeSurfaces('dark', deskFor('dark'), paperTokens);
  assert.notEqual(dark.paper, light.action);
  assert.notEqual(dark.paper, '#000000');
  assert.ok(contrast(dark.paper, '#000000') > 1.4, 'not pure black');
});

test('only the paper tilts, so words and buttons stay level and in place', () => {
  const screen = readFileSync(new URL('../src/features/onboarding/screens/welcome-screen.tsx', import.meta.url), 'utf8');
  assert.equal(screen.match(/PAPER_TILT/g).length, 2, 'declared once, used once');
  assert.match(screen, /paper: \{[^\n]*rotate/);
  assert.doesNotMatch(screen.match(/<StepPanel[\s\S]*<\/StepPanel>/)[0], /rotate/);
});

test('the app waits briefly for its fonts, then opens either way', () => {
  const provider = readFileSync(new URL('../src/components/theme-provider.tsx', import.meta.url), 'utf8');
  assert.match(provider, /loadAsync\(STICKY_FONTS\)/);
  assert.doesNotMatch(provider, /style !== 'sticky'/, 'every style gets them');
  assert.match(provider, /setTimeout\(\(\) => \{ if \(active\) setFontWaitOver\(true\); \}, FONT_WAIT_MS\)/, 'a stuck load can never hold the app shut');
  assert.match(provider, /stickyFontsReady \? preset : \{ \.\.\.preset, font: SYSTEM_FACES \}/, 'a face is never named before it registers');
  const fonts = readFileSync(new URL('../src/features/onboarding/welcome/welcome-fonts.ts', import.meta.url), 'utf8');
  assert.match(fonts, /if \(!loaded\) return \{ display: undefined, text: undefined, textBold: undefined \}/);
});

test('one type everywhere, with handwriting, theme faces and exports left alone', () => {
  const text = readFileSync(new URL('../src/components/ui/app-text.tsx', import.meta.url), 'utf8');
  assert.match(text, /flattened\?\.fontFamily \? null : font/, 'an explicit face such as Kalam is never overridden');
  assert.match(text, /tokens\.id === 'classic' && look\.headingFont/, 'a theme keeps its own heading face');
  const template = readFileSync(new URL('../src/components/share-note/share-note-template.tsx', import.meta.url), 'utf8');
  assert.match(template, /<Text[ >]/, 'Share Note images keep each theme type');
});

test('a chosen face gives way to the system face in languages it cannot draw', () => {
  const text = readFileSync(new URL('../src/components/ui/app-text.tsx', import.meta.url), 'utf8');
  assert.match(text, /family && !needsSystemFont\(text, locale\)/);
  assert.match(text, /style=\{\[bidi, style, flattened\?\.fontFamily \? null : font, chosenFace, scriptFont\]\}/, 'after the style font so it wins, before the script font so it never overrides that');
});

for (const width of [320, 360, 390, 440, 820]) {
  test(`${width}pt: the hub hero keeps Chits and the words apart, and grows for long words`, () => {
    const hero = heroLayout(width, 0);
    const bodyLeft = width - (EDGE.rest - 191) * hero.unit;
    assert.ok(hero.copyLeft + hero.copyWidth <= bodyLeft, 'the words stop before Chits begins');
    assert.ok(hero.height >= 170, 'Chits is big enough to notice');
    assert.equal(heroLayout(width, 400).height, 428, 'long or enlarged text pushes the paper down rather than running under it');
    const tight = heroLayout(width, 100, 720, 140);
    assert.equal(tight.height, 140, 'on a short screen the hero takes exactly what the content leaves');
    assert.ok(tight.unit < hero.unit, 'and Chits scales down to fit it');
  });
}

test('new copy matches the form of address each language already uses in the app', () => {
  const catalog = (lang) => JSON.parse(readFileSync(new URL(`../src/localization/locales/${lang}.json`, import.meta.url), 'utf8'));
  const ours = (lang) => Object.entries(catalog(lang)).filter(([key]) => /^onboarding\.(meet|mascot|spaces|tour|hub\.(hero|task|say|saved|replay))/.test(key)).map(([, value]) => value).join(' ');
  assert.doesNotMatch(ours('de'), /\b(du|dein\w*|dir|dich)\b/i, 'German is Sie');
  assert.doesNotMatch(ours('fr'), /\b(tu|ton|ta|tes|toi|t’écoute)\b/i, 'French is vous');
  assert.doesNotMatch(ours('id'), /\b(kamu|\w+mu)\b/i, 'Indonesian is Anda');
});

test('the hub fits one screen, and scrolls only when it truly cannot', () => {
  const screen = readFileSync(new URL('../src/features/onboarding/screens/hub-screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /viewport - contentHeight/);
  assert.match(screen, /scrollEnabled=\{overflows\}/);
  assert.match(screen, /<BackHeader title=""/, 'no label in the room header');
});

test('Quick setup has a way in, and the desk has real dots', () => {
  const layer = readFileSync(new URL('../src/features/onboarding/onboarding-layer.native.tsx', import.meta.url), 'utf8');
  assert.match(layer, /router\.push\('\/onboarding\/setup'\)/);
  assert.doesNotMatch(layer, /tour\.mode === 'replay'\) await finish\(\)/);
  assert.doesNotMatch(kit, /resizeMode="repeat"/, 'an image set to repeat did not tile');
  assert.match(kit, /<Pattern id="deskDots"/);
});

test('Chits’ arm is drawn in one piece, so the wrist can’t look cut at the paper', () => {
  const peek = readFileSync(new URL('../src/features/onboarding/welcome/chits-peek-mascot.tsx', import.meta.url), 'utf8');
  const art = readFileSync(new URL('../src/features/onboarding/welcome/mascot-art.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(art, /HandPart|hand: \{/);
  assert.equal(peek.match(/<ArmPart /g).length, 1, 'one arm, above the paper');
  assert.ok(peek.indexOf('{children}') < peek.indexOf('<ArmPart '), 'the arm comes after the paper, so it stays in front of it');
});
