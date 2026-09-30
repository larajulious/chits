import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Exercise the stack reducer shipped with our installed Expo Router version.
const require = createRequire(import.meta.url);
const { StackRouter } = require('../node_modules/expo-router/build/react-navigation/routers/StackRouter.js');
const options = {
  routeNames: ['(tabs)', 'onboarding/welcome', 'onboarding/setup', 'onboarding/index', 'unorganized', 'board/[id]'],
  routeParamList: {},
  routeGetIdList: {},
};

for (const [label, history] of [
  ['Start writing or Skip on Welcome', ['(tabs)', 'onboarding/welcome']],
  ['finish or skip quick setup', ['(tabs)', 'unorganized', 'board/[id]', 'onboarding/setup']],
  ['Back to chat after making a card', ['(tabs)', 'unorganized', 'board/[id]']],
  ['start or skip a replay', ['(tabs)', 'onboarding/index', 'onboarding/welcome']],
  ['Welcome opened directly', ['onboarding/welcome']],
]) {
  test(`${label}: Back cannot return to a tour screen`, () => {
    const stack = StackRouter({ initialRouteName: history[0] });
    const initial = stack.getInitialState(options);
    const state = { ...initial, index: history.length - 1, routes: history.map((name, index) => ({ name, key: `${name}-${index}` })) };
    // dismissTo('/chat') resolves to POP_TO on the root (tabs) route, with
    // Chat as its child destination. Ordinary navigate leaves old screens behind.
    const next = stack.getStateForAction(state, { type: 'POP_TO', payload: { name: '(tabs)', params: { screen: 'chat' } } }, options);
    assert.deepEqual(next.routes.map((route) => route.name), ['(tabs)']);
    assert.equal(next.routes[0].params.screen, 'chat');
    assert.equal(stack.getStateForAction(next, { type: 'GO_BACK' }, options), null);
  });
}

test('every tour transition to Chat dismisses previous screens', () => {
  for (const [file, exits] of [
    ['screens/welcome-screen.tsx', 2],
    ['screens/setup-screen.tsx', 1],
    ['onboarding-layer.native.tsx', 1],
  ]) {
    const source = readFileSync(new URL('../src/features/onboarding/' + file, import.meta.url), 'utf8');
    assert.equal(source.match(/router\.dismissTo\('\/chat'\)/g)?.length, exits, file);
    assert.doesNotMatch(source, /router\.(navigate|push|replace)\('\/chat'\)/, file);
  }
});
