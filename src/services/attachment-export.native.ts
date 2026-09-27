import { Platform } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { ChitsFiles } from '../../modules/chits-attachments';
import type { AttachmentLike } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { downloadActionLabel, downloadMethod, exportFileName, exportMimeType, failureCodeFromNative, type ExportOutcome } from '@/services/attachment-export-naming';

export type { ExportOutcome } from '@/services/attachment-export-naming';

/** The Download action's label for this attachment on this platform ("Download", "Save to Photos", "Save to Files"). */
export function exportActionLabel(attachment: Pick<AttachmentLike, 'type'>): string {
  return downloadActionLabel(Platform.OS, attachment.type);
}

/**
 * "Download": saves a copy of a locally stored attachment onto the device.
 *  - Android 10+: one tap, straight into Download/Chits (no picker, no permission).
 *  - iOS photos/videos: one tap, straight into the Photos app (add-only access).
 *  - Otherwise (iOS documents/audio, Android 7–9): the system save screen,
 *    because iOS has no shared Downloads folder and older Android would need a
 *    storage permission.
 * Copy semantics only: the Chits original is never moved or re-encoded. Works
 * fully offline.
 */
export async function exportAttachment(attachment: AttachmentLike): Promise<ExportOutcome> {
  const log = (code: string, error?: unknown) => console.warn('[attachment-export] failed', { attachmentId: attachment.id, storagePath: attachment.storagePath, code, error });
  const uri = resolveAttachmentUri(attachment.storagePath);
  if (!uri) { log('invalid_uri'); return { status: 'failed', code: 'invalid_uri' }; }
  const info = await getInfoAsync(uri).catch(() => ({ exists: false }));
  if (!info.exists) { log('missing'); return { status: 'failed', code: 'missing' }; }
  const fileName = exportFileName(attachment);
  try {
    const mimeType = exportMimeType(attachment, fileName);
    const method = downloadMethod(Platform.OS, Platform.Version, attachment.type);
    if (method === 'downloads') {
      const result = await ChitsFiles.saveToDownloadsAsync(uri, fileName, mimeType);
      return result.status === 'saved' ? { status: 'saved', uri: result.uri, destination: 'downloads' } : { status: 'cancelled' };
    }
    if (method === 'photos') {
      const result = await ChitsFiles.saveToPhotosAsync(uri, fileName, attachment.type === 'video' ? 'video' : 'photo');
      return result.status === 'saved' ? { status: 'saved', destination: 'photos' } : { status: 'cancelled' };
    }
    const result = await ChitsFiles.exportAsync(uri, fileName, mimeType);
    return result.status === 'saved' ? { status: 'saved', uri: result.uri, destination: 'chosen' } : { status: 'cancelled' };
  } catch (error) {
    const code = failureCodeFromNative((error as { code?: unknown } | null)?.code);
    log(code, error);
    return { status: 'failed', code };
  }
}

/**
 * Opens the native share sheet for an attachment under its real filename (a
 * zero-byte hard link, so nothing is duplicated). Resolves false if the file
 * is missing or sharing isn't possible.
 */
export async function shareAttachment(attachment: AttachmentLike): Promise<boolean> {
  const uri = resolveAttachmentUri(attachment.storagePath);
  if (!uri || !(await getInfoAsync(uri).catch(() => ({ exists: false }))).exists) return false;
  try {
    if (!await Sharing.isAvailableAsync()) return false;
    const fileName = exportFileName(attachment);
    const named = await ChitsFiles.prepareNamedFileAsync(uri, fileName).catch(() => uri);
    await Sharing.shareAsync(named, { mimeType: exportMimeType(attachment, fileName), dialogTitle: fileName });
    return true;
  } catch (error) {
    console.warn('[attachment-share] failed', { attachmentId: attachment.id, error });
    return false;
  }
}
