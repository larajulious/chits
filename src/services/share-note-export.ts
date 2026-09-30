import type { View } from 'react-native';

import type { ExportFailureCode } from '@/services/attachment-export-naming';
import { SHARE_NOTE_FORMATS, type ShareNoteFormat } from '@/services/share-note';

export type ShareNoteSaveOutcome = { status: 'saved'; savedTo: string } | { status: 'cancelled' } | { status: 'failed'; code: ExportFailureCode };
export type ShareNoteImageFile = { uri: string; fileName: string; mimeType: 'image/png' | 'image/jpeg' };

// Share Note images are generated on device; the web preview has no capture.
export function shareNoteExportWidth(format: ShareNoteFormat): number {
  return SHARE_NOTE_FORMATS[format].width / 3;
}

export async function captureShareNote(_view: View, _format: ShareNoteFormat, _hasPhotos: boolean, _name?: string): Promise<ShareNoteImageFile> {
  throw new Error('Share Note is available in the Chits iOS and Android app.');
}

export async function saveShareNoteImage(_file: ShareNoteImageFile): Promise<ShareNoteSaveOutcome> {
  return { status: 'failed', code: 'failed' };
}

export async function shareShareNoteImage(_file: ShareNoteImageFile): Promise<boolean> {
  return false;
}

export function discardShareNoteImage(_file: ShareNoteImageFile | null) {}
