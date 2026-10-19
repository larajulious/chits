import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createChatTransitionLifecycle } from '../src/services/chat-transition-lifecycle.ts';
import { chatButtonFrame, localChatOrigin, measuredChatOrigin } from '../src/services/chat-transition-motion.ts';

function component(file, name, globals) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const slots = [], layouts = [];
  let cursor = 0;
  const slot = initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial(); return slots[index]; };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (callback, deps) => { const state = slot(() => ({})); if (!same(state.deps, deps)) { state.value = callback(); state.deps = deps; } return state.value; };
  const effect = (callback, deps) => {
    const state = slot(() => ({}));
    if (!same(state.deps, deps)) {
      state.deps = deps;
      layouts.push(() => { state.cleanup?.(); state.cleanup = callback(); });
    }
  };
  const jsx = (type, props) => ({ type, props });
  const scope = {
    exports: {}, require: () => ({ jsx, jsxs: jsx }),
    useState: initial => { const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial })); return [state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next; }]; },
    useRef: initial => slot(() => ({ current: initial })), useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useLayoutEffect: effect, useEffect: effect,
    useSharedValue: initial => slot(() => ({ value: initial, get() { return this.value; }, set(value) { this.value = value; } })),
    useAnimatedStyle: callback => callback(), useAnimatedReaction: () => {},
    ...globals,
  };
  vm.runInNewContext(code, scope);
  return {
    render(props = {}) { cursor = 0; return scope.exports[name](props); },
    commit() { while (layouts.length) layouts.shift()(); },
    unmount() { for (const state of [...slots].reverse()) state?.cleanup?.(); },
  };
}
const shared = initial => ({ value: initial, get() { return this.value; }, set(value) { this.value = value; } });
const theme = () => ({ tokens: { background: '#fff' }, styleTokens: { chat: { width: 58, height: 58 } } });

function launcher() {
  const transition = { buttonHidden: shared(false), calls: [], openChat(...args) { this.calls.push(args); } };
  let measurement = [20, 700, 58, 58];
  let deliverMeasurement = true;
  const view = component('src/components/navigation/bottom-nav.tsx', 'BottomNav', {
    useLocale: () => 'en', tr: key => key, useTheme: theme, useContext: () => () => {},
    useChatTransition: () => ({ ...transition, openChat: transition.openChat.bind(transition) }),
    measuredChatOrigin,
    View: 'View', Pressable: 'Pressable', ChatButtonFace: 'ChatButtonFace',
    BottomTabBarHeightCallbackContext: {}, Animated: { View: 'Animated.View' }, styles: {},
    floatingChatBottom: inset => Math.max(inset, 8) + 12, spacing: { lg: 24, sm: 12 },
    Easing: { out: fn => fn, quad: value => value }, withTiming: value => value,
    Haptics: { selectionAsync: async () => {} }, enterRise: () => {}, enterButtonSettle: () => {},
  });
  const props = { state: { routes: [{ name: 'index' }], index: 0 }, insets: { left: 0, bottom: 24 } };
  return {
    transition,
    measure: value => { measurement = value; },
    deliver: value => { deliverMeasurement = value; },
    route: name => { props.state.routes[0].name = name; },
    button() {
      const button = view.render(props).props.children;
      button.props.ref.current = { measureInWindow(callback) { if (deliverMeasurement) callback(...measurement); } };
      return button;
    },
  };
}

function providerHarness({ failDispatch = false } = {}) {
  const animations = [], navigations = [];
  let reject = failDispatch;
  let color = '#fff';
  let reducedMotionListener;
  const router = {
    navigate: path => { if (reject) { reject = false; throw new Error('dispatch failed'); } navigations.push(path); },
    canGoBack: () => false,
  };
  const view = component('src/components/navigation/chat-transition.tsx', 'ChatTransitionProvider', {
    useTheme: () => ({ ...theme(), tokens: { background: color } }), useRouter: () => router,
    createChatTransitionLifecycle, localChatOrigin, chatButtonFrame,
    View: 'View', Animated: { View: 'Animated.View' }, StyleSheet: { absoluteFill: {} }, styles: {}, ChatButtonFace: 'ChatButtonFace',
    ChatTransitionContext: { Provider: 'Provider' }, OPEN_DURATION: 280, EASING: value => value,
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: (event, callback) => { reducedMotionListener = callback; return { remove() {} }; },
    },
    setTimeout: () => { throw new Error('Navigation must not schedule a timer'); },
    withTiming: (value, options, complete) => { animations.push(complete); return value; },
    runOnJS: callback => callback, cancelAnimation: () => {},
  });
  const state = () => view.render().props.value;
  const overlay = () => view.render().props.children.props.children[1] !== null;
  state(); view.commit();
  return { view, state, overlay, animations, navigations, theme: () => { color = '#102030'; }, reduceMotion: () => reducedMotionListener(true) };
}
const origin = { x: 49, y: 729, size: 58 };

test('Chat dispatches even without a layout callback, ref, or valid native geometry', () => {
  const h = launcher();
  const button = h.button();
  button.props.ref.current = null;
  button.props.onPress();
  h.measure([0, 0, 0, 0]); h.button().props.onLayout(); h.button().props.onPress();
  h.deliver(false); h.button().props.onLayout(); h.button().props.onPress();
  assert.equal(h.transition.calls.length, 3);
  assert.ok(h.transition.calls.every(([geometry]) => geometry === null));
  assert.notEqual(h.button().props.disabled, true);
  h.deliver(true); h.measure([20, 700, 58, 58]);
  h.button().props.onLayout(); h.button().props.onPress();
  assert.deepEqual(h.transition.calls[3][0], origin);
});

test('localized copy never changes destination or originating route identifiers', () => {
  const h = launcher();
  for (const [route, expected] of [['index', '/'], ['calendar', '/calendar'], ['attachments', '/attachments'], ['archive', '/archive'], ['search', '/search']]) {
    h.route(route); h.button().props.onPress();
    assert.equal(h.transition.calls.at(-1)[1], expected);
  }
});

test('the accepted press dispatches synchronously exactly once before layout or animation', () => {
  const h = providerHarness();
  const actions = h.state();
  actions.openChat(origin, '/attachments');
  actions.openChat(origin, '/attachments');
  assert.deepEqual(h.navigations, ['/chat']);
  assert.equal(h.animations.length, 0);
  h.theme();
  assert.equal(h.state(), actions, 'theme/overlay updates preserve the timeline action context');
  h.view.commit();
  assert.equal(h.animations.length, 1);
  h.animations[0](false); // Cancellation is cosmetic; it cannot dispatch again.
  h.state(); h.view.commit();
  assert.equal(h.overlay(), false);
  assert.deepEqual(h.navigations, ['/chat']);
  actions.onChatFocus(); actions.onChatFocus();
  actions.closeChat();
  assert.deepEqual(h.navigations, ['/chat', '/attachments']);
  actions.onChatBlur();
  actions.openChat(null, '/calendar');
  assert.deepEqual(h.navigations, ['/chat', '/attachments', '/chat']);
});

test('rapid return and stale animation callbacks cannot cancel the next visit', () => {
  const h = providerHarness();
  h.state().openChat(origin, '/'); h.state(); h.view.commit();
  const previous = h.animations[0];
  h.state().onChatFocus(); h.state().closeChat(); h.state().onChatBlur();
  h.state(); h.view.commit();
  h.state().openChat(origin, '/calendar'); h.state(); h.view.commit();
  previous(true);
  assert.equal(h.overlay(), true);
  assert.deepEqual(h.navigations, ['/chat', '/', '/chat']);
  h.state().onChatFocus(); h.animations[1](true);
  assert.equal(h.overlay(), false);
  h.state().closeChat();
  assert.equal(h.navigations.at(-1), '/calendar');
});

test('reduced motion and absent geometry navigate without an overlay or completion callback', () => {
  const h = providerHarness();
  h.reduceMotion();
  h.state().openChat(origin, '/'); h.state(); h.view.commit();
  assert.deepEqual(h.navigations, ['/chat']);
  assert.equal(h.overlay(), false);
  assert.equal(h.animations.length, 0);
  h.state().onChatFocus(); h.state().onChatBlur();
  h.state().openChat(null, '/');
  assert.equal(h.navigations.length, 2);
});

test('a synchronous dispatch failure releases the navigation guard for retry', () => {
  const h = providerHarness({ failDispatch: true });
  assert.throws(() => h.state().openChat(origin, '/'), /dispatch failed/);
  h.state().openChat(null, '/');
  assert.deepEqual(h.navigations, ['/chat']);
});

test('unmount invalidates visual callbacks without issuing a navigation action', () => {
  const h = providerHarness();
  h.state().openChat(origin, '/'); h.state(); h.view.commit();
  h.view.unmount(); h.animations[0](true);
  assert.deepEqual(h.navigations, ['/chat']);
});
