import { newBlockKey, type NoteCursor, type NoteDraftBlock, type NoteList } from './note-content.ts';

type TextBlock = Extract<NoteDraftBlock, { type: 'text' }>;
export type NoteEdit = { blocks: NoteDraftBlock[]; cursor: NoteCursor };

/** Normalize plain runs after a structural edit, translating the cursor as runs merge. */
function normalize(blocks: NoteDraftBlock[], cursor: NoteCursor): NoteEdit {
  const result: NoteDraftBlock[] = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    if (block.type === 'text' && !block.list && previous?.type === 'text' && !previous.list) {
      // Keep the focused input mounted, even when it absorbs an earlier run.
      const key = cursor?.key === block.key ? block.key : previous.key;
      if (cursor?.key === block.key) cursor = { key, start: previous.text.length + cursor.start, end: previous.text.length + cursor.end };
      result[result.length - 1] = { ...previous, key, text: previous.text + block.text };
    } else result.push(block);
  }
  return { blocks: result, cursor };
}

/** Run only after explicit boundary deletion or Enter exiting an empty item.
 * Never strip an intentional empty task, authored spaces, media, or composition.
 */
function normalizeClearedDocument(edit: NoteEdit, focusedKey: string): NoteEdit {
  if (!edit.blocks.length || edit.blocks.some((block) => block.type !== 'text' || block.list || /[^\r\n]/.test(block.text))) return edit;
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
  if (block.list) return normalizeClearedDocument(toggleNoteList(blocks, cursor, block.list.kind), block.key);
  const previous = blocks[index - 1];
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
  const remainder: TextBlock[] = newline < 0 ? [] : [{ key: newBlockKey(), type: 'text', text: block.text.slice(newline + 1) }];
  return normalizeClearedDocument(normalize([
    ...blocks.slice(0, index - 1),
    { ...previous, key: block.key, text: prefix + (newline < 0 ? block.text : block.text.slice(0, newline)) },
    ...remainder,
    ...blocks.slice(index + 1),
  ], { key: block.key, start: prefix.length, end: prefix.length }), block.key);
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
    const start = previous?.type === 'text' && !previous.list ? 1 : 0;
    const text = `${start ? '\n' : ''}${block.text}${next?.type === 'text' && !next.list ? '\n' : ''}`;
    return normalize(blocks.map((item) => item.key === block.key ? { ...block, text, list: undefined } : item), { key: block.key, start: start + (cursor?.start ?? 0), end: start + (cursor?.end ?? 0) });
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
  if (from) items.push({ ...block, key: newBlockKey(), text: block.text.slice(0, from - 1) });
  const lines = block.text.slice(from, to).split('\n');
  lines.forEach((text, line) => items.push({ key: !line ? block.key : newBlockKey(), type: 'text', text, list }));
  if (to < block.text.length) items.push({ key: newBlockKey(), type: 'text', text: block.text.slice(to + 1) });
  const target = items[from ? 1 : 0];
  return { blocks: [...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], cursor: { key: target.key, start: start - from, end: Math.min(end - from, (target as TextBlock).text.length) } };
}

/** Enter and multiline paste create structural items; no markers enter the input value. */
export function editNoteListItem(blocks: NoteDraftBlock[], key: string, value: string, selection?: NoteCursor): NoteEdit {
  const index = blocks.findIndex((block) => block.key === key);
  const block = blocks[index] as TextBlock;
  if (!block?.list || !value.includes('\n')) return { blocks: blocks.map((item) => item.key === key && item.type === 'text' ? { ...item, text: value } : item), cursor: null };
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
    const after: TextBlock = { key: newBlockKey(), type: 'text', text: value.slice(newline + 1) + (next?.type === 'text' && !next.list ? '\n' : '') };
    return normalize([...blocks.slice(0, index), { ...block, text: value.slice(0, newline) }, after, ...blocks.slice(index + 1)], { key: after.key, start: Math.max(0, caret - newline - 1), end: Math.max(0, caret - newline - 1) });
  }
  const items = lines.map((text, line): TextBlock => ({ ...block, key: line ? newBlockKey() : key, text, list: line ? listOf(block.list!.kind, block.list!.id) : block.list }));
  const target = items[beforeCaret.length - 1];
  return { blocks: [...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], cursor: { key: target.key, start: beforeCaret.at(-1)!.length, end: beforeCaret.at(-1)!.length } };
}

/** Completion changes never reorder content or rewrite the item's words. */
export function toggleNoteChecklist(blocks: NoteDraftBlock[], key: string): NoteDraftBlock[] {
  return blocks.map((block) => block.key === key && block.type === 'text' && block.list?.kind === 'checklist'
    ? { ...block, list: { ...block.list, checked: !block.list.checked } } : block);
}
