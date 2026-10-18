import type { AttachmentLike } from '@/db/types';

// A note's content in reading order: paragraphs, structured list items and images.
// Stored as messages.content_json when a note has lists or inline images —
// text-only notes keep content_json NULL and stay exactly as they were.
// messages.text always holds the note's words alone (text blocks joined), so
// search, titles, stickies and every text-only preview keep working unchanged.
export type NoteList = { kind: 'bullet' | 'numbered'; id: string } | { kind: 'checklist'; id: string; checked: boolean };
export type NoteText = { type: 'text'; text: string; list?: NoteList };
export type NoteBlock = NoteText | { type: 'image'; attachmentId: string };

export type NoteImageDetails = Pick<AttachmentLike, 'storagePath' | 'originalName' | 'mimeType' | 'size' | 'width' | 'height'>;

// An editor's working copy. `attachmentId` is set for an image already saved on
// the note and null for one pasted in this session (staged in Chits storage,
// not yet in SQLite). `key` is stable across edits so React keeps each input.
export type NoteDraftBlock =
  | (NoteText & { key: string })
  | { key: string; type: 'image'; attachmentId: string | null; image: NoteImageDetails; fingerprint?: string | null; remove?: () => Promise<void> };

// What a note renders, with each image block resolved to its attachment.
export type NoteRenderBlock = (NoteText & { key: string }) | { key: string; type: 'image'; attachment: AttachmentLike };

export type NoteCursor = { key: string; start: number; end: number } | null;

export const MAX_NOTE_IMAGES = 20;
const PARAGRAPH_JOIN = '\n\n';

let keySeed = 0;
export function newBlockKey() {
  keySeed += 1;
  return `b${Date.now().toString(36)}${keySeed.toString(36)}`;
}

export function parseNoteContent(json: string | null | undefined): NoteBlock[] | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return null;
    const blocks: NoteBlock[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const block = item as Record<string, unknown>;
      if (block.type === 'text' && typeof block.text === 'string') blocks.push({ type: 'text', text: block.text, ...readList(block.list) });
      else if (block.type === 'image' && typeof block.attachmentId === 'string' && block.attachmentId) blocks.push({ type: 'image', attachmentId: block.attachmentId });
    }
    return blocks.some((block) => block.type === 'image' || block.list) ? blocks : null;
  } catch {
    return null;
  }
}

/** Structured content, or null for a note containing only plain text. */
export function serializeNoteContent(blocks: NoteBlock[]): string | null {
  const cleaned = compactBlocks(blocks);
  return cleaned.some((block) => block.type === 'image' || block.list) ? JSON.stringify(cleaned) : null;
}

/** Preserve authored whitespace; drop empty editor slots, keeping images in place. */
function compactBlocks(blocks: NoteBlock[]): NoteBlock[] {
  const result: NoteBlock[] = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type === 'image') { result.push({ type: 'image', attachmentId: block.attachmentId }); continue; }
    const text = block.text;
    // Empty text beside another text block is an authored paragraph (for
    // example the line before/after a formatted paragraph), not an image slot.
    if (!text && !block.list && blocks[index - 1]?.type !== 'text' && blocks[index + 1]?.type !== 'text') continue;
    const previous = result[result.length - 1];
    if (previous?.type === 'text' && !previous.list && !block.list) previous.text = `${previous.text}${text}`;
    else result.push({ type: 'text', text, ...readList(block.list) });
  }
  return result;
}

/** The note's words alone — what messages.text holds. */
export function noteBlocksText(blocks: Pick<NoteDraftBlock, 'type'>[] | NoteBlock[]): string {
  return (blocks as { type: string; text?: string }[])
    .flatMap((block) => block.type === 'text' && block.text?.trim() ? [block.text.trim()] : [])
    .join(PARAGRAPH_JOIN);
}

export function readList(value: unknown): { list?: NoteList } {
  if (!value || typeof value !== 'object') return {};
  const list = value as Record<string, unknown>;
  if (list.kind === 'checklist' && typeof list.id === 'string' && list.id.length > 0) return { list: { kind: 'checklist', id: list.id, checked: list.checked === true } };
  return (list.kind === 'bullet' || list.kind === 'numbered') && typeof list.id === 'string' && list.id.length > 0 ? { list: { kind: list.kind, id: list.id } } : {};
}

export function draftHasRichContent(blocks: NoteDraftBlock[]) {
  return blocks.some((block) => block.type === 'image' || Boolean(block.list));
}

/** A deliberately inserted empty list item is not a cleared document. */
export function isEmptyNoteDraft(blocks: NoteDraftBlock[]) {
  return blocks.length === 1 && blocks[0].type === 'text' && blocks[0].text === '' && !blocks[0].list;
}

/** Number labels are derived from item order, never stored in the editable text. */
export function noteListMarkers(blocks: (NoteBlock | NoteDraftBlock | NoteRenderBlock)[]) {
  const counts = new Map<string, number>();
  return blocks.map((block) => {
    if (block.type !== 'text' || !block.list || block.list.kind === 'checklist') return null;
    const count = (counts.get(block.list.id) ?? 0) + 1;
    counts.set(block.list.id, count);
    return block.list.kind === 'bullet' ? '•' : `${count}.`;
  });
}

export function draftHasImages(blocks: NoteDraftBlock[]) {
  return blocks.some((block) => block.type === 'image');
}

export function draftImageCount(blocks: NoteDraftBlock[]) {
  return blocks.reduce((count, block) => count + (block.type === 'image' ? 1 : 0), 0);
}

/**
 * A draft's words as one string: the lone input's text exactly as typed for a
 * note without images, or the trimmed words joined for one with them.
 */
export function draftPlainText(blocks: NoteDraftBlock[]): string {
  if (!draftHasRichContent(blocks)) return blocks.find((block) => block.type === 'text')?.text ?? '';
  return noteBlocksText(blocks);
}

/** Ordered words, list metadata and saved images, retained across restarts. */
export function draftContentForStorage(blocks: NoteDraftBlock[]): string | null {
  return serializeNoteContent(blocks.flatMap((block): NoteBlock[] => block.type === 'text' ? [{ type: 'text', text: block.text, ...readList(block.list) }] : block.attachmentId ? [{ type: 'image', attachmentId: block.attachmentId }] : []));
}

/** Whether a draft holds images pasted in this session that aren't saved anywhere yet. */
export function draftHasUnsavedImages(blocks: NoteDraftBlock[]) {
  return blocks.some((block) => block.type === 'image' && !block.attachmentId);
}

export function textDraft(text = ''): NoteDraftBlock[] {
  return [{ key: newBlockKey(), type: 'text', text }];
}

type ContentSource = { text: string | null; content?: NoteBlock[] | null; attachments: AttachmentLike[] };

/**
 * A saved note as an editor draft. Inline notes come back block for block. A
 * note saved before inline images existed opens with its photos first, then its
 * words — the order every screen already showed it in — so the editor never
 * shuffles a note just by opening it. Video, audio and files aren't inline
 * content and are left out (Edit Note never touches them).
 */
export function draftFromNote(note: ContentSource): NoteDraftBlock[] {
  const byId = new Map(note.attachments.map((attachment) => [attachment.id, attachment]));
  const imageBlock = (attachment: AttachmentLike): NoteDraftBlock => ({ key: newBlockKey(), type: 'image', attachmentId: attachment.id, image: imageDetails(attachment) });
  const blocks: NoteDraftBlock[] = [];
  if (note.content) {
    // A photo picked alongside the pasted ones isn't in the content; it shows first, so it opens first.
    const inline = new Set(note.content.flatMap((block) => block.type === 'image' ? [block.attachmentId] : []));
    for (const attachment of note.attachments) if (attachment.type === 'photo' && !inline.has(attachment.id)) blocks.push(imageBlock(attachment));
    for (const block of note.content) {
      if (block.type === 'text') blocks.push({ key: newBlockKey(), type: 'text', text: block.text, ...readList(block.list) });
      else { const attachment = byId.get(block.attachmentId); if (attachment) blocks.push(imageBlock(attachment)); }
    }
  } else {
    for (const attachment of note.attachments) if (attachment.type === 'photo') blocks.push(imageBlock(attachment));
    if (note.text) blocks.push({ key: newBlockKey(), type: 'text', text: note.text });
  }
  return ensureEditableText(blocks);
}

function imageDetails(attachment: AttachmentLike): NoteImageDetails {
  return { storagePath: attachment.storagePath, originalName: attachment.originalName, mimeType: attachment.mimeType, size: attachment.size, width: attachment.width, height: attachment.height };
}

/**
 * Keeps a text block before the first image, between any two images and after
 * the last, so there is always somewhere to type. Adjacent text blocks merge.
 */
export function ensureEditableText(blocks: NoteDraftBlock[]): NoteDraftBlock[] {
  const result: NoteDraftBlock[] = [];
  for (const block of blocks) {
    const previous = result[result.length - 1];
    if (block.type === 'text' && previous?.type === 'text' && !block.list && !previous.list) {
      result[result.length - 1] = { ...previous, text: previous.text + block.text };
      continue;
    }
    if (block.type === 'image' && previous?.type !== 'text') result.push({ key: newBlockKey(), type: 'text', text: '' });
    result.push(block);
  }
  if (result[result.length - 1]?.type !== 'text') result.push({ key: newBlockKey(), type: 'text', text: '' });
  return result;
}

/**
 * Pastes an image where the cursor is: the text block it's in splits around
 * the image (selected text is preserved after it), and the cursor moves to just after it.
 * With no cursor the image goes at the end.
 */
export function insertImageAtCursor(blocks: NoteDraftBlock[], cursor: NoteCursor, image: Extract<NoteDraftBlock, { type: 'image' }>): { blocks: NoteDraftBlock[]; cursor: NoteCursor } {
  const index = cursor ? blocks.findIndex((block) => block.key === cursor.key && block.type === 'text') : -1;
  const target = index >= 0 ? blocks[index] as Extract<NoteDraftBlock, { type: 'text' }> : null;
  if (!target || !cursor) {
    const next = ensureEditableText([...blocks, image]);
    const after = next[next.length - 1];
    return { blocks: next, cursor: { key: after.key, start: 0, end: 0 } };
  }
  const start = Math.max(0, Math.min(cursor.start, target.text.length));
  const before = target.text.slice(0, start);
  const afterText = target.text.slice(start);
  const afterBlock: NoteDraftBlock = { key: newBlockKey(), type: 'text', text: afterText, ...readList(target.list) };
  const next = [...blocks.slice(0, index), { ...target, text: before }, image, afterBlock, ...blocks.slice(index + 1)];
  return { blocks: ensureEditableText(next), cursor: { key: afterBlock.key, start: 0, end: 0 } };
}

/** Removes an image; the text around it joins back into one block. */
export function removeImageBlock(blocks: NoteDraftBlock[], key: string): NoteDraftBlock[] {
  return ensureEditableText(blocks.filter((block) => block.key !== key));
}

export function updateTextBlock(blocks: NoteDraftBlock[], key: string, text: string): NoteDraftBlock[] {
  return blocks.map((block) => block.key === key && block.type === 'text' ? { ...block, text } : block);
}

/**
 * A note's content in reading order, every image resolved to its attachment.
 * Returns null for a plain note (no inline image left to show), so callers fall
 * back to their existing text/attachment rendering. An image whose attachment
 * is gone (deleted from the library, or missing after a restore) is skipped.
 * `leading` holds attachments that aren't inline — a picked photo, video, audio
 * or file — which render before the content, as they always have.
 */
export function noteRenderContent<T extends AttachmentLike>(note: { text: string | null; content?: NoteBlock[] | null; attachments: T[] }): { blocks: NoteRenderBlock[]; leading: T[] } | null {
  if (!note.content) return null;
  const byId = new Map(note.attachments.map((attachment) => [attachment.id, attachment]));
  const used = new Set<string>();
  const blocks: NoteRenderBlock[] = [];
  note.content.forEach((block, index) => {
    if (block.type === 'text') {
      const text = block.text;
      if (text || block.list) blocks.push({ key: `t${index}`, type: 'text', text, ...readList(block.list) });
      return;
    }
    const attachment = byId.get(block.attachmentId);
    if (!attachment) return;
    used.add(attachment.id);
    blocks.push({ key: `${attachment.id}:${index}`, type: 'image', attachment });
  });
  if (!used.size && !blocks.some((block) => block.type === 'text' && block.list)) return null;
  return { blocks, leading: note.attachments.filter((attachment) => !used.has(attachment.id)) };
}

/**
 * Consecutive images group into rows of two that share one height, each image
 * keeping its own proportions (never cropped or stretched); an odd one out gets
 * a row to itself. Heights are capped, and a capped row narrows to fit.
 */
export function imageRows(images: Pick<AttachmentLike, 'width' | 'height'>[], width: number, gap: number, maxHeight: number) {
  const ratio = (image: Pick<AttachmentLike, 'width' | 'height'>) => image.width && image.height ? image.width / image.height : 4 / 3;
  const rows: { indexes: number[]; height: number; widths: number[] }[] = [];
  for (let index = 0; index < images.length; index += 2) {
    const indexes = index + 1 < images.length ? [index, index + 1] : [index];
    const ratios = indexes.map((itemIndex) => ratio(images[itemIndex]));
    const available = Math.max(0, width - gap * (indexes.length - 1));
    // Never taller than the smallest image really is, so a small paste isn't blown up.
    const natural = Math.min(...indexes.map((itemIndex) => images[itemIndex].height || Infinity));
    const height = Math.min(maxHeight, natural, available / ratios.reduce((sum, value) => sum + value, 0));
    rows.push({ indexes, height: Math.round(height), widths: ratios.map((value) => Math.floor(value * height)) });
  }
  return rows;
}

/** A cheap, stable fingerprint of clipboard image data, to catch a double paste. */
export function imageFingerprint(data: string) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(data.length / 4096));
  for (let index = 0; index < data.length; index += step) {
    hash ^= data.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `${data.length.toString(36)}-${hash.toString(36)}`;
}

/** Real checkbox states only; ordinary text remains separate for mixed-note previews. */
export function noteChecklistSummary(blocks: (NoteBlock | NoteDraftBlock | NoteRenderBlock)[]) {
  const items = blocks.filter((block) => block.type === 'text' && block.list?.kind === 'checklist') as NoteText[];
  if (!items.length) return null;
  const completed = items.filter((block) => block.list?.kind === 'checklist' && block.list.checked).length;
  return {
    total: items.length, completed, percent: Math.round(completed / items.length * 100),
    remaining: items.filter((block) => block.list?.kind === 'checklist' && !block.list.checked).slice(0, 3).map((block) => block.text.trim() || 'Empty item'),
    text: blocks.flatMap((block) => block.type === 'text' && block.list?.kind !== 'checklist' && block.text.trim() ? [block.text.trim()] : []).join('\n\n'),
  };
}

export function noteHasChecklist(blocks: { type: string; list?: NoteList }[]) {
  return blocks.some((block) => block.type === 'text' && block.list?.kind === 'checklist');
}
