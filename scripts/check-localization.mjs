import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const manifest = JSON.parse(readFileSync('src/localization/languages.json', 'utf8'));
const languages = manifest.map(item => item.id);
const errors = [];
const catalogs = {};
for (const language of languages) {
  try { catalogs[language] = JSON.parse(readFileSync(`src/localization/locales/${language}.json`, 'utf8')); }
  catch (error) { errors.push(`${language}: malformed or unavailable resource: ${error.message}`); catalogs[language] = {}; }
}
const english = catalogs.en;
const placeholders = value => [...value.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
const pluralKey = /_(zero|one|two|few|many|other)$/;
const roots = [...new Set(Object.keys(english).filter(key => pluralKey.test(key)).map(key => key.replace(pluralKey, '')))];
const coverage = {};
for (const language of languages) {
  const catalog = catalogs[language];
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  for (const [key, value] of Object.entries(english)) {
    const translated = catalog[key];
    if (typeof translated !== 'string' || !translated.trim()) { errors.push(`${language}: missing ${key}`); continue; }
    for (const brand of ['Chits', 'NoteSpace']) if (!['en', 'fil', 'pt-BR', 'es'].includes(language) && value.includes(brand) && !translated.includes(brand)) errors.push(`${language}: brand missing in ${key}`);
    try { assert.deepEqual(placeholders(translated), placeholders(value)); }
    catch { errors.push(`${language}: interpolation mismatch in ${key}`); }
  }
  for (const [key, value] of Object.entries(catalog)) {
    const root = key.replace(pluralKey, '');
    if (!(key in english) && !(roots.includes(root) && categories.includes(key.slice(root.length + 1)))) errors.push(`${language}: unknown key ${key}`);
    if (typeof value !== 'string' || !value.trim()) errors.push(`${language}: empty/invalid value ${key}`);
    const reference = english[key] ?? english[root + '_other'];
    if (reference && typeof value === 'string' && JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(reference))) errors.push(`${language}: placeholder mismatch ${key}`);
    if (typeof value === 'string' && /ZXQ|98765432\d{4}|\{\{[^}]*$/.test(value)) errors.push(`${language}: malformed placeholder ${key}`);
  }
  for (const root of roots) for (const category of categories) if (!(root + '_' + category in catalog)) errors.push(`${language}: missing plural ${root}_${category}`);
  const identical = Object.keys(english).filter(key => catalog[key] === english[key]);
  coverage[language] = { canonicalKeys: Object.keys(english).length, translatedKeys: Object.keys(english).filter(key => typeof catalog[key] === 'string' && catalog[key].trim()).length, totalKeys: Object.keys(catalog).length, pluralCategories: categories, identicalToEnglish: identical, linguisticReview: language === 'en' ? 'source' : 'native-speaker review required' };
}
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const plugins = config.plugins.filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-localization');
if (plugins.length !== 1) errors.push('Expected exactly one expo-localization plugin');
const configured = Array.isArray(plugins[0]) ? plugins[0][1]?.supportedLocales : undefined;
for (const platform of ['ios', 'android']) {
  const locales = Array.isArray(configured) ? configured : configured?.[platform];
  if (JSON.stringify(locales) !== JSON.stringify(languages)) errors.push(`Inconsistent ${platform} supportedLocales`);
}
if (JSON.stringify(Object.keys(config.locales)) !== JSON.stringify(languages) || new Set(languages).size !== languages.length) errors.push('Inconsistent locale registry/native configuration');
for (const language of languages) {
  try { if (new Intl.Locale(language).toString() !== language) errors.push(`${language}: noncanonical BCP-47 locale`); }
  catch { errors.push(`${language}: invalid BCP-47 locale`); }
}
for (const language of languages) {
  try { const native = JSON.parse(readFileSync(config.locales[language], 'utf8')).ios; for (const key of ['NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription']) if (!native[key]?.trim()) errors.push(`${language}: missing native permission ${key}`); }
  catch { errors.push(`${language}: malformed native resource`); }
}
const exists = key => typeof english[key] === 'string' || typeof english[key + '_other'] === 'string';
const uiProperties = new Set(['label', 'title', 'message', 'description', 'placeholder', 'accessibilityLabel', 'accessibilityHint', 'confirmText', 'cancelText', 'actionText']);
const intentional = new Set(['Chits', 'CHITS', 'NOTESPACE', 'PDF', 'Aa', 'AM', 'PM', 'AM or PM']);
let references = 0;
function checkSource(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { if (!['localization', 'mascot-greetings'].includes(entry.name)) checkSource(file); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const report = (node, message) => errors.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${message}`);
    function checkDisplayExpression(node, owner) {
      if (!node) return;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (/[A-Za-z]{2}/.test(node.text) && !intentional.has(node.text)) report(owner, `hardcoded UI expression ${JSON.stringify(node.text)}`);
      } else if (ts.isConditionalExpression(node)) {
        checkDisplayExpression(node.whenTrue, owner); checkDisplayExpression(node.whenFalse, owner);
      } else if (ts.isTemplateExpression(node)) {
        const literals = [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join(' ');
        if (/[A-Za-z]{2}/.test(literals)) report(owner, `hardcoded UI template ${JSON.stringify(literals)}`);
        for (const span of node.templateSpans) checkDisplayExpression(span.expression, owner);
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['tr', 'ot'].includes(node.expression.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = (node.expression.text === 'ot' ? 'onboarding.' : '') + node.arguments[0].text;
        references++;
        if (!exists(key)) report(node, `unknown translation key ${key}`);
      }
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, ' ').trim();
        if (/[A-Za-z]{2}/.test(text) && !intentional.has(text)) report(node, `hardcoded JSX text ${JSON.stringify(text)}`);
      }
      if (ts.isJsxAttribute(node) && uiProperties.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const text = node.initializer.text;
        if (/[A-Za-z]{2}/.test(text) && !intentional.has(text)) report(node, `hardcoded ${node.name.text} ${JSON.stringify(text)}`);
      }
      if (ts.isJsxAttribute(node) && uiProperties.has(node.name.text) && node.initializer && ts.isJsxExpression(node.initializer)) checkDisplayExpression(node.initializer.expression, node);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
checkSource('src');
const report = { generatedAt: new Date().toISOString(), languages, coverage, errors, unresolved: ['All translated catalogs require native-speaker review; identical English values are listed for review, including brands and homographs.', 'Device visual, accessibility and keyboard/IME acceptance remains manual.'] };
writeFileSync('docs/localization-report.json', JSON.stringify(report, null, 2) + '\n');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Localization audit passed: ${languages.length} bundled languages, ${Object.keys(english).length} English keys, ${references} static references; no missing keys, placeholder mismatches, or hardcoded JSX text/attributes.`);
