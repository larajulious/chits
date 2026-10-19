import { tr } from '@/localization/runtime';
import type { NoteImageDetails } from '@/services/note-content';

export type PastedImage = { image: NoteImageDetails; fingerprint: string; remove: () => Promise<void> };

// Pasted images are stored locally by the native app only.
export function useClipboardHasImage(_active: boolean) {
  return false; }
export function pasteClipboardImage(): Promise<PastedImage> { return Promise.reject(new Error(tr("clipboardimage.pastingImagesIsAvailableInTheNativeChits"))); }
