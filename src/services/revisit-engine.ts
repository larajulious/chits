export type NoteKey = `thought:${string}` | `card:${string}`;
export type RevisitNote = {
  key: NoteKey; title: string; text: string; createdAt: number; updatedAt: number;
  editedAt: number; progressAt: number; openedAt: number | null; revisitedAt: number | null;
  snoozedUntil: number | null; dismissedAt: number | null; dismissalCount: number;
  excluded: boolean; pinned: boolean; boardId: string | null; reminderAt: number | null;
  total: number; completed: number;
  boardName?: string | null; boardAccent?: string | null;
};
export type RevisitConfig = typeof REVISIT_DEFAULTS;
export const REVISIT_DEFAULTS = {
  inactivityDays: 14, progressDays: 14, reviewCooldownDays: 14,
  dismissalCooldownDays: 90, limit: 3, confidenceThreshold: 0.58,
  weights: { inactivity: 0.25, unfinished: 8, pinned: 5, overdueReminder: 3, dismissal: 12, similarity: 0.65, title: 0.35, board: 0.04 },
  maxTextLength: 12_000, maxTerms: 512, maxPosting: 120, candidateTerms: 16, candidatesPerNote: 80,
};
export const DAY = 86_400_000;
export type ReviewSuggestion = { note: RevisitNote; kind: 'worth' | 'progress'; score: number; reason: string };
export type ConnectionSuggestion = { a: RevisitNote; b: RevisitNote; confidence: number; terms: string[] };

export function canonicalPair(a: string, b: string): [string, string] {
  if (a === b) throw new Error('Choose two different notes.');
  return a < b ? [a, b] : [b, a];
}
export function pairKey(a: string, b: string) { return JSON.stringify(canonicalPair(a, b)); }

export function reviewSuggestion(note: RevisitNote, now: number, config: RevisitConfig = REVISIT_DEFAULTS): ReviewSuggestion | null {
  if (note.excluded || (note.snoozedUntil ?? 0) > now || (note.reminderAt ?? 0) > now) return null;
  if (note.dismissedAt !== null && now - note.dismissedAt < config.dismissalCooldownDays * DAY * Math.max(1, note.dismissalCount)) return null;
  if (Math.max(note.openedAt ?? 0, note.revisitedAt ?? 0) > now - config.reviewCooldownDays * DAY) return null;
  const remaining = note.total - note.completed;
  // Finished checklists do not become forgotten-task suggestions.
  if (note.total > 0 && remaining === 0) return null;
  const kind = remaining > 0 ? 'progress' : 'worth';
  const inactiveDays = Math.floor((now - Math.max(note.editedAt, kind === 'progress' ? note.progressAt : 0)) / DAY);
  if (inactiveDays < (kind === 'progress' ? config.progressDays : config.inactivityDays)) return null;
  // Mere age isn't evidence of usefulness. Require real words, a pin or work.
  if (remaining === 0 && !note.pinned && keywords(note.text).length < 4) return null;
  const w = config.weights;
  const score = Math.min(inactiveDays, 180) * w.inactivity + (remaining > 0 ? w.unfinished : 0) + (note.pinned ? w.pinned : 0) + (note.reminderAt ? w.overdueReminder : 0) - note.dismissalCount * w.dismissal;
  if (score <= 0) return null;
  const reason = kind === 'progress'
    ? `${note.completed} of ${note.total} completed · No checklist or content changes for ${inactiveDays} days.`
    : `${note.pinned ? 'Pinned · ' : ''}No content changes for ${inactiveDays} days${note.reminderAt ? ' · Reminder overdue' : ''}.`;
  return { note, kind, score, reason };
}

const stopwords = new Set(('a an the and or but if to of in on for from by with without is are was were be been being it its this that these those i me my mine we our you your they their he she as at not no yes do does did have has had can could should would will may might than then there here how what which who when where why all any some also just very more most new old latest update updates updated note notes important todo task tasks list checklist plan plans idea ideas thought thoughts please about into out over under through before after so such use using used make made really get got un una el la los las de del y en le les des et du au und der die das').split(' '));

export function keywords(text: string, config: RevisitConfig = REVISIT_DEFAULTS): string[] {
  const normalized = text.slice(0, config.maxTextLength).normalize('NFKC').toLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = new Set<string>();
  for (const word of words) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(word)) {
      const letters = [...word];
      for (let i = 0; i < letters.length - 1 && tokens.size < config.maxTerms; i++) tokens.add(letters[i] + letters[i + 1]);
    } else if (word.length >= 3 && !/^\d+$/.test(word) && !stopwords.has(word)) tokens.add(word);
    if (tokens.size >= config.maxTerms) break;
  }
  return [...tokens];
}

export type IndexedNote = { note: RevisitNote; terms: Set<string>; titleTerms: Set<string> };
export function indexNote(note: RevisitNote, config = REVISIT_DEFAULTS): IndexedNote {
  return { note, terms: new Set(keywords(`${note.title}\n${note.text}`, config)), titleTerms: new Set(keywords(note.title, config)) };
}

export function connectionScore(a: IndexedNote, b: IndexedNote, frequencies: Map<string, number>, count: number, config = REVISIT_DEFAULTS) {
  const distinctive = (term: string) => (frequencies.get(term) ?? 1) <= Math.max(3, Math.min(config.maxPosting, count * 0.4));
  const shared = [...a.terms].filter((term) => b.terms.has(term) && distinctive(term));
  const titleShared = shared.filter((term) => a.titleTerms.has(term) && b.titleTerms.has(term));
  if (shared.length < 3 && titleShared.length < 2) return null;
  const weight = (term: string) => Math.log(1 + count / (frequencies.get(term) ?? 1));
  const sum = (terms: Set<string>) => [...terms].reduce((n, term) => n + weight(term), 0);
  const overlap = shared.reduce((n, term) => n + weight(term), 0);
  const cosine = overlap / Math.sqrt(Math.max(1, sum(a.terms) * sum(b.terms)));
  const title = titleShared.length / Math.max(1, Math.max(a.titleTerms.size, b.titleTerms.size));
  const w = config.weights;
  const confidence = Math.min(1, cosine * w.similarity + title * w.title + (a.note.boardId && a.note.boardId === b.note.boardId ? w.board : 0));
  if (confidence < config.confidenceThreshold) return null;
  return { a: a.note, b: b.note, confidence, terms: shared.sort((x, y) => Number(titleShared.includes(y)) - Number(titleShared.includes(x)) || weight(y) - weight(x) || x.localeCompare(y)).slice(0, 5) };
}

// Inverted retrieval first, scoring second. Common postings are discarded;
// candidate work is bounded per note rather than an all-pairs comparison.
export function* discoverConnections(indexed: IndexedNote[], blocked: Set<string>, config = REVISIT_DEFAULTS, focusKey?: NoteKey): Generator<ConnectionSuggestion[]> {
  const postings = new Map<string, number[]>();
  const frequencies = new Map<string, number>();
  for (let i = 0; i < indexed.length; i++) {
    for (const term of indexed[i].terms) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    const ids = postings.get(term) ?? [];
    if (ids.length <= config.maxPosting) ids.push(i);
    postings.set(term, ids);
    }
    if (i % 100 === 0) yield [];
  }
  let best: ConnectionSuggestion[] = [];
  for (let i = 0; i < indexed.length; i++) {
    if (focusKey && indexed[i].note.key !== focusKey) continue;
    const terms = [...indexed[i].terms].filter((term) => (postings.get(term)?.length ?? 0) >= 2 && (postings.get(term)?.length ?? 0) <= config.maxPosting)
      .sort((a, b) => frequencies.get(a)! - frequencies.get(b)! || a.localeCompare(b)).slice(0, config.candidateTerms);
    const counts = new Map<number, number>();
    for (const term of terms) for (const j of postings.get(term) ?? []) if (focusKey ? j !== i : j > i) counts.set(j, (counts.get(j) ?? 0) + 1);
    const candidates = [...counts].filter(([, hits]) => hits >= 2).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, config.candidatesPerNote);
    for (const [j] of candidates) {
      if (blocked.has(pairKey(indexed[i].note.key, indexed[j].note.key))) continue;
      const result = connectionScore(indexed[i], indexed[j], frequencies, indexed.length, config);
      if (result) best.push(result);
    }
    best.sort((a, b) => b.confidence - a.confidence || a.a.key.localeCompare(b.a.key) || a.b.key.localeCompare(b.b.key));
    best = best.slice(0, config.limit);
    if (i % 25 === 0) yield best;
  }
  yield best;
}
