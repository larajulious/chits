import { fromUnit, SPACE_IDS, SPACES, STICKY_INSET, STICKY_SIZE, type SpaceId, type SpacePaperStyle, type SpacePinStyle } from '@/constants/spaces';
import { magnetColor, noteSeed, PAPER_INK, paperColor } from '@/constants/spaces-theme';
import type { PinnedNote, SpaceNoteKind } from '@/db/types';
import { noteListMarkers, parseNoteContent } from '@/services/note-content';

// Sticky Notes widget: a Space (Fridge, Desk, Cork board or Wall) on the Home
// Screen with its notes exactly as the user arranged them: the board in miniature. This file turns the
// board's own data (PinnedNote: position, tilt, paper, color) and style
// definitions (paperColor, PAPER_INK, magnetColor, each Space's pin) into
// plain values the widget renderers read: SwiftUI on iOS, a Canvas bitmap on
// Android. Pure, so tests can check it.

/** What the note is on its Space: paper, an instant print, or a cassette. Same rule as StickyPaper. */
export type StickyWidgetObject = 'paper' | 'print' | 'cassette';
/** p: paragraph, h: title or heading, c: open checklist item, x: ticked item, b: bullet or numbered item. */
export type StickyWidgetLineStyle = 'p' | 'h' | 'c' | 'x' | 'b';
export type StickyWidgetLine = { t: string; s: StickyWidgetLineStyle };
export type StickyWidgetMedia = {
  type: 'photo' | 'video' | 'audio';
  caption: string | null;
  /** "m:ss" for a recording. */
  duration: string | null;
  /** A small copy of the photo the widget can read; set by the publisher, never the original's path. */
  image: string | null;
  attachmentId: string;
};
export type StickyWidgetNote = {
  /** "kind:id": the note, wherever it's stuck. */
  key: string;
  kind: SpaceNoteKind;
  id: string;
  /** Where it's stuck: its top-left corner on the user's board, in board points (fromUnit). */
  left: number;
  top: number;
  /** Screen readers hear this: its first line, or Hidden Chit. */
  label: string;
  object: StickyWidgetObject;
  paper: SpacePaperStyle;
  base: string;
  curl: string;
  /** The magnet, pushpin or washi tape color the board gives this sticky. */
  pinColor: string;
  /** The sticky's stored tilt, and its tape's, as the board draws them. */
  tilt: number;
  tapeTilt: number;
  /** Hidden in Chat: covered, never its words. */
  hidden: boolean;
  lines: StickyWidgetLine[];
  /** Images pasted into the note, shown as a count like the board does. */
  images: number;
  media: StickyWidgetMedia | null;
  /** Opens this note in the editor. */
  url: string;
};
export type StickyWidgetSpace = {
  id: SpaceId;
  name: string;
  pin: SpacePinStyle;
  /** Shown on the surface when nothing is stuck to it, as the board says it. */
  empty: string;
  /** Opens this Space in Chits. */
  url: string;
  /** Back to front, as the board stacks them. */
  notes: StickyWidgetNote[];
};
export type StickyWidgetLabels = {
  hidden: string;
  voice: string;
  /** Android's Space picker title. */
  choose: string;
};
export type StickyWidgetSnapshot = {
  version: 1;
  /** The Spaces board the notes were arranged on, in points. */
  board: { width: number; height: number };
  spaces: StickyWidgetSpace[];
  labels: StickyWidgetLabels;
  ink: string;
  locale: string;
  rtl: boolean;
};
/** A placed note and the words of every live thought on it, in order (none when hidden). */
export type StickyWidgetRow = PinnedNote & { thoughts: { text: string | null; content: string | null }[] };

/** A widget's stickies are the board's, scaled down: a few short lines each. */
export const MAX_STICKY_CHARS = 240;
export const MAX_STICKY_LINES = 10;

export const stickyWidgetKey = (kind: SpaceNoteKind, id: string) => `${kind}:${id}`;
export const stickyWidgetURL = (kind: SpaceNoteKind, id: string) => `chits:///sticky?kind=${kind}&id=${encodeURIComponent(id)}`;
export const stickyWidgetSpaceURL = (spaceId: SpaceId) => `chits:///sticky?space=${spaceId}`;
export function resolveWidgetSpace(value: string | null | undefined): SpaceId {
  return SPACE_IDS.find((id) => id === value) ?? 'fridge';
}

/** Collapse runs of spaces, keep the writer's line breaks. */
const tidy = (value: string) => value.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();

/** A thought's words as lines with their structure: headings, list markers and ticks. */
export function thoughtLines(text: string | null, content: string | null): StickyWidgetLine[] {
  const blocks = parseNoteContent(content);
  if (!blocks) {
    // Plain notes: the words exactly as written, one line per line, empty ones dropped.
    return tidy(text ?? '').split('\n').filter(Boolean).map((t) => ({ t, s: 'p' as const }));
  }
  const lines: StickyWidgetLine[] = [];
  const title = blocks.find((block) => block.type === 'text' && block.title?.trim());
  if (title?.type === 'text' && title.title) lines.push({ t: tidy(title.title), s: 'h' });
  const markers = noteListMarkers(blocks);
  blocks.forEach((block, index) => {
    if (block.type !== 'text') return;
    const parts = tidy(block.text).split('\n').filter(Boolean);
    if (!parts.length) return;
    if (block.list?.kind === 'checklist') {
      const ticked = block.list.checked;
      parts.forEach((part) => lines.push({ t: `${ticked ? '☑' : '☐'} ${part}`, s: ticked ? 'x' : 'c' }));
    } else if (block.list) {
      parts.forEach((part, at) => lines.push({ t: at === 0 ? `${markers[index] ?? '•'} ${part}` : part, s: 'b' }));
    } else {
      parts.forEach((part) => lines.push({ t: part, s: block.heading ? 'h' : 'p' }));
    }
  });
  return lines;
}

/**
 * The note's words, bounded: a card's own title first (unless its note only
 * repeats it, the rule stickyText uses on the board), then each thought.
 */
export function stickyLines(title: string | null, thoughts: StickyWidgetRow['thoughts']): StickyWidgetLine[] {
  const body = thoughts.flatMap((thought) => thoughtLines(thought.text, thought.content));
  const heading = title ? tidy(title) : '';
  const lines = heading && body[0]?.t !== heading ? [{ t: heading, s: 'h' as const }, ...body] : body;
  const bounded: StickyWidgetLine[] = [];
  let used = 0;
  for (const line of lines.slice(0, MAX_STICKY_LINES)) {
    if (used >= MAX_STICKY_CHARS) break;
    const t = line.t.length + used > MAX_STICKY_CHARS ? `${line.t.slice(0, MAX_STICKY_CHARS - used).trimEnd()}…` : line.t;
    bounded.push({ ...line, t });
    used += t.length;
  }
  return bounded;
}

const durationLabel = (milliseconds: number | null) => {
  const seconds = Math.max(0, Math.round((milliseconds ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const round = (value: number) => Math.round(value * 10) / 10;

/** One placed note as the widget draws it. A hidden note carries no words, caption or picture. */
export function stickyWidgetNote(row: StickyWidgetRow, labels: Pick<StickyWidgetLabels, 'hidden' | 'voice'>, board: BoardSize): StickyWidgetNote {
  const spot = fromUnit({ x: row.x, y: row.y }, board);
  const seed = noteSeed(row.id);
  const paper = paperColor(row.color);
  const media = row.hidden ? null : row.media;
  const object: StickyWidgetObject = media?.attachment.type === 'audio' ? 'cassette' : media ? 'print' : 'paper';
  const caption = media ? (row.title?.trim() || media.caption || null) : null;
  const lines = row.hidden || media ? [] : stickyLines(row.title, row.thoughts.length ? row.thoughts : [{ text: row.text, content: null }]);
  const first = row.hidden ? labels.hidden : caption ?? lines[0]?.t ?? (object === 'cassette' ? labels.voice : '');
  return {
    key: stickyWidgetKey(row.kind, row.noteId), kind: row.kind, id: row.noteId, left: round(spot.x), top: round(spot.y),
    label: first.replace(/^[☐☑] /, '').slice(0, 60),
    object, paper: row.paperStyle, base: paper.base, curl: paper.curl, pinColor: magnetColor(seed),
    tilt: Math.max(-4, Math.min(4, Number.isFinite(row.rotation) ? row.rotation : 0)),
    // PinDecoration's tape lean: one way or the other by seed, so neighbours differ.
    tapeTilt: SPACES[row.spaceId].pinStyle === 'washi' ? (seed % 2 ? -4 : 3) : seed % 2 ? 3 : -3,
    hidden: row.hidden, lines, images: row.hidden || media ? 0 : row.imageCount ?? 0,
    media: media ? { type: media.attachment.type, caption, duration: media.attachment.type === 'audio' ? durationLabel(media.attachment.duration) : null, image: null, attachmentId: media.attachment.id } : null,
    url: stickyWidgetURL(row.kind, row.noteId),
  };
}

/** Photos the widget needs a small copy of, by attachment, with where the original lives. */
export type StickyWidgetPhoto = { attachmentId: string; storagePath: string; width: number | null; height: number | null };

export type BoardSize = { width: number; height: number };
/** Before Spaces has measured its board: an iPhone's, near enough until it does. */
export const FALLBACK_BOARD: BoardSize = { width: 393, height: 587 };

/** Every Space, with its notes back to front. `rows` come from the board's own query (see data.ts). */
export function stickyWidgetSnapshot(rows: StickyWidgetRow[], input: { labels: StickyWidgetLabels; empty: (spaceName: string) => string; locale: string; rtl: boolean; board?: BoardSize | null }): { snapshot: StickyWidgetSnapshot; photos: StickyWidgetPhoto[] } {
  const board = input.board && input.board.width > 0 && input.board.height > 0 ? input.board : FALLBACK_BOARD;
  const photos: StickyWidgetPhoto[] = [];
  const spaces = SPACE_IDS.map((id): StickyWidgetSpace => {
    const space = SPACES[id];
    const notes = rows.filter((row) => row.spaceId === id).map((row) => {
      const note = stickyWidgetNote(row, input.labels, board);
      if (note.media?.type === 'photo' && row.media) photos.push({ attachmentId: row.media.attachment.id, storagePath: row.media.attachment.storagePath, width: row.media.attachment.width, height: row.media.attachment.height });
      return note;
    });
    return { id, name: space.name, pin: space.pinStyle, empty: input.empty(space.name), url: stickyWidgetSpaceURL(id), notes };
  });
  return { snapshot: { version: 1, board: { width: Math.round(board.width), height: Math.round(board.height) }, spaces, labels: input.labels, ink: PAPER_INK, locale: input.locale, rtl: input.rtl }, photos };
}

/**
 * The board in miniature: every note at its own spot, all scaled by one
 * factor so spacing, overlaps and order stay exactly as arranged. The
 * arrangement (with the room the board leaves for pins and shadows) is fitted
 * to the widget and centered, never drawn larger than on the board.
 * The iOS layout and the Android renderer do this same math.
 */
export function widgetLayout(notes: Pick<StickyWidgetNote, 'left' | 'top'>[], width: number, height: number) {
  if (!notes.length) return [];
  const left = Math.min(...notes.map((note) => note.left)) - STICKY_INSET.side;
  const top = Math.min(...notes.map((note) => note.top)) - STICKY_INSET.top;
  const right = Math.max(...notes.map((note) => note.left)) + STICKY_SIZE.width + STICKY_INSET.side;
  const bottom = Math.max(...notes.map((note) => note.top)) + STICKY_SIZE.height + STICKY_INSET.bottom;
  const scale = Math.min(1, width / (right - left), height / (bottom - top));
  const x = (width - (right - left) * scale) / 2 - left * scale;
  const y = (height - (bottom - top) * scale) / 2 - top * scale;
  return notes.map((note) => ({ note, left: x + note.left * scale, top: y + note.top * scale, width: STICKY_SIZE.width * scale, height: STICKY_SIZE.height * scale, scale }));
}

/** Props as iOS can store them (no nulls): see services/widget-props. */
export { withoutNulls } from '@/services/widget-props';

/** Tables whose changes can change a sticky's look or words. */
export const STICKY_WIDGET_TABLES = ['messages', 'cards', 'boards', 'card_messages', 'attachments', 'space_placements'];
