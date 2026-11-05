import type { TextStyle } from 'react-native';
import type { NoteMarks } from './note-rich-text.ts';

/** Bundled Nunito files are registered as separate families. Native weight and
 * italic synthesis on a fixed family is inconsistent across Android and iOS. */
export function noteFontStyle(marks: NoteMarks, baseFamily?: string): TextStyle {
  const weight = /^Nunito_(600|700|800)/.exec(baseFamily ?? '')?.[1];
  if (weight) {
    const face = marks.bold ? (weight === '800' ? '800ExtraBold' : '700Bold')
      : weight === '800' ? '800ExtraBold' : weight === '700' ? '700Bold' : '600SemiBold';
    return { fontFamily: `Nunito_${face}${marks.italic ? '_Italic' : ''}`, fontWeight: 'normal', fontStyle: 'normal' };
  }
  return { ...(marks.bold ? { fontWeight: '700' } : {}), ...(marks.italic ? { fontStyle: 'italic' } : {}) };
}
