import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';
import { NOTE_HIGHLIGHTS, NOTE_TEXT_COLORS, type NoteMarks } from '@/services/note-rich-text';
import type { NoteText } from '@/services/note-content';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { useTheme } from '@/components/theme-provider';
import { parseInlineContent } from '@/components/chat/message-presentation';
import { sliceNoteText } from '@/services/note-rich-text';
import { noteFontStyle } from '@/services/note-text-style';
import { needsSystemFont } from '@/localization/text-layout';
import { useLocale } from '@/localization/provider';

export function noteMarkStyle(marks: NoteMarks, baseFamily?: string): TextStyle {
  const backgroundColor = marks.highlight ? NOTE_HIGHLIGHTS[marks.highlight] : null;
  return {
    ...noteFontStyle(marks, baseFamily),
    ...(marks.underline ? { textDecorationLine: 'underline' } : {}),
    ...(backgroundColor ? { backgroundColor, color: '#24231F' } : {}),
    ...(marks.color && NOTE_TEXT_COLORS[marks.color] ? { color: NOTE_TEXT_COLORS[marks.color]! } : {}),
  };
}
export function noteHeadingStyle(heading?: number, scale = 1): TextStyle | undefined {
  return heading ? { fontSize: (heading === 1 ? 26 : 21) * scale, lineHeight: (heading === 1 ? 34 : 29) * scale, fontWeight: '700' } : undefined;
}
/** Plain segments are native Text too, so typography and selection inherit. */
export function noteTextSpans(block: Pick<NoteText, 'text' | 'spans' | 'heading'>, baseFamily?: string): ReactNode {
  if (!block.spans?.length) return block.text;
  if (block.heading) baseFamily = noteFontStyle({ bold: true }, baseFamily).fontFamily ?? baseFamily;
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const span of block.spans) {
    if (span.start > offset) nodes.push(<Text key={`p${offset}`} style={noteFontStyle({}, baseFamily)}>{block.text.slice(offset, span.start)}</Text>);
    nodes.push(<Text key={`s${span.start}`} style={noteMarkStyle(span.marks, baseFamily)}>{block.text.slice(span.start, span.end)}</Text>);
    offset = span.end;
  }
  if (offset < block.text.length) nodes.push(<Text key={`p${offset}`} style={noteFontStyle({}, baseFamily)}>{block.text.slice(offset)}</Text>);
  return nodes;
}
export function NoteFormattedText({ block, style }: { block: NoteText; style?: StyleProp<TextStyle> }) {
  const { tokens } = useTheme();
  const locale = useLocale();
  const font = useFontStyle('body', block.heading ? '700' : undefined);
  const baseFamily = needsSystemFont(block.text, locale) ? undefined : StyleSheet.flatten(style)?.fontFamily ?? font.fontFamily;
  let offset = 0;
  const content: ReactNode[] = [];
  for (const [index, segment] of parseInlineContent(block.text).entries()) {
    const part = sliceNoteText(block, offset, offset + segment.text.length);
    offset += segment.text.length;
    content.push(segment.kind === 'link'
      ? <Text key={index} accessibilityRole="link" onPress={() => { void Linking.openURL(segment.text).catch(() => undefined); }}>{noteTextSpans(part, baseFamily)}</Text>
      : <Text key={index}>{noteTextSpans(part, baseFamily)}</Text>);
  }
  return <AppText selectable style={[{ fontSize: 16, lineHeight: 24, color: tokens.textPrimary }, style, noteHeadingStyle(block.heading)]}>{content}</AppText>;
}
