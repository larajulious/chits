import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { copyAsync, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

import type { CardAttachment } from '@/db/types';

// Mirrors attachment-storage.native.ts (chat message attachments) exactly, just
// scoped to a card's own subfolder — `chits-attachments/cards/{cardId}/` — rather
// than the flat message-attachments directory, per the card-attachment directory
// convention. Both directories still live under the one `chits-attachments/` root
// backup-service.native.ts already copies wholesale, so card attachments are
// covered by backup/restore without any changes there beyond rewriting
// card_attachments.local_uri the same way it already rewrites attachments.local_uri.
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_EDGE = 2048;
const PHOTO_QUALITY = 0.82;

function safeExtension(uri: string, mimeType: string | null) {
  const match = uri.match(/\.[a-z0-9]{1,8}(?:$|[?#])/i);
  if (match) return match[0].replace(/[?#]/g, '');
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'video/mp4') return '.mp4';
  if (mimeType === 'video/quicktime') return '.mov';
  return '';
}

async function optimizePhoto(sourceUri: string, width: number | null, height: number | null) {
  const actions: Action[] = [];
  if (width && height && Math.max(width, height) > MAX_PHOTO_EDGE) {
    actions.push({ resize: width >= height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE } });
  }
  return manipulateAsync(sourceUri, actions, { compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
}

export async function persistCardAttachment(cardId: string, sourceUri: string, details: Omit<CardAttachment, 'id' | 'cardId' | 'createdAt' | 'updatedAt' | 'localUri'>) {
  if (!sourceUri || !/^(file|content|ph|assets-library):\/\//i.test(sourceUri)) throw new Error('This attachment could not be read from your device.');
  if (!documentDirectory) throw new Error('Chits could not access private device storage.');
  const source = await getInfoAsync(sourceUri);
  if (!source.exists) throw new Error('The selected file is no longer available.');
  const attachmentDirectory = `${documentDirectory}chits-attachments/cards/${cardId}/`;
  let preparedUri = sourceUri;
  let preparedDetails = details;
  let optimizedUri: string | null = null;
  if (details.type === 'photo') {
    const optimized = await optimizePhoto(sourceUri, details.width, details.height);
    optimizedUri = optimized.uri;
    preparedUri = optimized.uri;
    preparedDetails = { ...details, mimeType: 'image/jpeg', size: null, width: optimized.width, height: optimized.height };
  }
  const prepared = await getInfoAsync(preparedUri);
  const preparedSize = prepared.exists && 'size' in prepared ? prepared.size : null;
  if (preparedSize && preparedSize > MAX_ATTACHMENT_BYTES) {
    if (optimizedUri) await deleteAsync(optimizedUri, { idempotent: true }).catch(() => undefined);
    throw new Error('Attachments must be 100 MB or smaller.');
  }
  const localUri = `${attachmentDirectory}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${safeExtension(preparedUri, preparedDetails.mimeType)}`;
  try {
    await makeDirectoryAsync(attachmentDirectory, { intermediates: true });
    await copyAsync({ from: preparedUri, to: localUri });
    const persisted = await getInfoAsync(localUri);
    if (!persisted.exists) throw new Error('Chits could not save this attachment.');
    const persistedSize = 'size' in persisted ? persisted.size : preparedSize;
    return { attachment: { ...preparedDetails, localUri, size: persistedSize }, remove: () => deleteAsync(localUri, { idempotent: true }) };
  } catch (error) {
    await deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    if (optimizedUri) await deleteAsync(optimizedUri, { idempotent: true }).catch(() => undefined);
  }
}

export async function removeCardAttachmentFile(localUri: string) {
  await deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
}
