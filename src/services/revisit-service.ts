import type { SQLiteDatabase } from 'expo-sqlite';
import { createRevisitRepository } from '../db/revisit-repository';
import { discoverConnections, indexNote, pairKey, REVISIT_DEFAULTS, reviewSuggestion, type ConnectionSuggestion, type IndexedNote, type NoteKey, type RevisitNote, type ReviewSuggestion } from './revisit-engine';

export type RevisitReport = { reviews: ReviewSuggestion[]; connections: ConnectionSuggestion[]; notes: RevisitNote[]; preferences: { enabled: boolean; inactivityDays: number }; elapsedMs: number; fts5Supported: boolean };
type Cache = { revision: number; bucket: number; report: RevisitReport; indexed: Map<string, IndexedNote>; blocked: Set<string>; focused: Map<NoteKey, ConnectionSuggestion[]> };
const caches = new WeakMap<SQLiteDatabase, Cache>();
const pending = new WeakMap<SQLiteDatabase, Promise<RevisitReport>>();
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function calculate(database: SQLiteDatabase, now: number): Promise<RevisitReport> {
  const started = performance.now();
  const repository = createRevisitRepository(database);
  const revision = await repository.revision();
  // Minute bucket expires snoozes and inactivity at rest; writes invalidate at once.
  const bucket = Math.floor(now / 60_000);
  const old = caches.get(database);
  if (old?.revision === revision && old.bucket === bucket) return old.report;
  const preferences = await repository.preferences();
  const config = { ...REVISIT_DEFAULTS, inactivityDays: preferences.inactivityDays, progressDays: preferences.inactivityDays };
  const notes: RevisitNote[] = [];
  let after = '';
  // Runs on explicit feature entry/focus, never during list rendering. Keyset
  // pages bound bridge traffic; yielding also lets navigation/input proceed.
  while (true) {
    const page = await repository.page(after);
    notes.push(...page);
    if (page.length < 100) break;
    after = page[page.length - 1].key;
    await yieldToUI();
  }
  const relationships = await repository.relationships();
  const rejections = await repository.rejections();
  const blocked = new Set([...relationships, ...rejections].map((pair) => pairKey(pair.note_a, pair.note_b)));
  const indexed = new Map<string, IndexedNote>();
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const previous = old?.indexed.get(note.key);
    const entry = previous && previous.note.title === note.title && previous.note.text === note.text
      ? { ...previous, note } : indexNote(note, config);
    indexed.set(note.key, entry);
    if (i % 20 === 0) await yieldToUI();
  }
  let connections: ConnectionSuggestion[] = [];
  if (preferences.enabled) for (const batch of discoverConnections([...indexed.values()].filter((item) => !item.note.excluded && (item.note.snoozedUntil ?? 0) <= now), blocked, config)) {
    connections = batch;
    await yieldToUI();
  }
  const reviews = preferences.enabled ? notes.flatMap((note) => { const suggestion = reviewSuggestion(note, now, config); return suggestion ? [suggestion] : []; })
    .sort((a, b) => b.score - a.score || a.note.key.localeCompare(b.note.key)).slice(0, config.limit) : [];
  const fts5Supported = await repository.supportsFTS5();
  const report = { reviews, connections, notes, preferences, elapsedMs: performance.now() - started, fts5Supported };
  // Never cache a mixed snapshot if edits happened between pages. The next
  // refresh will retry; writes never depend on this disposable report.
  if (await repository.revision() !== revision) throw new Error('Your notes changed while Revisit was loading. Try again.');
  caches.set(database, { revision, bucket, report, indexed, blocked, focused: new Map() });
  return report;
}

export async function getRevisitReport(database: SQLiteDatabase, now = Date.now()) {
  const running = pending.get(database);
  if (running) return running;
  const operation = calculate(database, now);
  pending.set(database, operation);
  try { return await operation; } finally { pending.delete(database); }
}

export async function getNoteConnections(database: SQLiteDatabase, key: NoteKey, now = Date.now()): Promise<ConnectionSuggestion[]> {
  const report = await getRevisitReport(database, now);
  if (!report.preferences.enabled) return [];
  const cache = caches.get(database);
  if (!cache) return [];
  const existing = cache.focused.get(key);
  if (existing) return existing;
  let result: ConnectionSuggestion[] = [];
  const indexed = [...cache.indexed.values()].filter((item) => !item.note.excluded && (item.note.snoozedUntil ?? 0) <= now);
  for (const batch of discoverConnections(indexed, cache.blocked, REVISIT_DEFAULTS, key)) { result = batch; await yieldToUI(); }
  if (await createRevisitRepository(database).revision() !== cache.revision) return [];
  cache.focused.set(key, result);
  return result;
}

export function parseNoteKey(value: unknown): import('./revisit-engine').NoteKey | null {
  return typeof value === 'string' && /^(thought|card):.+$/.test(value) ? value as import('./revisit-engine').NoteKey : null;
}
