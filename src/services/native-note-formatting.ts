import type { TextInput } from 'react-native';
import type { NoteText } from './note-content';
export const nativeNoteFormattingAvailable = false;
export function syncNativeNoteFormatting(_input: TextInput, _block: Pick<NoteText, 'text' | 'spans' | 'heading'>, _baseFamily?: string): void {}
export function detachNativeNoteFormatting(_input: TextInput): void {}
