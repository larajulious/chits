import type { NoteText } from './note-content.ts';
import { NOTE_HIGHLIGHTS, NOTE_TEXT_COLORS, normalizeSpans } from './note-rich-text.ts';
import { noteFontStyle } from './note-text-style.ts';

/** Native appearance snapshots use the document's original UTF-16 offsets. */
export function nativeNoteFormattingRuns(block: Pick<NoteText, 'text' | 'spans' | 'heading'>, baseFamily?: string) {
  if (block.heading) baseFamily = noteFontStyle({ bold: true }, baseFamily).fontFamily ?? baseFamily;
  return normalizeSpans(block.spans, block.text.length).map(({ start, end, marks }) => {
    const backgroundColor = marks.highlight ? NOTE_HIGHLIGHTS[marks.highlight] : null;
    const color = (marks.color ? NOTE_TEXT_COLORS[marks.color] : null) ?? (backgroundColor ? '#24231F' : null);
    const font = noteFontStyle(marks, baseFamily);
    return { start, end,
      ...(marks.bold || (block.heading && marks.italic) ? { bold: true } : {}), ...(marks.italic ? { italic: true } : {}),
      ...((marks.bold || marks.italic) && font.fontFamily ? { fontFamily: font.fontFamily } : {}),
      ...(marks.underline ? { underline: true } : {}),
      ...(color ? { color } : {}), ...(backgroundColor ? { backgroundColor } : {}),
    };
  });
}
