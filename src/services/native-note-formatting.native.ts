import { requireOptionalNativeModule } from 'expo';
import { findNodeHandle, Platform, type TextInput } from 'react-native';
import type { NoteText } from './note-content';
import { nativeNoteFormattingRuns } from './note-native-formatting-data';

type FormattingModule = {
  applyNoteTextFormatting?: (tag: number, text: string, runs: string, revision: number) => Promise<boolean>;
  detachNoteTextFormatting?: (tag: number) => Promise<void>;
};
const native = requireOptionalNativeModule<FormattingModule>('ChitsFiles');
export const nativeNoteFormattingAvailable = Platform.OS === 'android' && Boolean(native?.applyNoteTextFormatting && native.detachNoteTextFormatting);
let revision = 0;
export function syncNativeNoteFormatting(input: TextInput, block: Pick<NoteText, 'text' | 'spans' | 'heading'>, baseFamily?: string) {
  const tag = findNodeHandle(input);
  if (!tag || !nativeNoteFormattingAvailable) return;
  // Survives Fast Refresh while still ordering rapid actions in the same ms.
  revision = Math.max(Date.now() * 1000, revision + 1);
  void native?.applyNoteTextFormatting?.(tag, block.text, JSON.stringify(nativeNoteFormattingRuns(block, baseFamily)), revision).catch(() => undefined);
}
export function detachNativeNoteFormatting(input: TextInput) {
  const tag = findNodeHandle(input);
  if (tag && nativeNoteFormattingAvailable) void native?.detachNoteTextFormatting?.(tag).catch(() => undefined);
}
