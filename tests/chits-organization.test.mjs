import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/chits-organization.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const guidance = module.exports;
const message = (text, types = []) => ({ text, attachments: types.map((type) => ({ type })) });

test('only useful Chat text and supported attachments can qualify', () => {
  for (const text of ['ok', 'yes', 'thanks', 'haha', 'test', 'later']) assert.equal(guidance.scoreOrganizationCandidate(message(text)), 0);
  assert.ok(guidance.scoreOrganizationCandidate(message('Prepare proposal and updated quotation for tomorrow’s client meeting.')) >= 2);
  assert.ok(guidance.scoreOrganizationCandidate(message('Design inspiration for the new landing page.', ['photo'])) >= 2);
  assert.ok(guidance.scoreOrganizationCandidate(message('Client quotation for final review.', ['file'])) >= 2);
  assert.ok(guidance.scoreOrganizationCandidate(message('Reference animation for the Chits onboarding.', ['video'])) >= 2);
  assert.ok(guidance.scoreOrganizationCandidate(message('UI references for the new dashboard.', ['photo', 'photo'])) >= 2);
  assert.equal(guidance.scoreOrganizationCandidate(message('Call mom tomorrow')), 1);
  assert.equal(guidance.scoreOrganizationCandidate(message('', ['audio'])), 0);
});

test('one meaningful criterion qualifies a newly sent note', () => {
  assert.ok(guidance.scoreOrganizationCandidate(message('A thought that is longer than sixty characters and can be organized later.')) >= 1);
  assert.ok(guidance.scoreOrganizationCandidate(message('A quick idea for the landing page')) >= 1);
  assert.ok(guidance.scoreOrganizationCandidate(message('', ['photo'])) >= 1);
});

test('invalid saved state uses safe defaults', () => {
  assert.deepEqual(guidance.parseOrganizationState('{'), guidance.DEFAULT_ORGANIZATION_STATE);
  const parsed = guidance.parseOrganizationState(JSON.stringify({ introSeen: true, lastSuggestionAt: 1_000_000, meaningfulNotesSinceSuggestion: 0, consecutiveDismissals: 4, lastAcceptedSuggestionType: 'space' }));
  assert.equal(parsed.introSeen, true);
  assert.equal('lastSuggestionAt' in parsed, false);
  assert.equal('meaningfulNotesSinceSuggestion' in parsed, false);
  assert.equal('consecutiveDismissals' in parsed, false);
  assert.equal(parsed.lastAcceptedSuggestionType, 'space');
});
