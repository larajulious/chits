import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COMPACT_EDGE_INSET, compactHeroLayout, heroScroll } from '../src/components/boards/compact-hero-layout.ts';
import { EDGE, MASCOT_CUT, MASCOT_VIEWBOX } from '../src/features/onboarding/welcome/stage-layout.ts';

for (const width of [320, 360, 390, 430, 768, 1024]) {
  test(`${width}dp: compact copy clears Chits, with a large cropped face and visible hand`, () => {
    const hero = compactHeroLayout(width);
    assert.ok(hero.height >= 168 && hero.height <= 200);
    assert.ok(hero.unit * MASCOT_VIEWBOX >= 225, 'the character still fills the hero rather than becoming an icon');
    const frameLeft = width - (EDGE.rest - COMPACT_EDGE_INSET) * hero.unit;
    assert.ok(frameLeft + 1050 * hero.unit > width, 'the body continues past the right edge');
    const nearestWave = width - (EDGE.wave - COMPACT_EDGE_INSET - 26) * hero.unit;
    assert.ok(hero.copyLeft + hero.copyWidth + 8 <= nearestWave, 'even the entrance wave clears the copy');
    const faceTop = hero.height - 12 - (MASCOT_CUT - 450) * hero.unit;
    const handTop = hero.height - 12 - (MASCOT_CUT - 790) * hero.unit;
    const tapeTop = hero.height - 12 - (MASCOT_CUT - 130) * hero.unit;
    assert.ok(tapeTop >= 12, 'the top of the head and tape are inside the hero');
    assert.ok(frameLeft + 888 * hero.unit <= width - 3, 'both eyes are inside the screen');
    assert.ok(faceTop >= 0 && faceTop + 170 * hero.unit < hero.height, 'the eyes stay in view');
    assert.ok(handTop >= 0 && handTop < hero.height - 12, 'the resting hand stays in view');
  });
  test(`${width}dp: enlarged or translated copy can grow without clipping`, () => {
    const hero = compactHeroLayout(width, 300);
    assert.ok(hero.height >= 324);
    assert.ok(hero.copyWidth > 120);
  });
}

test('the hero holds still only until the paper has covered it', () => {
  assert.equal(heroScroll(-60, 180), 0, 'a negative offset never moves it');
  assert.equal(heroScroll(90, 180), 90, 'it cancels the scroll exactly');
  assert.equal(heroScroll(5000, 180), 180, 'a long list stops updating once it is covered');
});

test('neither listing can overscroll the hero away from the app header', () => {
  for (const path of ['src/components/boards/boards-listing.native.tsx', 'src/components/boards/cards-collection.native.tsx']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /bounces=\{false\}/, path);
    assert.match(source, /overScrollMode="never"/, path);
  }
});

test('both listings give the hero the live scroll position', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(read('src/components/boards/boards-listing.native.tsx'), /scrollY=\{scrollY\}/);
  assert.match(read('src/components/notes/notes-listing.native.tsx'), /scrollOffset=\{scrollY\}[\s\S]*scrollY=\{scrollY\}/);
});
