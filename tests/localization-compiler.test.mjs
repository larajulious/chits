import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync } from '@babel/core';
import { i18n, tr } from '../src/localization/runtime.ts';

test('compiler-transformed appearance settings refresh copy without remounting', async () => {
  const source = readFileSync('src/components/settings/chat-appearance-settings.native.tsx', 'utf8');
  const ast = ts.createSourceFile('appearance.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ChatAppearanceSettings');
  const compiled = transformSync(component.getText(ast), {
    filename: 'appearance.tsx', babelrc: false, configFile: false,
    plugins: ['babel-plugin-react-compiler', ['@babel/plugin-transform-typescript', { isTSX: true }], ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const tokens = { textSecondary: '#444', textPrimary: '#111', borderSubtle: '#ddd', surfaceElevated: '#fff', textMuted: '#888' };
  const scope = {
    exports: {}, require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }),
    useLocale: () => i18n.language, useDirection: () => ({rowStyle:{},isRTL:i18n.language==='ar'}), useTheme: () => ({ tokens }), useChatBackground: () => ({ background: null }),
    useLocalSearchParams: () => ({}), useState: value => [value, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useFocusEffect: () => {},
    tr, styles: {}, View: 'View', AppText: 'AppText', Pressable: 'Pressable', Icon: 'Icon', Modal: 'Modal', SafeAreaProvider: 'SafeAreaProvider', AppDialogProvider: 'AppDialogProvider',
  };
  vm.runInNewContext(compiled, scope);
  const render = scope.exports.ChatAppearanceSettings;
  for (const locale of ['fil', 'ar', 'ja', 'en']) {
    await i18n.changeLanguage(locale);
    const tree = render();
    assert.equal(tree.props.children[0].props.children, tr('chatappearancesettings.chatAppearance2'));
    assert.equal(tree.props.children[1].props.children[1].props.children[0].props.children, tr('chatappearancesettings.background'));
  }
});
