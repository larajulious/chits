import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { DEMO_CARDS, DEMO_FOCUS_MS, DEMO_FOCUS_START, DEMO_TASKS, demoCardRow, demoColumnAt, demoFocusReducer, demoPlanLine, demoVisualColumn, moveDemoCard, toggleDemoTask } from '../src/features/onboarding/demos/demo-state.ts';
import { clampTourStep, FEATURE_STEPS, sheetMoves, TOUR_STEP, TOUR_STEP_COUNT, tourPose } from '../src/features/onboarding/welcome/tour-steps.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const demoFiles = readdirSync(new URL('src/features/onboarding/demos/', root));

test('the tour runs in the order of the brief, and counts only the features', () => {
  assert.deepEqual(Object.keys(TOUR_STEP), ['meet', 'spaces', 'boards', 'spin', 'focus', 'plan', 'finish']);
  assert.equal(TOUR_STEP_COUNT, 7);
  assert.equal(FEATURE_STEPS.length, 5);
});

test('a damaged saved step can never point outside the tour', () => {
  assert.equal(clampTourStep(3), 3);
  assert.equal(clampTourStep(99), TOUR_STEP.finish);
  assert.equal(clampTourStep(-1), TOUR_STEP.meet);
  assert.equal(clampTourStep(1.5), TOUR_STEP.meet);
});

test('Chits only ducks out when the sheet moves, not between demos', () => {
  assert.equal(sheetMoves(TOUR_STEP.meet, TOUR_STEP.spaces), true);
  assert.equal(sheetMoves(TOUR_STEP.plan, TOUR_STEP.finish), true);
  assert.equal(sheetMoves(TOUR_STEP.boards, TOUR_STEP.spin), false);
  assert.equal(sheetMoves(TOUR_STEP.spin, TOUR_STEP.boards), false);
});

test('each feature has its own Chits: calm for Focus, cheerful then sleepy for Plan', () => {
  assert.equal(tourPose(TOUR_STEP.focus, false).calm, true);
  assert.equal(tourPose(TOUR_STEP.spin, false).calm, undefined);
  assert.equal(tourPose(TOUR_STEP.plan, false).cheerful, true);
  assert.equal(tourPose(TOUR_STEP.plan, true).sleepy, true);
  assert.equal(tourPose(TOUR_STEP.plan, true).cheerful, undefined);
  assert.equal(tourPose(TOUR_STEP.focus, true).sleepy, undefined, 'evening only ever belongs to Plan');
});

test('a card moves to the bottom of its new column, and the rest close the gap', () => {
  const moved = moveDemoCard(DEMO_CARDS, 'trip', 1);
  assert.equal(moved.find((card) => card.id === 'trip').column, 1);
  assert.equal(demoCardRow(moved, 'trip'), 0);
  assert.equal(demoCardRow(moved, 'paint'), 0, 'the card under it moved up');
  assert.equal(demoCardRow(moveDemoCard(moved, 'paint', 1), 'paint'), 1);
});

test('dropping a card where it started changes nothing, so Chits does not celebrate', () => {
  assert.equal(moveDemoCard(DEMO_CARDS, 'trip', 0), DEMO_CARDS);
  assert.equal(DEMO_CARDS.filter((card) => card.column === 0).length, 2, 'To Do starts with cards to drag');
});

test('the column under a dragged card follows the screen, in both directions', () => {
  const [width, gap] = [100, 6];
  assert.equal(demoColumnAt(50, width, gap, false), 0);
  assert.equal(demoColumnAt(150, width, gap, false), 1);
  assert.equal(demoColumnAt(290, width, gap, false), 2);
  assert.equal(demoColumnAt(-40, width, gap, false), 0, 'past the edge stays on the board');
  assert.equal(demoColumnAt(900, width, gap, false), 2);
  assert.equal(demoColumnAt(50, width, gap, true), 2, 'right-to-left: the first column is on the right');
  assert.equal(demoVisualColumn(0, true), 2);
});

test('the Focus demo starts, pauses, resumes, finishes and resets', () => {
  const run = (actions, from = DEMO_FOCUS_START) => actions.reduce(demoFocusReducer, from);
  assert.equal(run(['start']).status, 'running');
  assert.equal(run(['start', 'tick']).leftMs, DEMO_FOCUS_MS - 1000);
  const paused = run(['start', 'tick', 'pause']);
  assert.equal(paused.status, 'paused');
  assert.equal(run(['tick', 'tick'], paused).leftMs, paused.leftMs, 'a paused timer does not count');
  assert.equal(run(['start'], paused).status, 'running');
  assert.deepEqual(run(['reset'], paused), DEMO_FOCUS_START);
  const done = run(Array(DEMO_FOCUS_MS / 1000).fill('tick'), run(['start']));
  assert.deepEqual(done, { status: 'completed', leftMs: 0 });
  assert.equal(run(['start'], done).status, 'completed', 'only a reset leaves a finished session');
});

test('ticking a task off and on again works, and Chits uses the planner lines', () => {
  const one = toggleDemoTask([], 'one');
  assert.deepEqual(one, ['one']);
  assert.deepEqual(toggleDemoTask(one, 'one'), []);
  assert.equal(DEMO_TASKS.length, 3);
  assert.deepEqual([0, 1, 2, 3].map(demoPlanLine), [null, 'plan.say.first', 'plan.say.half', 'plan.say.all']);
});

test('no demo can reach saved data', () => {
  for (const file of demoFiles) {
    const source = read(`src/features/onboarding/demos/${file}`);
    assert.doesNotMatch(source, /expo-sqlite|useSQLiteContext|@\/db\/|-repository|use-plan-day|use-focus'|runAsync|createFocusRepository|Notifications/, file);
  }
  const screen = read('src/features/onboarding/screens/welcome-screen.tsx');
  assert.doesNotMatch(screen, /runAsync|INSERT INTO|createMessageRepository|create\w+Repository/, 'the screen only saves its step, through tour.ts');
  assert.match(screen, /saveTourStep\(database, next\)/);
});

test('the demos are the real parts, not lookalikes', () => {
  assert.match(read('src/features/onboarding/demos/spin-demo.tsx'), /<SpinWheel /);
  assert.match(read('src/features/onboarding/demos/spin-demo.tsx'), /spinLanding\(/);
  assert.match(read('src/features/onboarding/demos/focus-demo.tsx'), /<FocusDial /);
  assert.match(read('src/features/onboarding/demos/focus-demo.tsx'), /<DialReadout /);
  assert.match(read('src/features/onboarding/demos/plan-demo.tsx'), /<PlanTaskRow /);
  assert.match(read('src/features/onboarding/demos/plan-demo.tsx'), /<PlanProgress /);
});

test('a spin is really random, and every one lands on the slice it picked', () => {
  const spin = read('src/features/onboarding/demos/spin-demo.tsx');
  assert.match(spin, /Math\.floor\(Math\.random\(\) \* WHEEL_PAPERS\.length\)/);
  assert.match(spin, /setLanded\(winner\)/);
});

test('reduced motion is honoured wherever a demo moves something', () => {
  for (const file of ['boards-demo.tsx', 'spin-demo.tsx', 'focus-demo.tsx', 'plan-demo.tsx']) {
    assert.match(read(`src/features/onboarding/demos/${file}`), /useReducedMotion\(\)/, file);
  }
  assert.match(read('src/features/onboarding/demos/focus-demo.tsx'), /if \(!moving \|\| reduced\) return;/, 'the breathing loop never starts');
  assert.match(read('src/features/onboarding/demos/spin-demo.tsx'), /if \(reduced\) \{ finish\(\); return; \}/, 'the wheel goes straight to its answer');
});

test('nothing keeps running once its step is left', () => {
  const focus = read('src/features/onboarding/demos/focus-demo.tsx');
  assert.match(focus, /if \(!running \|\| !active\) return;/);
  assert.match(focus, /if \(!active\) send\('pause'\)/);
  assert.match(read('src/features/onboarding/demos/spin-demo.tsx'), /animation\.current\.stop\(\)/);
});

test('a screen reader can move cards without dragging', () => {
  const boards = read('src/features/onboarding/demos/boards-demo.tsx');
  assert.match(boards, /accessibilityActions=/);
  assert.match(boards, /onAccessibilityAction=/);
  assert.match(boards, /announceForAccessibility/);
});

test('the hold on a card follows the rules the real board learned', () => {
  const boards = read('src/features/onboarding/demos/boards-demo.tsx');
  assert.match(boards, /activateAfterLongPress\(HOLD_MS\)\.failOffsetX\(\[-10, 10\]\)\.failOffsetY\(\[-10, 10\]\)\.blocksExternalGesture\(/);
  assert.doesNotMatch(boards, /minDistance/);
});

test('every tour step keeps Skip and Next, and nothing has to be finished first', () => {
  const screen = read('src/features/onboarding/screens/welcome-screen.tsx');
  assert.equal(screen.match(/footer=\{demoFooter\(/g).length, 5);
  assert.doesNotMatch(screen, /disabled=/, 'Next is never held back by a demo');
  assert.match(screen, /ot\('tour\.finish\.start'\)/);
});
