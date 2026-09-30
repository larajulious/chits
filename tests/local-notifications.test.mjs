import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Check the installed SDK's executable dependency graph, since importing its
// package barrel silently starts remote push registration even for local use.
test('local notification adapter does not load push registration or its keychain module', () => {
  const visited = new Set();
  function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    assert.doesNotMatch(path, /(?:DevicePushTokenAutoRegistration|ServerRegistrationModule|TokenEmitter|\/build\/index\.js)/);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (node.isTypeOnly || node.importClause?.isTypeOnly || !node.moduleSpecifier) continue;
      const specifier = node.moduleSpecifier.text;
      assert.notEqual(specifier, 'expo-notifications');
      if (specifier.startsWith('expo-notifications/')) visit(resolve('node_modules', `${specifier}.js`));
      else if (specifier.startsWith('.')) visit(resolve(dirname(path), `${specifier}.js`));
    }
  }
  visit(resolve('src/services/local-notifications.native.ts'));
  assert.ok([...visited].some((path) => path.endsWith('/scheduleNotificationAsync.js')));
  assert.ok([...visited].some((path) => path.endsWith('/NotificationsHandler.js')));
  assert.ok([...visited].some((path) => path.endsWith('/NotificationsEmitter.js')));
});
