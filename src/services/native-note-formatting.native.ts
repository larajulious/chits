import { requireOptionalNativeModule } from 'expo';
import { findNodeHandle, Platform, type TextInput } from 'react-native';
import type { NoteText } from './note-content';
import { nativeNoteFormattingRuns } from './note-native-formatting-data';

type FormattingModule = {
  applyNoteTextFormatting?: (tag: number, text: string, runs: string, revision: number) => Promise<boolean>;
  detachNoteTextFormatting?: (tag: number) => Promise<void>;
  showNoteKeyboard?: (tag: number, revision: number) => Promise<boolean>;
  cancelNoteKeyboard?: (tag: number, revision: number) => Promise<void>;
};
const native = requireOptionalNativeModule<FormattingModule>('ChitsFiles');
export const nativeNoteFormattingAvailable = Platform.OS === 'android' && Boolean(native?.applyNoteTextFormatting && native.detachNoteTextFormatting);
let revision = 0;
const nextRevision = () => { revision = Math.max(Date.now() * 1000, revision + 1); return revision; };
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
/** Opening the IME must also work when a formatting gesture already focused
 * the input with its soft keyboard suppressed. It must not blur that selection. */
export function showNativeNoteKeyboard(input: TextInput) {
  const tag = findNodeHandle(input);
  if (tag && Platform.OS === 'android' && native?.showNoteKeyboard && native.cancelNoteKeyboard) {
    void native.showNoteKeyboard(tag, nextRevision()).catch(() => undefined);
  } else {
    if (Platform.OS === 'android' && input.isFocused()) input.blur();
    input.focus();
  }
}
export function cancelNativeNoteKeyboard(input: TextInput) {
  const tag = findNodeHandle(input);
  if (tag && Platform.OS === 'android' && native?.cancelNoteKeyboard) void native.cancelNoteKeyboard(tag, nextRevision()).catch(() => undefined);
}
