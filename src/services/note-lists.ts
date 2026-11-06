import { sliceNoteText, joinNoteText, hasTextFormatting, replaceNoteText, noteTitle, withNoteTitle } from './note-rich-text.ts';
import { newBlockKey, type NoteCursor, type NoteDraftBlock, type NoteList } from './note-content.ts';

type TextBlock = Extract<NoteDraftBlock, { type: 'text' }>;
export type NoteEdit = { blocks: NoteDraftBlock[]; cursor: NoteCursor };

/** Normalize plain runs after a structural edit, translating the cursor as runs merge. */
function normalize(blocks: NoteDraftBlock[], cursor: NoteCursor): NoteEdit {
  const result: NoteDraftBlock[] = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    if (block.type === 'text' && !block.list && previous?.type === 'text' && !previous.list && !block.heading && !previous.heading && !block.paragraph && !previous.paragraph) {
      // Keep the focused input mounted, even when it absorbs an earlier run.
      const key = cursor?.key === block.key ? block.key : previous.key;
      if (cursor?.key === block.key) cursor = { key, start: previous.text.length + cursor.start, end: previous.text.length + cursor.end };
      result[result.length - 1] = { ...joinNoteText(previous, block), key };
    } else result.push(block);
  }
  return { blocks: withNoteTitle(result, noteTitle(blocks)), cursor };
}

/** Run only after explicit boundary deletion or Enter exiting an empty item.
 * Never strip an intentional empty task, authored spaces, media, or composition.
 */
function normalizeClearedDocument(edit: NoteEdit, focusedKey: string): NoteEdit {
  if (!edit.blocks.length || edit.blocks.some((block) => block.type !== 'text' || block.list || hasTextFormatting(block) || /[^\r\n]/.test(block.text))) return edit;
  const active = edit.blocks.find((block) => block.key === focusedKey);
  if (active?.type !== 'text') return edit;
  if (edit.blocks.length === 1 && active.text === '') return edit;
  return { blocks: [{ ...active, text: '' }], cursor: { key: active.key, start: 0, end: 0 } };
}

/** Only structural boundary deletion belongs here. Native inputs own character,
 * selection and grapheme deletion (UTF-16 offsets match RN, UIKit and Android).
 */
export function backspaceNoteBlock(blocks: NoteDraftBlock[], cursor: NoteCursor): NoteEdit {
  if (!cursor || cursor.start !== 0 || cursor.end !== 0) return { blocks, cursor: null };
  const index = blocks.findIndex((block) => block.key === cursor.key);
  const block = blocks[index];
  if (block?.type !== 'text') return { blocks, cursor: null };
  const previous = blocks[index - 1];
  // An empty item inside a list has nothing to keep: it goes in one press and
  // joins the item above. Words, and an empty first item, unformat first.
  const emptyContinuation = block.list && !block.text && previous?.type === 'text' && previous.list?.id === block.list.id;
  if (block.list && !emptyContinuation) return normalizeClearedDocument(toggleNoteList(blocks, cursor, block.list.kind), block.key);
  if (block.heading) return { blocks: blocks.map(item => item.key === block.key ? { ...block, heading: undefined } : item), cursor };
  if (!previous) return normalizeClearedDocument({ blocks, cursor: null }, block.key);
  if (previous.type === 'image') {
    // A text key must never silently delete an attachment. Cross the image to
    // its preceding text slot; image deletion stays an explicit photo action.
    const beforeImage = blocks[index - 2];
    return { blocks, cursor: beforeImage?.type === 'text' ? { key: beforeImage.key, start: beforeImage.text.length, end: beforeImage.text.length } : null };
  }
  // The block boundary itself is the separator being deleted. Any newline
  // inside a run is authored content and must survive this structural merge.
  const prefix = previous.text;
  const newline = previous.list ? block.text.indexOf('\n') : -1;
  const remainder: TextBlock[] = newline < 0 ? [] : [{ ...sliceNoteText(block, newline + 1), key: newBlockKey(), list: undefined, heading: undefined }];
  return normalizeClearedDocument(normalize([
    ...blocks.slice(0, index - 1),
    { ...joinNoteText(previous, sliceNoteText(block, 0, newline < 0 ? block.text.length : newline)), key: block.key },
    ...remainder,
    ...blocks.slice(index + 1),
  ], { key: block.key, start: prefix.length, end: prefix.length }), block.key);
}

/** The smallest scroll that shows a row, or null when it is already in view.
 * Rows taller than the viewport show their start.
 */
export function noteRevealOffset({ top, height, offset, viewport, margin }: { top: number; height: number; offset: number; viewport: number; margin: number }) {
  if (viewport <= 0) return null;
  if (top - margin < offset) return Math.max(0, top - margin);
  const bottom = top + Math.min(height, viewport - margin * 2) + margin;
  return bottom > offset + viewport ? bottom - viewport : null;
}

function listOf(kind: NoteList['kind'], id: string): NoteList {
  return kind === 'checklist' ? { kind, id, checked: false } : { kind, id };
}

export function toggleNoteList(blocks: NoteDraftBlock[], cursor: NoteCursor, kind: NoteList['kind']): NoteEdit {
  const index = cursor ? blocks.findIndex((block) => block.key === cursor.key && block.type === 'text') : blocks.findLastIndex((block) => block.type === 'text');
  const block = blocks[index] as TextBlock | undefined;
  if (!block) return { blocks, cursor };
  if (block.list) {
    if (block.list.kind !== kind && (kind === 'checklist' || block.list.kind === 'checklist')) {
      return { blocks: blocks.map((item) => item.key === block.key ? { ...block, list: listOf(kind, newBlockKey()) } : item), cursor };
    }
    if (block.list.kind !== kind) {
      // Switch the complete logical list, including items separated by images.
      return { blocks: blocks.map((item) => item.type === 'text' && item.list?.id === block.list?.id && item.list?.kind === block.list?.kind ? { ...item, list: listOf(kind, block.list!.id) } : item), cursor };
    }
    const previous = blocks[index - 1], next = blocks[index + 1];
    // Adjacent blocks have one implicit paragraph boundary. Materialize it only
    // when plain runs coalesce, even if either run contains authored blank lines.
    const start = previous?.type === 'text' && !previous.list && !previous.paragraph && !block.paragraph ? 1 : 0;
    const text = `${start ? '\n' : ''}${block.text}${next?.type === 'text' && !next.list && !next.paragraph && !block.paragraph ? '\n' : ''}`;
    const unlisted: TextBlock = { ...block, text, list: undefined, ...(block.spans ? { spans: block.spans.map(span => ({ ...span, start: span.start + start, end: span.end + start })) } : {}) };
    return normalize(blocks.map((item) => item.key === block.key ? unlisted : item), { key: block.key, start: start + (cursor?.start ?? 0), end: start + (cursor?.end ?? 0) });
  }
  const start = Math.max(0, Math.min(cursor?.start ?? block.text.length, block.text.length));
  const end = Math.max(start, Math.min(cursor?.end ?? start, block.text.length));
  const from = start === 0 ? 0 : block.text.lastIndexOf('\n', start - 1) + 1;
  const last = end > start && block.text[end - 1] === '\n' ? end - 1 : end;
  const boundary = block.text.indexOf('\n', last);
  const to = boundary < 0 ? block.text.length : boundary;
  const adjacent = blocks[index - 1];
  const list = listOf(kind, adjacent?.type === 'text' && adjacent.list?.kind === kind && from === 0 ? adjacent.list.id : newBlockKey());
  const items: NoteDraftBlock[] = [];
  // Consume exactly the delimiter represented by each new block boundary.
  // Leaving it in the input creates an extra visible line above/below the item.
  if (from) items.push({ ...sliceNoteText(block, 0, from - 1), key: newBlockKey() });
  const lines = block.text.slice(from, to).split('\n');
  let offset = from;
  lines.forEach((text, line) => { items.push({ ...sliceNoteText(block, offset, offset + text.length), key: !line ? block.key : newBlockKey(), list }); offset += text.length + 1; });
  if (to < block.text.length) items.push({ ...sliceNoteText(block, to + 1), key: newBlockKey() });
  const target = items[from ? 1 : 0];
  return { blocks: withNoteTitle([...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], noteTitle(blocks)), cursor: { key: target.key, start: start - from, end: Math.min(end - from, (target as TextBlock).text.length) } };
}

/** Enter and multiline paste create structural items; no markers enter the input value. */
export function editNoteListItem(blocks: NoteDraftBlock[], key: string, value: string, selection?: NoteCursor, replacement?: TextBlock): NoteEdit {
  const index = blocks.findIndex((block) => block.key === key);
  const block = blocks[index] as TextBlock;
  const updated = replacement ?? replaceNoteText(block, value, undefined, selection?.key === key ? selection : undefined);
  if (!block?.list || !value.includes('\n')) return { blocks: blocks.map((item) => item.key === key && item.type === 'text' ? updated : item), cursor: null };
  if (!block.text.trim() && value === '\n') {
    return normalizeClearedDocument(toggleNoteList(blocks, { key, start: 0, end: 0 }, block.list.kind), key);
  }
  let prefix = 0, suffix = 0;
  while (prefix < block.text.length && prefix < value.length && block.text[prefix] === value[prefix]) prefix++;
  while (suffix < block.text.length - prefix && suffix < value.length - prefix && block.text[block.text.length - suffix - 1] === value[value.length - suffix - 1]) suffix++;
  const caret = selection?.key === key && selection.end <= block.text.length
    ? Math.max(0, Math.min(value.length, value.length - block.text.length + selection.end))
    : value.length - suffix;
  const beforeCaret = value.slice(0, caret).split('\n');
  const lines = value.split('\n');
  // Enter continues a checklist. Pasted paragraphs keep their own plain text,
  // rather than silently becoming tasks (the original item's state survives).
  const inserted = value.slice(prefix, value.length - suffix);
  if (block.list.kind === 'checklist' && inserted !== '\n') {
    const newline = value.indexOf('\n');
    const next = blocks[index + 1];
    const after: TextBlock = { ...sliceNoteText(updated, newline + 1), key: newBlockKey(), list: undefined, text: value.slice(newline + 1) + (next?.type === 'text' && !next.list && !next.paragraph && !block.paragraph ? '\n' : '') };
    return normalize([...blocks.slice(0, index), sliceNoteText(updated, 0, newline), after, ...blocks.slice(index + 1)], { key: after.key, start: Math.max(0, caret - newline - 1), end: Math.max(0, caret - newline - 1) });
  }
  let offset = 0;
  const items = lines.map((text, line): TextBlock => { const item: TextBlock = { ...sliceNoteText(updated, offset, offset + text.length), key: line ? newBlockKey() : key, list: line ? listOf(block.list!.kind, block.list!.id) : block.list }; offset += text.length + 1; return item; });
  const target = items[beforeCaret.length - 1];
  return { blocks: withNoteTitle([...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], noteTitle(blocks)), cursor: { key: target.key, start: beforeCaret.at(-1)!.length, end: beforeCaret.at(-1)!.length } };
}

/** Completion changes never reorder content or rewrite the item's words. */
export function toggleNoteChecklist(blocks: NoteDraftBlock[], key: string): NoteDraftBlock[] {
  return blocks.map((block) => block.key === key && block.type === 'text' && block.list?.kind === 'checklist'
    ? { ...block, list: { ...block.list, checked: !block.list.checked } } : block);
}
