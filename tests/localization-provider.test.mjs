import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('saved language initializes outside render before exposing the main tree', () => {
  const source = readFileSync('src/localization/provider.tsx', 'utf8');
  const ast = ts.createSourceFile('provider.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'LanguageProvider');
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let savedState = null, mounted = false, applications = 0;
  const layouts = [];
  const scope = {
    exports: {}, require: () => ({ jsx: (type, props) => ({ type, props }) }),
    useSQLiteContext: () => ({}), useState: () => [savedState, next => { savedState = next; }],
    useLayoutEffect: callback => { if (!mounted) layouts.push(callback); }, useEffect: () => {}, useCallback: callback => callback, useMemo: callback => callback(),
    readLanguagePreference: () => 'ja', saveLanguagePreference: async () => {},
    apply: preference => { applications++; return { language: preference, locale: preference, clock24: true, timeZone: 'Asia/Tokyo' }; },
    i18n: {}, I18nextProvider: 'I18nextProvider', LanguageContext: { Provider: 'LanguageContext.Provider' },
  };
  vm.runInNewContext(code, scope);
  const children = { unsavedDraft: '日本語 हिन्दी العربية' };
  assert.equal(scope.exports.LanguageProvider({ children }), null);
  assert.equal(applications, 0, 'render cannot notify other translation subscribers');
  assert.equal(layouts.length, 1);
  layouts[0](); mounted = true;
  const tree = scope.exports.LanguageProvider({ children });
  assert.equal(applications, 1);
  assert.equal(tree.props.children.props.value.language, 'ja');
  assert.equal(tree.props.children.props.children, children);
});
