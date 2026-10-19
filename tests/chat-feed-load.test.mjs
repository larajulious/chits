import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/chat-feed-load.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { loadChatFeed } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('timeline is visible and loading settles before slow or failed pins', async () => {
  const pins = deferred();
  const events = [];
  const pending = loadChatFeed({
    isCurrent: () => true,
    loadTimeline: async () => ['thought'],
    publishTimeline: (page) => events.push(page),
    onTimelineError: () => events.push('error'),
    onTimelineSettled: () => events.push('ready'),
    loadPinned: () => { events.push('pins-start'); return pins.promise.then(() => { throw new Error('pin failure'); }); },
    publishPinned: () => events.push('pins'),
  });
  await Promise.resolve();
  assert.deepEqual(events, [['thought'], 'ready', 'pins-start']);
  pins.resolve();
  await pending;
  assert.deepEqual(events, [['thought'], 'ready', 'pins-start']);
});

test('timeline failure settles loading and leaves optional pins independent', async () => {
  const events = [];
  await loadChatFeed({
    isCurrent: () => true,
    loadTimeline: async () => { throw new Error('timeline failure'); },
    publishTimeline: () => events.push('timeline'),
    onTimelineError: () => events.push('error'),
    onTimelineSettled: () => events.push('ready'),
    loadPinned: async () => ['pin'],
    publishPinned: (pins) => events.push(pins),
  });
  assert.deepEqual(events, ['error', 'ready', ['pin']]);
});

test('superseded or unmounted timeline work cannot publish or start pins', async () => {
  const timeline = deferred();
  let current = true;
  const events = [];
  const pending = loadChatFeed({
    isCurrent: () => current,
    loadTimeline: () => timeline.promise,
    publishTimeline: () => events.push('timeline'),
    onTimelineError: () => events.push('error'),
    onTimelineSettled: () => events.push('ready'),
    loadPinned: async () => { events.push('pins-start'); return []; },
    publishPinned: () => events.push('pins'),
  });
  current = false;
  timeline.resolve([]);
  await pending;
  assert.deepEqual(events, []);
});

test('pins finishing after blur cannot overwrite current state', async () => {
  const pins = deferred();
  let current = true;
  const events = [];
  const pending = loadChatFeed({
    isCurrent: () => current,
    loadTimeline: async () => [],
    publishTimeline: () => events.push('timeline'),
    onTimelineError: () => events.push('error'),
    onTimelineSettled: () => events.push('ready'),
    loadPinned: () => pins.promise,
    publishPinned: () => events.push('pins'),
  });
  await Promise.resolve();
  current = false;
  pins.resolve([]);
  await pending;
  assert.deepEqual(events, ['timeline', 'ready']);
});
