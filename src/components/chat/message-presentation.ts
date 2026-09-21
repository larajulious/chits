import type { Message } from '@/db/types';

export const MESSAGE_PRESENTATION = {
  longTextCharacters: 180,
  longTextLines: 4,
  minimumListItems: 2,
} as const;

export type MessagePresentation = 'attachment' | 'quick-thought' | 'note' | 'structured-note';

export type StructuredLine =
  | { kind: 'spacer'; key: string }
  | { kind: 'copy'; key: string; text: string }
  | { kind: 'item'; key: string; text: string; checked: boolean | null };

export type InlineSegment = { kind: 'text' | 'link'; text: string };

const CHECKBOX_LINE = /^\s*(?:[-*\u2022]\s*)?\[([ xX])\]\s+(.+)$/;
const LIST_LINE = /^\s*[-*\u2022]\s+(.+)$/;

export function parseStructuredText(text: string): StructuredLine[] {
  return text.split(/\r?\n/).map((line, index) => {
    const key = `${index}-${line}`;
    if (!line.trim()) return { kind: 'spacer', key };
    const checkbox = line.match(CHECKBOX_LINE);
    if (checkbox) return { kind: 'item', key, text: checkbox[2], checked: checkbox[1].toLowerCase() === 'x' };
    const item = line.match(LIST_LINE);
    if (item) return { kind: 'item', key, text: item[1], checked: null };
    return { kind: 'copy', key, text: line.trim() };
  });
}

export function parseParagraphs(text: string) {
  return text.trim().split(/\r?\n\s*\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function parseInlineContent(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const expression = /https?:\/\/[^\s]+/g;
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, index) });
    const raw = match[0];
    const link = raw.replace(/[),.!?;:]+$/, '');
    const punctuation = raw.slice(link.length);
    if (link) segments.push({ kind: 'link', text: link });
    if (punctuation) segments.push({ kind: 'text', text: punctuation });
    cursor = index + raw.length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments.length ? segments : [{ kind: 'text', text }];
}

export function classifyText(text: string | null): Exclude<MessagePresentation, 'attachment'> {
  const value = text?.trim() ?? '';
  const lines = value.split(/\r?\n/);
  const structuredLines = parseStructuredText(value);
  const items = structuredLines.filter((line) => line.kind === 'item');
  if (items.some((line) => line.checked !== null) || items.length >= MESSAGE_PRESENTATION.minimumListItems) return 'structured-note';
  if (value.length >= MESSAGE_PRESENTATION.longTextCharacters || lines.length >= MESSAGE_PRESENTATION.longTextLines) return 'note';
  return 'quick-thought';
}

export function classifyMessage(message: Pick<Message, 'attachments' | 'text'>): MessagePresentation {
  if (message.attachments.length) return 'attachment';
  return classifyText(message.text);
}
