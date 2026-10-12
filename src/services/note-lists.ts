import { newBlockKey, type NoteCursor, type NoteDraftBlock, type NoteList } from './note-content.ts';

type TextBlock = Extract<NoteDraftBlock, { type: 'text' }>;
export type NoteEdit = { blocks: NoteDraftBlock[]; cursor: NoteCursor };

/** Normalize plain runs after a structural edit, translating the cursor as runs merge. */
function normalize(blocks: NoteDraftBlock[], cursor: NoteCursor): NoteEdit {
  const result: NoteDraftBlock[] = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    if (block.type === 'text' && !block.list && previous?.type === 'text' && !previous.list) {
      if (cursor?.key === block.key) cursor = { key: previous.key, start: previous.text.length + cursor.start, end: previous.text.length + cursor.end };
      result[result.length - 1] = { ...previous, text: previous.text + block.text };
    } else result.push(block);
  }
  return { blocks: result, cursor };
}

export function toggleNoteList(blocks: NoteDraftBlock[], cursor: NoteCursor, kind: NoteList['kind']): NoteEdit {
  const index = cursor ? blocks.findIndex((block) => block.key === cursor.key && block.type === 'text') : blocks.findLastIndex((block) => block.type === 'text');
  const block = blocks[index] as TextBlock | undefined;
  if (!block) return { blocks, cursor };
  if (block.list) {
    if (block.list.kind !== kind) {
      // Switch the complete logical list, including items separated by images.
      return { blocks: blocks.map((item) => item.type === 'text' && item.list?.id === block.list?.id ? { ...item, list: { id: block.list!.id, kind } } : item), cursor };
    }
    const previous = blocks[index - 1], next = blocks[index + 1];
    const text = `${previous?.type === 'text' && !previous.list && !previous.text.endsWith('\n') ? '\n' : ''}${block.text}${next?.type === 'text' && !next.list && !next.text.startsWith('\n') ? '\n' : ''}`;
    const start = text.startsWith('\n') && !block.text.startsWith('\n') ? 1 : 0;
    return normalize(blocks.map((item) => item.key === block.key ? { ...block, text, list: undefined } : item), { key: block.key, start: start + (cursor?.start ?? 0), end: start + (cursor?.end ?? 0) });
  }
  const start = Math.max(0, Math.min(cursor?.start ?? block.text.length, block.text.length));
  const end = Math.max(start, Math.min(cursor?.end ?? start, block.text.length));
  const from = start === 0 ? 0 : block.text.lastIndexOf('\n', start - 1) + 1;
  const last = end > start && block.text[end - 1] === '\n' ? end - 1 : end;
  const boundary = block.text.indexOf('\n', last);
  const to = boundary < 0 ? block.text.length : boundary;
  const adjacent = blocks[index - 1];
  const list: NoteList = { kind, id: adjacent?.type === 'text' && adjacent.list?.kind === kind && from === 0 ? adjacent.list.id : newBlockKey() };
  const items: NoteDraftBlock[] = [];
  if (from) items.push({ ...block, text: block.text.slice(0, from) });
  const lines = block.text.slice(from, to).split('\n');
  lines.forEach((text, line) => items.push({ key: !from && !line ? block.key : newBlockKey(), type: 'text', text, list }));
  if (to < block.text.length) items.push({ key: newBlockKey(), type: 'text', text: block.text.slice(to) });
  const target = items[from ? 1 : 0];
  return { blocks: [...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], cursor: { key: target.key, start: start - from, end: Math.min(end - from, (target as TextBlock).text.length) } };
}

/** Enter and multiline paste create structural items; no markers enter the input value. */
export function editNoteListItem(blocks: NoteDraftBlock[], key: string, value: string, selection?: NoteCursor): NoteEdit {
  const index = blocks.findIndex((block) => block.key === key);
  const block = blocks[index] as TextBlock;
  if (!block?.list || !value.includes('\n')) return { blocks: blocks.map((item) => item.key === key && item.type === 'text' ? { ...item, text: value } : item), cursor: null };
  if (!block.text.trim() && value === '\n') {
    return normalize(blocks.map((item) => item.key === key ? { ...block, text: '', list: undefined } : item), { key, start: 0, end: 0 });
  }
  let prefix = 0, suffix = 0;
  while (prefix < block.text.length && prefix < value.length && block.text[prefix] === value[prefix]) prefix++;
  while (suffix < block.text.length - prefix && suffix < value.length - prefix && block.text[block.text.length - suffix - 1] === value[value.length - suffix - 1]) suffix++;
  const caret = selection?.key === key && selection.end <= block.text.length
    ? Math.max(0, Math.min(value.length, value.length - block.text.length + selection.end))
    : value.length - suffix;
  const beforeCaret = value.slice(0, caret).split('\n');
  const lines = value.split('\n');
  const items = lines.map((text, line): TextBlock => ({ ...block, key: line ? newBlockKey() : key, text }));
  const target = items[beforeCaret.length - 1];
  return { blocks: [...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)], cursor: { key: target.key, start: beforeCaret.at(-1)!.length, end: beforeCaret.at(-1)!.length } };
}
