import type { AttachmentLike, Message } from '@/db/types';

// Share Note turns a thought or card into a designed image. Everything here is
// pure (no React Native), so the rules — what content qualifies, how many images,
// how the card is laid out and how big the text can be — are unit-tested and the
// preview and the exported file can never disagree about them.

export const MAX_SHARE_NOTE_IMAGES = 2;

// Every size is authored on a 360-unit-wide canvas and scaled to whatever width
// it's drawn at (the on-screen preview, or 1080px for export), so the preview is
// an exact miniature of the file.
export const SHARE_NOTE_DESIGN_WIDTH = 360;

export const SHARE_NOTE_FORMATS = {
  portrait: { label: 'Portrait', width: 1080, height: 1350 },
  square: { label: 'Square', width: 1080, height: 1080 },
  story: { label: 'Story', width: 1080, height: 1920 },
} as const;
export type ShareNoteFormat = keyof typeof SHARE_NOTE_FORMATS;
export const DEFAULT_SHARE_NOTE_FORMAT: ShareNoteFormat = 'portrait';

export type ShareNoteMode = 'text' | 'text-image' | 'image';
export const SHARE_NOTE_MODES: { key: ShareNoteMode; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'text-image', label: 'Text + image' },
  { key: 'image', label: 'Image' },
];

export type ShareNoteImage = Pick<AttachmentLike, 'id' | 'storagePath' | 'width' | 'height'>;

/** What a thought or card can contribute to a Share Note: its words and its photos, nothing else. */
export type ShareNoteSource = {
  title: string | null;
  text: string | null;
  images: ShareNoteImage[];
  /** Videos, audio notes and files on the note — never drawn, only mentioned. */
  unsupportedCount: number;
};

type SourceAttachment = Pick<AttachmentLike, 'id' | 'type' | 'storagePath' | 'width' | 'height'>;
type SourceMessage = Pick<Message, 'text'> & { attachments: SourceAttachment[] };

/**
 * Maps a thought (one message) or a card (its thoughts plus the files added in
 * Card Details) to Share Note content. Text from several thoughts is kept in
 * order as paragraphs; photos keep Card Details' order (thoughts first, then the
 * card's own). A title is kept only when it adds something the text doesn't
 * already say (an untitled card's title is just its first words).
 */
export function buildShareNoteSource({ title, messages, cardAttachments = [] }: { title?: string | null; messages: SourceMessage[]; cardAttachments?: SourceAttachment[] }): ShareNoteSource {
  const text = messages.map((message) => message.text?.trim() ?? '').filter(Boolean).join('\n\n') || null;
  const attachments = [...messages.flatMap((message) => message.attachments), ...cardAttachments];
  const images = attachments.filter((attachment) => attachment.type === 'photo').map(({ id, storagePath, width, height }) => ({ id, storagePath, width, height }));
  const cleanTitle = title?.trim() || null;
  const titleAddsSomething = cleanTitle && !(text ?? '').startsWith(cleanTitle.replace(/…$/, ''));
  return { title: titleAddsSomething ? cleanTitle : null, text, images, unsupportedCount: attachments.length - images.length };
}

export const SHARE_NOTE_COPY = {
  empty: 'This note has no text or image to share yet.',
  unsupported: 'Only text and images can be used in Share Note for now.',
  imageLimit: 'You can include up to 2 images.',
  tooLong: 'This note is too long for this style. Try a shorter note or a different layout.',
} as const;

export type ShareNoteAvailability = { ok: true } | { ok: false; reason: 'empty' | 'unsupported'; message: string };

export function shareNoteAvailability(source: ShareNoteSource): ShareNoteAvailability {
  if (source.text || source.images.length) return { ok: true };
  return source.unsupportedCount
    ? { ok: false, reason: 'unsupported', message: SHARE_NOTE_COPY.unsupported }
    : { ok: false, reason: 'empty', message: SHARE_NOTE_COPY.empty };
}

/** Which content modes this note can actually fill. */
export function availableShareNoteModes(source: ShareNoteSource): Record<ShareNoteMode, boolean> {
  const hasText = Boolean(source.text || source.title);
  const hasImage = source.images.length > 0;
  return { text: hasText, 'text-image': hasText && hasImage, image: hasImage };
}

export function defaultShareNoteMode(source: ShareNoteSource): ShareNoteMode {
  const modes = availableShareNoteModes(source);
  return modes['text-image'] ? 'text-image' : modes.text ? 'text' : 'image';
}

export function initialShareNoteImages(source: ShareNoteSource): string[] {
  return source.images.slice(0, MAX_SHARE_NOTE_IMAGES).map((image) => image.id);
}

/**
 * Tapping an image thumbnail: deselects it, or selects it if there's room.
 * `limited` is true when the tap was refused because two are already chosen,
 * so the caller can point at the limit instead of silently swapping images.
 */
export function toggleShareNoteImage(selected: string[], id: string): { selected: string[]; limited: boolean } {
  if (selected.includes(id)) return { selected: selected.filter((item) => item !== id), limited: false };
  if (selected.length >= MAX_SHARE_NOTE_IMAGES) return { selected, limited: true };
  return { selected: [...selected, id], limited: false };
}

type Rect = { width: number; height: number };

type Slot = { top: number; height: number };

/** Everything inside the card is positioned in card-content coordinates (inside its padding). */
export type ShareNoteLayout = {
  canvas: Rect;
  card: Rect & { left: number; top: number; padding: number };
  content: Rect;
  /** The part of the content above the branding footer. */
  bodyHeight: number;
  /** Where the words go: mark, title and text, stacked and vertically centered. */
  textBlock: Slot | null;
  /** The theme's accent mark (quote glyph, rule…) — text-only notes. */
  mark: Slot | null;
  title: Slot | null;
  images: (Rect & { left: number; top: number })[];
  text: Rect & { top: number } | null;
  footer: Slot | null;
};

const CARD_INSET: Record<ShareNoteFormat, { x: number; y: number }> = {
  portrait: { x: 24, y: 28 },
  square: { x: 22, y: 22 },
  story: { x: 26, y: 72 },
};
const CARD_PADDING: Record<ShareNoteFormat, number> = { portrait: 24, square: 22, story: 26 };
// How much of the card's content height the photos take when sharing text + image.
const IMAGE_SHARE: Record<ShareNoteFormat, number> = { portrait: 0.54, square: 0.5, story: 0.56 };
const MARK_HEIGHT = 34;
const TITLE_HEIGHT = 26;
const FOOTER_HEIGHT = 28;
const GAP = 16;
const TILE_GAP = 10;

/**
 * The card's geometry in design units. Photos never stretch: each tile is a
 * fixed box the photo covers (center-cropped), so any aspect ratio composes
 * cleanly. Text + image reads photos first, then title and text; text only
 * opens with the theme's mark. The text box gets exactly what's left.
 */
export function shareNoteLayout({ format, mode, imageCount, hasTitle, showMark, showBranding }: { format: ShareNoteFormat; mode: ShareNoteMode; imageCount: number; hasTitle: boolean; showMark: boolean; showBranding: boolean }): ShareNoteLayout {
  const { width, height } = SHARE_NOTE_FORMATS[format];
  const canvas = { width: SHARE_NOTE_DESIGN_WIDTH, height: Math.round(SHARE_NOTE_DESIGN_WIDTH * height / width) };
  const inset = CARD_INSET[format];
  const padding = CARD_PADDING[format];
  const card = { left: inset.x, top: inset.y, width: canvas.width - inset.x * 2, height: canvas.height - inset.y * 2, padding };
  const content = { width: card.width - padding * 2, height: card.height - padding * 2 };
  const footer = showBranding ? { top: content.height - FOOTER_HEIGHT + 6, height: FOOTER_HEIGHT - 6 } : null;
  const bodyHeight = content.height - (showBranding ? FOOTER_HEIGHT : 0);
  const tiles = mode === 'text' ? 0 : Math.min(Math.max(imageCount, 0), MAX_SHARE_NOTE_IMAGES);

  if (mode === 'image') {
    // Two photos stack in tall formats and sit side by side in a square.
    const half = (length: number) => (length - TILE_GAP) / 2;
    const images = tiles === 1 ? [{ left: 0, top: 0, width: content.width, height: bodyHeight }]
      : tiles === 2 && format === 'square' ? [0, 1].map((index) => ({ left: index * (half(content.width) + TILE_GAP), top: 0, width: half(content.width), height: bodyHeight }))
        : tiles === 2 ? [0, 1].map((index) => ({ left: 0, top: index * (half(bodyHeight) + TILE_GAP), width: content.width, height: half(bodyHeight) }))
          : [];
    return { canvas, card, content, bodyHeight, textBlock: null, mark: null, title: null, images, text: null, footer };
  }

  let top = 0;
  const mark = showMark && !tiles ? { top, height: MARK_HEIGHT } : null;
  if (mark) top += MARK_HEIGHT;
  const imageHeight = tiles ? Math.round(bodyHeight * IMAGE_SHARE[format]) : 0;
  const tileWidth = tiles === 2 ? (content.width - TILE_GAP) / 2 : content.width;
  const images = Array.from({ length: tiles }, (_, index) => ({ left: index * (tileWidth + TILE_GAP), top, width: tileWidth, height: imageHeight }));
  if (tiles) top += imageHeight + GAP;
  const textBlock = { top: mark ? 0 : top, height: bodyHeight - (mark ? 0 : top) };
  const title = hasTitle ? { top, height: TITLE_HEIGHT } : null;
  if (title) top += TITLE_HEIGHT;
  return { canvas, card, content, bodyHeight, textBlock, mark, title, images, text: { top, width: content.width, height: Math.max(0, bodyHeight - top) }, footer };
}

export type ShareNoteFontMetrics = { averageCharWidth: number; lineHeight: number };

export type ShareNoteTextFit = { fontSize: number; lineHeight: number; maxLines: number; truncated: boolean };

// Text-only notes read like a quote: large type that steps down as the note
// grows. Beside photos the text is secondary, so it starts smaller.
const TEXT_SIZES = [40, 36, 32, 29, 26, 24, 22, 20, 18, 17, 16, 15, 14, 13];
const MAX_SIZE: Record<'text' | 'text-image', Record<ShareNoteFormat, number>> = {
  text: { portrait: 36, square: 32, story: 40 },
  'text-image': { portrait: 22, square: 20, story: 24 },
};
const MIN_SIZE = { text: 14, 'text-image': 13 } as const;

/** Estimated wrapped line count for `text` at `fontSize` in a box `width` wide. */
export function estimateLines(text: string, fontSize: number, width: number, metrics: Pick<ShareNoteFontMetrics, 'averageCharWidth'>): number {
  // A little slack for word wrapping, which rarely fills a line to the edge.
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * metrics.averageCharWidth * 1.08)));
  return text.split('\n').reduce((lines, paragraph) => lines + Math.max(1, Math.ceil(paragraph.trim().length / charsPerLine)), 0);
}

/**
 * The largest type size at which the whole note fits its box. When even the
 * smallest readable size can't hold it, the text is clamped (ellipsis) at the
 * lines that fit and `truncated` tells the composer to suggest another style —
 * text is never allowed to spill outside the card.
 */
export function fitShareNoteText(text: string, box: Rect, { mode, format, metrics }: { mode: 'text' | 'text-image'; format: ShareNoteFormat; metrics: ShareNoteFontMetrics }): ShareNoteTextFit {
  const sizes = TEXT_SIZES.filter((size) => size <= MAX_SIZE[mode][format] && size >= MIN_SIZE[mode]);
  for (const fontSize of sizes) {
    const lineHeight = Math.round(fontSize * metrics.lineHeight);
    const maxLines = Math.max(1, Math.floor(box.height / lineHeight));
    if (estimateLines(text, fontSize, box.width, metrics) <= maxLines) return { fontSize, lineHeight, maxLines, truncated: false };
  }
  const fontSize = MIN_SIZE[mode];
  const lineHeight = Math.round(fontSize * metrics.lineHeight);
  return { fontSize, lineHeight, maxLines: Math.max(1, Math.floor(box.height / lineHeight)), truncated: true };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "Chits Note 2026-09-29 14.03.12.png" — what the file is called in the share sheet, Photos and Downloads. */
export function shareNoteFileName(at: Date, extension: 'png' | 'jpg'): string {
  return `Chits Note ${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}.${extension}`;
}
