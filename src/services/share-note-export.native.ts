import { PixelRatio, Platform, type View } from 'react-native';
import { deleteAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { ChitsFiles } from '../../modules/chits-attachments';
import { ensurePhotosAddPermission } from '@/services/permissions';
import { failureCodeFromNative, type ExportFailureCode } from '@/services/attachment-export-naming';
import { SHARE_NOTE_FORMATS, shareNoteFileName, type ShareNoteFormat } from '@/services/share-note';

/** `savedTo` is the confirmation to show: where the image can now be found. */
export type ShareNoteSaveOutcome = { status: 'saved'; savedTo: string } | { status: 'cancelled' } | { status: 'failed'; code: ExportFailureCode };

export type ShareNoteImageFile = { uri: string; fileName: string; mimeType: 'image/png' | 'image/jpeg' };

/**
 * The width, in points, to draw the export canvas at so that it is exactly the
 * format's pixel width on this screen (1080 / pixel ratio). The capture then
 * copies pixels 1:1 — no resampling, so text stays crisp.
 */
export function shareNoteExportWidth(format: ShareNoteFormat): number {
  return SHARE_NOTE_FORMATS[format].width / PixelRatio.get();
}

/**
 * Renders the (off-screen) export canvas into a real image file under a
 * friendly name. Text-only notes are lossless PNG; with photos, a high-quality
 * JPEG keeps the file a sensible size.
 */
export async function captureShareNote(view: View, format: ShareNoteFormat, hasPhotos: boolean, name?: string): Promise<ShareNoteImageFile> {
  const { width, height } = SHARE_NOTE_FORMATS[format];
  const scale = PixelRatio.get();
  const extension = hasPhotos ? 'jpg' : 'png';
  const raw = await captureRef(view, {
    format: extension, quality: hasPhotos ? 0.94 : 1, result: 'tmpfile',
    // iOS sizes the capture in points (rendered at screen scale); Android in pixels.
    ...(Platform.OS === 'ios' ? { width: width / scale, height: height / scale } : { width, height }),
  });
  const fileName = shareNoteFileName(new Date(), extension, name);
  const named = await ChitsFiles.prepareNamedFileAsync(raw, fileName).catch(() => raw);
  if (named !== raw) releaseCapture(raw);
  return { uri: named, fileName, mimeType: hasPhotos ? 'image/jpeg' : 'image/png' };
}

/**
 * Saves the image where people look for pictures: the Photos app on iOS
 * (add-only access), Pictures/Chits on Android 10+ (no permission), and the
 * system save screen on older Android.
 */
export async function saveShareNoteImage(file: ShareNoteImageFile): Promise<ShareNoteSaveOutcome> {
  try {
    if (Platform.OS === 'ios') {
      const access = await ensurePhotosAddPermission();
      if (access === 'denied') return { status: 'cancelled' };
      if (access === 'blocked') return { status: 'failed', code: 'permission' };
      const result = await ChitsFiles.saveToPhotosAsync(file.uri, file.fileName, 'photo');
      return result.status === 'saved' ? { status: 'saved', savedTo: 'Image saved to Photos' } : { status: 'cancelled' };
    }
    if (Number(Platform.Version) >= 29) {
      const result = await ChitsFiles.saveToPicturesAsync(file.uri, file.fileName, file.mimeType);
      return result.status === 'saved' ? { status: 'saved', savedTo: 'Image saved to Pictures/Chits' } : { status: 'cancelled' };
    }
    const result = await ChitsFiles.exportAsync(file.uri, file.fileName, file.mimeType);
    return result.status === 'saved' ? { status: 'saved', savedTo: 'Image saved' } : { status: 'cancelled' };
  } catch (error) {
    const code = failureCodeFromNative((error as { code?: unknown } | null)?.code);
    console.warn('[share-note] save failed', { code, error });
    return { status: 'failed', code };
  }
}

/** Opens the native share sheet with the image. Resolves false when sharing isn't possible. */
export async function shareShareNoteImage(file: ShareNoteImageFile): Promise<boolean> {
  try {
    if (!await Sharing.isAvailableAsync()) return false;
    await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, UTI: file.mimeType === 'image/png' ? 'public.png' : 'public.jpeg', dialogTitle: 'Share Note' });
    return true;
  } catch (error) {
    console.warn('[share-note] share failed', { error });
    return false;
  }
}

/** Removes a generated image once it's no longer needed (the saved/shared copies are separate). */
export function discardShareNoteImage(file: ShareNoteImageFile | null) {
  if (file) void deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
}
