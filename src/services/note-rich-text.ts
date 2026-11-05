import type { NoteCursor, NoteDraftBlock, NoteText } from './note-content.ts';

export const NOTE_TEXT_COLORS = {
  default: null, gray: '#858078', white: '#FFFFFF', red: '#C1444C', orange: '#B96730',
  yellow: '#A47B17', green: '#36785B', cyan: '#257D8A', blue: '#3D6D9B', purple: '#844B98', rose: '#A45E6E',
} as const;
export const NOTE_HIGHLIGHTS = {
  none: null, pink: '#F7DCE5', orange: '#FAE2C8', yellow: '#FFF0AD', green: '#DAECCD', cyan: '#D6EEF0', purple: '#E9DFF5',
} as const;
export type NoteMarks = { bold?: boolean; italic?: boolean; underline?: boolean; color?: keyof typeof NOTE_TEXT_COLORS; highlight?: keyof typeof NOTE_HIGHLIGHTS };
export type NoteSpan = { start: number; end: number; marks: NoteMarks };
export type NoteFormat = { marks: NoteMarks; heading: 0 | 1 | 2; list: 'bullet' | 'numbered' | 'checklist' | null };

export function cleanMarks(value: unknown): NoteMarks {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>, marks: NoteMarks = {};
  for (const key of ['bold', 'italic', 'underline'] as const) if (source[key] === true) marks[key] = true;
  if (typeof source.color === 'string' && source.color !== 'default' && Object.hasOwn(NOTE_TEXT_COLORS, source.color)) marks.color = source.color as NoteMarks['color'];
  if (typeof source.highlight === 'string' && source.highlight !== 'none' && Object.hasOwn(NOTE_HIGHLIGHTS, source.highlight)) marks.highlight = source.highlight as NoteMarks['highlight'];
  return marks;
}
const same = (a: NoteMarks, b: NoteMarks) => JSON.stringify(cleanMarks(a)) === JSON.stringify(cleanMarks(b));

/** Sorted, disjoint UTF-16 ranges, matching the offsets used by native inputs. */
export function normalizeSpans(value: unknown, length: number): NoteSpan[] {
  if (!Array.isArray(value)) return [];
  const spans: NoteSpan[] = [];
  for (const item of value) {
    if (!item || !Number.isInteger(item.start) || !Number.isInteger(item.end)) continue;
    const start = Math.max(spans.at(-1)?.end ?? 0, Math.min(length, item.start));
    const end = Math.max(start, Math.min(length, item.end));
    const marks = cleanMarks(item.marks);
    if (end <= start || !Object.keys(marks).length) continue;
    const previous = spans.at(-1);
    if (previous && previous.end === start && same(previous.marks, marks)) previous.end = end;
    else spans.push({ start, end, marks });
  }
  return spans;
}

export function readRichText(value: Record<string, unknown>, length: number): Partial<NoteText> {
  const spans = normalizeSpans(value.spans, length);
  return {
    ...(value.paragraph === true ? { paragraph: true } : {}),
    ...(value.heading === 1 || value.heading === 2 ? { heading: value.heading } : {}),
    ...(typeof value.title === 'string' && value.title ? { title: value.title.slice(0, 200) } : {}),
    ...(spans.length ? { spans } : {}),
  };
}
export function hasTextFormatting(block: { heading?: number; spans?: NoteSpan[]; title?: string; paragraph?: boolean }) {
  return Boolean(block.paragraph || block.heading || block.spans?.length || block.title);
}
export function noteTitle(blocks: { type: string; title?: string }[]) { return blocks.find(block => block.type === 'text' && block.title)?.title ?? ''; }
export function withNoteTitle(blocks: NoteDraftBlock[], title: string): NoteDraftBlock[] {
  if (!title && !blocks.some(block => block.type === 'text' && block.title)) return blocks;
  let assigned = false;
  return blocks.map(block => {
    if (block.type !== 'text') return block;
    const first = !assigned; assigned = true;
    const wanted = first && title ? title.slice(0, 200) : undefined;
    if (block.title === wanted) return block;
    const { title: _title, ...rest } = block;
    return wanted ? { ...rest, title: wanted } : rest;
  });
}

export function sliceNoteText<T extends NoteText>(block: T, start: number, end = block.text.length): T {
  const spans = (block.spans ?? []).flatMap(span => {
    const from = Math.max(start, span.start), to = Math.min(end, span.end);
    return to > from ? [{ start: from - start, end: to - start, marks: span.marks }] : [];
  });
  const { spans: _spans, title, ...rest } = block;
  return { ...rest, text: block.text.slice(start, end), ...(spans.length ? { spans } : {}), ...(!start && title ? { title } : {}) } as T;
}
export function joinNoteText<T extends NoteText>(first: T, second: NoteText, separator = ''): T {
  const offset = first.text.length + separator.length;
  const spans = normalizeSpans([...(first.spans ?? []), ...(second.spans ?? []).map(span => ({ ...span, start: span.start + offset, end: span.end + offset }))], offset + second.text.length);
  const { spans: _spans, title: _title, ...rest } = first;
  const title = first.title || second.title;
  return { ...rest, text: first.text + separator + second.text, ...(spans.length ? { spans } : {}), ...(title ? { title } : {}) } as T;
}
export function marksAt(block: NoteText, start: number, end = start): NoteMarks {
  if (start === end) return block.spans?.find(span => start > span.start && start <= span.end)?.marks ?? {};
  const spans = (block.spans ?? []).filter(span => span.end > start && span.start < end);
  let position = start;
  const common = { ...spans[0]?.marks };
  for (const span of spans) {
    if (span.start > position) return {};
    for (const key of Object.keys(common) as (keyof NoteMarks)[]) if (common[key] !== span.marks[key]) delete common[key];
    position = span.end;
  }
  return position >= end ? common : {};
}
export function formatRange(block: NoteText, start: number, end: number, patch: NoteMarks): NoteText {
  start = Math.max(0, Math.min(block.text.length, start)); end = Math.max(start, Math.min(block.text.length, end));
  const points = [...new Set([0, start, end, block.text.length, ...(block.spans ?? []).flatMap(span => [span.start, span.end])])].sort((a, b) => a - b);
  const spans: NoteSpan[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i], to = points[i + 1];
    const marks = cleanMarks({ ...marksAt(block, from, to), ...(from >= start && to <= end ? patch : {}) });
    if (to > from && Object.keys(marks).length) spans.push({ start: from, end: to, marks });
  }
  const normalized = normalizeSpans(spans, block.text.length);
  return { ...block, spans: normalized.length ? normalized : undefined };
}

/** A native edit replaces one range. Preserve the surrounding runs on paste,
 * deletion, emoji edits and IME commits; new characters inherit cursor marks. */
export function replaceNoteText<T extends NoteText>(block: T, text: string, pending?: NoteMarks, selection?: { start: number; end: number }): T {
  let start = 0, suffix = 0;
  while (start < block.text.length && start < text.length && block.text[start] === text[start]) start++;
  // Prefer the native selection for ambiguous repeated characters/newlines.
  if (selection && selection.start <= start && text.slice(0, selection.start) === block.text.slice(0, selection.start)) start = selection.start;
  while (suffix < block.text.length - start && suffix < text.length - start && block.text.at(-1 - suffix) === text.at(-1 - suffix)) suffix++;
  const oldEnd = block.text.length - suffix, newEnd = text.length - suffix;
  const before = sliceNoteText(block, 0, start), after = sliceNoteText(block, oldEnd);
  const inserted: NoteText = { type: 'text', text: text.slice(start, newEnd) };
  const marks = pending ?? (selection && selection.end > selection.start ? marksAt(block, selection.start, selection.end) : marksAt(block, start));
  if (inserted.text && Object.keys(cleanMarks(marks)).length) inserted.spans = [{ start: 0, end: inserted.text.length, marks: cleanMarks(marks) }];
  return joinNoteText(joinNoteText(before, inserted), after);
}

let paragraphKey = 0;
/** Split only the selected paragraphs, keeping the active native input key. */
export function setNoteHeading(blocks: NoteDraftBlock[], cursor: NoteCursor, heading: 0 | 1 | 2) {
  const index = cursor ? blocks.findIndex(block => block.key === cursor.key) : blocks.findLastIndex(block => block.type === 'text');
  const block = blocks[index];
  if (block?.type !== 'text') return { blocks, cursor };
  const start = Math.min(cursor?.start ?? 0, block.text.length), end = Math.min(cursor?.end ?? start, block.text.length);
  const from = start ? block.text.lastIndexOf('\n', start - 1) + 1 : 0;
  const last = end > start && block.text[end - 1] === '\n' ? end - 1 : end;
  const boundary = block.text.indexOf('\n', last), to = boundary < 0 ? block.text.length : boundary;
  const pieces: NoteDraftBlock[] = [];
  const key = () => `${block.key}-p${++paragraphKey}`;
  if (from) pieces.push({ ...sliceNoteText(block, 0, from - 1), key: key(), paragraph: true });
  let offset = from;
  const lines = block.text.slice(from, to).split('\n');
  lines.forEach((line, index) => {
    pieces.push({ ...sliceNoteText(block, offset, offset + line.length), key: index ? key() : block.key, heading: heading || undefined, paragraph: true });
    offset += line.length + 1;
  });
  if (to < block.text.length) pieces.push({ ...sliceNoteText(block, to + 1), key: key(), paragraph: true });
  return { blocks: withNoteTitle([...blocks.slice(0, index), ...pieces, ...blocks.slice(index + 1)], noteTitle(blocks)), cursor: { key: block.key, start: start - from, end: Math.min(end - from, lines[0].length) } };
}

export function splitNoteHeading(blocks: NoteDraftBlock[], updated: Extract<NoteDraftBlock, { type: 'text' }>, selection?: { start: number; end: number }) {
  const index = blocks.findIndex(block => block.key === updated.key);
  const old = blocks[index];
  const caret = Math.max(0, Math.min(updated.text.length, updated.text.length - (old?.type === 'text' ? old.text.length : 0) + (selection?.end ?? 0)));
  let offset = 0;
  const items = updated.text.split('\n').map((line, i) => {
    const item = { ...sliceNoteText(updated, offset, offset + line.length), key: i ? `${updated.key}-p${++paragraphKey}` : updated.key, heading: i ? undefined : updated.heading, paragraph: true as const };
    offset += line.length + 1;
    return item;
  });
  const before = updated.text.slice(0, caret).split('\n'), target = items[before.length - 1];
  return { blocks: withNoteTitle([...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], noteTitle(blocks)), cursor: { key: target.key, start: before.at(-1)!.length, end: before.at(-1)!.length } };
}

export type NoteParagraphContinuation = { sourceKey: string; targetKey: string; prefix: string; nativeValue: string; caret: number };

/** Native can queue characters on the heading input before focus crosses an
 * Enter boundary. Reconcile that buffer into the existing new paragraph. */
export function continueNoteParagraph(blocks: NoteDraftBlock[], key: string, value: string, continuation: NoteParagraphContinuation | null, marks?: NoteMarks) {
  if (!continuation || continuation.sourceKey !== key || !value.startsWith(continuation.prefix)) return null;
  const source = blocks.find(block => block.key === key), target = blocks.find(block => block.key === continuation.targetKey);
  if (source?.type !== 'text' || source.text !== continuation.prefix.slice(0, -1) || target?.type !== 'text') return null;
  const text = value.slice(continuation.prefix.length);
  const caret = Math.max(0, Math.min(text.length, continuation.caret + value.length - continuation.nativeValue.length));
  const updated = replaceNoteText(target, text, marks, { start: continuation.caret, end: continuation.caret });
  return {
    blocks: blocks.map(block => block.key === target.key ? updated : block),
    cursor: { key: target.key, start: caret, end: caret },
    continuation: { ...continuation, nativeValue: value, caret },
  };
}
