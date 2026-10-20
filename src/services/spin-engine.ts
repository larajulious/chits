import { reviewSuggestion, REVISIT_DEFAULTS, type RevisitNote, type NoteKey } from './revisit-engine';

export const SPIN_CATEGORIES = ['tasks', 'unfinished', 'revisit', 'boards', 'quick', 'creative', 'unorganized'] as const;
export type SpinCategory = typeof SPIN_CATEGORIES[number];
export type SpinEnergy = 'low' | 'medium' | 'high';
export type SpinPreferences = { categoriesVersion: 2; minutes: number | null; energy: SpinEnergy; categories: SpinCategory[]; includeSuggestions: boolean; includeUnestimated: boolean; celebrations: boolean; sound: boolean; rewards: boolean };
export const SPIN_DEFAULTS: SpinPreferences = { categoriesVersion: 2, minutes: 15, energy: 'medium', categories: [...SPIN_CATEGORIES], includeSuggestions: true, includeUnestimated: true, celebrations: true, sound: false, rewards: true };
export type SpinMetadata = { note_key: NoteKey; duration_minutes: number | null; priority: number; energy: SpinEnergy | null };
export type SpinExposure = { note_key: NoteKey; selected_at: number; skipped_at: number | null };
export type SpinCandidate = { note: RevisitNote; category: SpinCategory; kind: 'task' | 'review' | 'creative'; minutes: number | null; priority: number; weight: number; reason: 'due' | 'priority' | 'revisit' | 'work' | 'creative' | 'board' | 'continue' | 'planned' | 'unorganized'; related?: NoteKey; space?: string; metadata?: SpinMetadata; plannedAt?: number };

export type SpinSuggestion = { kind: 'suggestion'; action: 'new-note'; category: 'suggestions'; weight: number };
export type SpinOption = SpinCandidate | SpinSuggestion;
export type SpinWheelCategory = SpinCategory | SpinSuggestion['category'];
export const SPIN_WHEEL_CATEGORIES: SpinWheelCategory[] = [...SPIN_CATEGORIES, 'suggestions'];
export function spinOptionKey(option: SpinOption): string {
  return option.kind === 'suggestion' ? `action:${option.action}` : option.note.key;
}
// Suggestions are exercises, never synthetic note records or inferred unfinished work.
export function spinOptions(candidates: SpinCandidate[], preferences: SpinPreferences, skippedAt: number | null = null, now = Date.now()): SpinOption[] {
  return preferences.includeSuggestions && (skippedAt === null || skippedAt <= now - 10 * 60_000)
    ? [...candidates, { kind: 'suggestion', action: 'new-note', category: 'suggestions', weight: 1 }]
    : candidates;
}

export function normalizeSpinPreferences(value: unknown): SpinPreferences {
  const v = value && typeof value === 'object' ? value as Partial<SpinPreferences> : {};
  const categories = Array.isArray(v.categories) ? SPIN_CATEGORIES.filter(c => v.categories!.includes(c)) : [...SPIN_CATEGORIES];
  // Upgrade the former all-selected default once; preserve partial/empty selections.
  if (v.categoriesVersion !== 2 && SPIN_CATEGORIES.filter(c => c !== 'unorganized').every(c => categories.includes(c)) && !categories.includes('unorganized')) categories.push('unorganized');
  return { categoriesVersion: 2, minutes: v.minutes === null || [5,15,30,60].includes(v.minutes!) ? v.minutes! : 15,
    energy: ['low','medium','high'].includes(v.energy!) ? v.energy! : 'medium',
    categories,
    includeSuggestions: v.includeSuggestions !== false, includeUnestimated: v.includeUnestimated !== false, celebrations: v.celebrations !== false, sound: v.sound === true, rewards: v.rewards !== false };
}

export function spinCandidates(notes: RevisitNote[], metadata: SpinMetadata[], history: SpinExposure[], preferences: SpinPreferences, now: number, options: { challenge?: boolean; revisitEnabled?: boolean; inactivityDays?: number; relationships?: { note_a: NoteKey; note_b: NoteKey }[]; spaces?: Map<NoteKey, string>; unfinishedFocus?: Set<NoteKey>; planned?: Map<NoteKey, number> } = {}): SpinCandidate[] {
  const meta = new Map(metadata.map(m => [m.note_key, m]));
  const exposure = new Map<NoteKey, { selected: number; skipped: number; skips: number }>();
  for (const row of history) {
    const old = exposure.get(row.note_key) ?? { selected: 0, skipped: 0, skips: 0 };
    old.selected = Math.max(old.selected, row.selected_at); old.skipped = Math.max(old.skipped, row.skipped_at ?? 0);
    if ((row.skipped_at ?? 0) > now - 86_400_000) old.skips++;
    exposure.set(row.note_key, old);
  }
  const availableKeys = new Set(notes.filter(n => !n.excluded && (n.snoozedUntil ?? 0) <= now).map(n => n.key));
  const relatedKeys = new Map<NoteKey, NoteKey>();
  for (const relationship of options.relationships ?? []) {
    if (!availableKeys.has(relationship.note_a) || !availableKeys.has(relationship.note_b)) continue;
    if (!relatedKeys.has(relationship.note_a)) relatedKeys.set(relationship.note_a, relationship.note_b);
    if (!relatedKeys.has(relationship.note_b)) relatedKeys.set(relationship.note_b, relationship.note_a);
  }
  return notes.flatMap(note => {
    if (note.excluded || (note.snoozedUntil ?? 0) > now || (note.total > 0 && note.completed >= note.total)) return [];
    const m = meta.get(note.key);
    const remaining = note.total - note.completed;
    const review = options.revisitEnabled !== false && reviewSuggestion(note, now, { ...REVISIT_DEFAULTS, inactivityDays: options.inactivityDays ?? 14, progressDays: options.inactivityDays ?? 14 });
    const durations = m?.duration_minutes ?? null;
    const categories: SpinCategory[] = remaining > 0 ? [note.boardId ? 'tasks' : 'unfinished', ...(note.boardId ? ['boards' as const] : []), ...(durations !== null && durations <= 5 ? ['quick' as const] : []), ...(review ? ['revisit' as const] : [])]
      : [...(options.unfinishedFocus?.has(note.key) ? ['unfinished' as const] : []), ...(note.boardId ? ['boards' as const] : []), ...(review ? ['revisit' as const] : []), ...(note.pinned || review ? ['creative' as const] : [])];
    if (note.key.startsWith('thought:') && !note.boardId) categories.push('unorganized');
    const recent = exposure.get(note.key);
    // Cooldown expires locally; no source status is ever changed by a skip.
    if ((recent?.skipped ?? 0) > now - 10 * 60_000) return [];
    return categories.filter(category => preferences.categories.includes(category)).flatMap(category => {
      const kind = category === 'creative' ? 'creative' : category === 'revisit' || remaining === 0 ? 'review' : 'task';
      // Review/writing prompts are bounded exercises, not inferred task estimates.
      const minutes = kind === 'task' ? durations : 5;
      if (minutes === null && (!preferences.includeUnestimated || options.challenge)) return [];
      const budget = options.challenge ? 5 : preferences.minutes;
      if (budget !== null && minutes !== null && minutes > budget) return [];
      const levels = { low: 0, medium: 1, high: 2 };
      if (m?.energy && levels[m.energy] > levels[preferences.energy]) return [];
      const due = kind === 'task' && note.reminderAt !== null && note.reminderAt <= now + 86_400_000;
      const priority = m?.priority ?? 0;
      const plannedAt = options.planned?.get(note.key);
      const planned = plannedAt !== undefined && plannedAt <= now + 86_400_000;
      let weight = 1 + priority * 2 + (due ? 6 : planned ? 3 : 0) + (review && category === 'revisit' ? 2 : 0);
      if ((recent?.selected ?? 0) > now - 86_400_000) weight *= 0.2;
      weight /= 1 + (recent?.skips ?? 0);
      const related = relatedKeys.get(note.key);
      return [{ note, category, kind, minutes, priority, weight, reason: category === 'unorganized' && kind === 'review' ? 'unorganized' : due ? 'due' : priority ? 'priority' : planned ? 'planned' : category === 'unfinished' && !remaining ? 'continue' : category === 'revisit' ? 'revisit' : kind === 'creative' ? 'creative' : kind === 'review' ? 'board' : 'work', related, space: options.spaces?.get(note.key), metadata: m, plannedAt } satisfies SpinCandidate];
    });
  });
}

export function selectSpin<T extends SpinOption>(candidates: T[], previous?: string, random: () => number = Math.random): T | null {
  const different = candidates.filter(c => spinOptionKey(c) !== previous);
  const pool = different.length ? different : candidates;
  if (!pool.length) return null;
  // One source with several category memberships must not gain extra lottery tickets.
  const counts = new Map<string, number>();
  for (const c of pool) counts.set(spinOptionKey(c), (counts.get(spinOptionKey(c)) ?? 0) + 1);
  const weights = pool.map(c => c.weight / counts.get(spinOptionKey(c))!);
  let target = Math.min(1 - Number.EPSILON, Math.max(0, random())) * weights.reduce((a,b) => a+b,0);
  for (let i = 0; i < pool.length; i++) { target -= weights[i]; if (target < 0) return pool[i]; }
  return pool[pool.length - 1];
}

export function spinLanding(current: number, index: number, count: number) {
  const target = ((360 - index * 360 / count) % 360 + 360) % 360;
  return current + 5 * 360 + ((target - current % 360 + 360) % 360);
}

export function spinSourceRoute(key: NoteKey) {
  return key.startsWith('card:') ? { pathname: '/card/[id]' as const, params: { id: key.slice(5) } } : { pathname: '/chat' as const, params: { messageId: key.slice(8) } };
}
