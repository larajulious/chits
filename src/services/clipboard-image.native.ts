import { tr } from '@/localization/runtime';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { cacheDirectory, deleteAsync, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';

import { copyIntoAttachmentStorage } from '@/services/attachment-storage';
import { imageFingerprint, type NoteImageDetails } from '@/services/note-content';

export type PastedImage = { image: NoteImageDetails; fingerprint: string; remove: () => Promise<void> };

const DATA_URI = /^data:image\/(png|jpeg);base64,/;

/**
 * Whether the system clipboard holds an image right now. A TextInput can't
 * receive image data from a paste on either platform, so the note editors show
 * their own "Paste image" action while this is true. Checking never reads the
 * image itself (no iOS paste prompt): it re-checks when the editor opens, when
 * the clipboard changes and when Chits returns to the foreground.
 */
export function useClipboardHasImage(active: boolean) {
  const [hasImage, setHasImage] = useState(false);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const check = () => { void Clipboard.hasImageAsync().then((value) => { if (current) setHasImage(value); }, () => { if (current) setHasImage(false); }); };
    check();
    const clipboard = Clipboard.addClipboardListener(check);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { current = false; clipboard.remove(); appState.remove(); };
  }, [active]);
  return active && hasImage;
}

/**
 * Copies the clipboard's image into Chits storage — the clipboard's own data is
 * temporary, so nothing points at it. It's written as a PNG (lossless, so a
 * screenshot's text survives), then goes through the same optimizer as every
 * other photo (longest edge ≤ 2048, JPEG): readable, and nowhere near the size
 * of a raw paste. The result is staged, not saved: `remove` deletes it again if
 * the note is discarded. Throws an Error with a message for the user.
 */
export async function pasteClipboardImage(): Promise<PastedImage> {
  let clip: Clipboard.ClipboardImage | null;
  try {
    clip = await Clipboard.getImageAsync({ format: 'png' });
  } catch {
    throw new Error(tr("clipboardimage.chitsCouldnTReadTheImageOnYour"));
  }
  const match = clip?.data.match(DATA_URI);
  if (!clip || !match) throw new Error(tr("clipboardimage.thereSNoImageOnYourClipboardTo"));
  if (!cacheDirectory) throw new Error(tr("attachmentstorage.chitsCouldNotAccessPrivateDeviceStorage"));
  const base64 = clip.data.slice(match[0].length);
  const temporary = `${cacheDirectory}chits-paste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${match[1] === 'png' ? 'png' : 'jpg'}`;
  try {
    await writeAsStringAsync(temporary, base64, { encoding: EncodingType.Base64 });
    const width = Math.round(clip.size.width) || null;
    const height = Math.round(clip.size.height) || null;
    const staged = await copyIntoAttachmentStorage(temporary, 'chat', { type: 'photo', originalName: "Pasted image.jpg", mimeType: `image/${match[1]}`, size: null, duration: null, width, height });
    const { storagePath, originalName, mimeType, size } = staged.attachment;
    return { image: { storagePath, originalName, mimeType, size, width: staged.attachment.width ?? width, height: staged.attachment.height ?? height }, fingerprint: imageFingerprint(base64), remove: staged.remove };
  } catch (error) {
    console.warn('[clipboard-image]', { operation: 'paste', error: error instanceof Error ? error.message : tr("attachmentimport.unknownError") });
    throw new Error(tr("clipboardimage.thatImageCouldnTBePastedTryCopying"));
  } finally {
    await deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
  }
}
