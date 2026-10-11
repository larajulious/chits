import type { AttachmentLike } from '@/db/types';

// A note's content in reading order: text and pasted images, interleaved.
// Stored as messages.content_json only when a note has inline images —
// text-only notes keep content_json NULL and stay exactly as they were.
// messages.text always holds the note's words alone (text blocks joined), so
// search, titles, stickies and every text-only preview keep working unchanged.
export type NoteBlock = { type: 'text'; text: string } | { type: 'image'; attachmentId: string };

export type NoteImageDetails = Pick<AttachmentLike, 'storagePath' | 'originalName' | 'mimeType' | 'size' | 'width' | 'height'>;

// An editor's working copy. `attachmentId` is set for an image already saved on
// the note and null for one pasted in this session (staged in Chits storage,
// not yet in SQLite). `key` is stable across edits so React keeps each input.
export type NoteDraftBlock =
  | { key: string; type: 'text'; text: string }
  | { key: string; type: 'image'; attachmentId: string | null; image: NoteImageDetails; fingerprint?: string | null; remove?: () => Promise<void> };

// What a note renders, with each image block resolved to its attachment.
export type NoteRenderBlock = { key: string; type: 'text'; text: string } | { key: string; type: 'image'; attachment: AttachmentLike };

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
      if (block.type === 'text' && typeof block.text === 'string') blocks.push({ type: 'text', text: block.text });
      else if (block.type === 'image' && typeof block.attachmentId === 'string' && block.attachmentId) blocks.push({ type: 'image', attachmentId: block.attachmentId });
    }
    return blocks.some((block) => block.type === 'image') ? blocks : null;
  } catch {
    return null;
  }
}

/** The JSON stored for a note, or null when it has no images (a plain text note). */
export function serializeNoteContent(blocks: NoteBlock[]): string | null {
  const cleaned = compactBlocks(blocks);
  return cleaned.some((block) => block.type === 'image') ? JSON.stringify(cleaned) : null;
}

/** Trims every text block and drops the empty ones, keeping images in place. */
function compactBlocks(blocks: NoteBlock[]): NoteBlock[] {
  const result: NoteBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'image') { result.push(block); continue; }
    const text = block.text.trim();
    if (!text) continue;
    const previous = result[result.length - 1];
    if (previous?.type === 'text') previous.text = `${previous.text}${PARAGRAPH_JOIN}${text}`;
    else result.push({ type: 'text', text });
  }
  return result;
}

/** The note's words alone — what messages.text holds. */
export function noteBlocksText(blocks: Pick<NoteDraftBlock, 'type'>[] | NoteBlock[]): string {
  return (blocks as { type: string; text?: string }[])
    .flatMap((block) => block.type === 'text' && block.text?.trim() ? [block.text.trim()] : [])
    .join(PARAGRAPH_JOIN);
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
  if (!draftHasImages(blocks)) return blocks.find((block) => block.type === 'text')?.text ?? '';
  return noteBlocksText(blocks);
}

/** A draft's order of words and saved images, to keep across restarts; null without saved images. */
export function draftContentForStorage(blocks: NoteDraftBlock[]): string | null {
  return serializeNoteContent(blocks.flatMap((block): NoteBlock[] => block.type === 'text' ? [{ type: 'text', text: block.text }] : block.attachmentId ? [{ type: 'image', attachmentId: block.attachmentId }] : []));
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
      if (block.type === 'text') blocks.push({ key: newBlockKey(), type: 'text', text: block.text });
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
    if (block.type === 'text' && previous?.type === 'text') {
      result[result.length - 1] = { ...previous, text: [previous.text, block.text].filter(Boolean).join('\n') };
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
 * the image (a selection is replaced), and the cursor moves to just after it.
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
  const end = Math.max(start, Math.min(cursor.end, target.text.length));
  const before = target.text.slice(0, start).replace(/\s+$/, '');
  const afterText = target.text.slice(end).replace(/^\s+/, '');
  const afterBlock: NoteDraftBlock = { key: newBlockKey(), type: 'text', text: afterText };
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
      const text = block.text.trim();
      if (text) blocks.push({ key: `t${index}`, type: 'text', text });
      return;
    }
    const attachment = byId.get(block.attachmentId);
    if (!attachment || used.has(attachment.id)) return;
    used.add(attachment.id);
    blocks.push({ key: attachment.id, type: 'image', attachment });
  });
  if (!used.size) return null;
  return { blocks, leading: note.attachments.filter((attachment) => !used.has(attachment.id)) };
}

/**
 * Consecutive images group into rows of two that share one height, each image
 * keeping its own proportions (never cropped or stretched); an odd one out gets
 * a row to itself. Heights are capped, and a capped row narrows to fit.
 */
export function imageRows(images: Pick<AttachmentLike, 'width' | 'height'>[], width: number, gap: number, maxHeight: number) {
  const ratio = (image: Pick<AttachmentLike, 'width' | 'height'>) => image.width && image.height ? Math.max(0.25, Math.min(4, image.width / image.height)) : 4 / 3;
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
