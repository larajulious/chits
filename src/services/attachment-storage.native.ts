import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { copyAsync, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

import type { Attachment, AttachmentLike, MessageType } from '@/db/types';
import { ATTACHMENT_STORAGE_ROOT, normalizeStoredAttachmentPath } from '@/services/attachment-path';

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_EDGE = 2048;
const PHOTO_QUALITY = 0.82;

type AttachmentMetadata = Pick<AttachmentLike, 'type' | 'originalName' | 'mimeType' | 'size' | 'duration' | 'width' | 'height'>;

function documentsDirectory() {
  if (!documentDirectory) throw new Error('Chits could not access private device storage.');
  return documentDirectory;
}

function safeExtension(uri: string, mimeType: string | null) {
  const match = uri.match(/\.[a-z0-9]{1,8}(?:$|[?#])/i);
  if (match) return match[0].replace(/[?#]/g, '');
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'video/mp4') return '.mp4';
  if (mimeType === 'video/quicktime') return '.mov';
  if (mimeType?.startsWith('audio/')) return '.m4a';
  return '';
}

async function optimizePhoto(sourceUri: string, width: number | null, height: number | null) {
  const actions: Action[] = [];
  if (width && height && Math.max(width, height) > MAX_PHOTO_EDGE) {
    actions.push({ resize: width >= height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE } });
  }
  return manipulateAsync(sourceUri, actions, { compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
}

export function resolveAttachmentUri(storedPath: string): string | null {
  const storagePath = normalizeStoredAttachmentPath(storedPath);
  if (!storagePath) return null;
  return `${documentsDirectory()}${storagePath}`;
}

export async function attachmentExists(storedPath: string): Promise<boolean> {
  const uri = resolveAttachmentUri(storedPath);
  if (!uri) return false;
  return (await getInfoAsync(uri).catch(() => ({ exists: false }))).exists;
}

export async function deleteAttachment(storedPath: string): Promise<void> {
  const uri = resolveAttachmentUri(storedPath);
  if (!uri) return;
  await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export async function copyIntoAttachmentStorage(sourceUri: string, directory: string, details: AttachmentMetadata) {
  if (!sourceUri || !/^(file|content|ph|assets-library):\/\//i.test(sourceUri)) throw new Error('This attachment could not be read from your device.');
  const source = await getInfoAsync(sourceUri);
  if (!source.exists) throw new Error('The selected file is no longer available.');

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

  const safeDirectory = directory.split('/').filter((segment) => segment && segment !== '.' && segment !== '..').join('/');
  const storagePath = `${ATTACHMENT_STORAGE_ROOT}/${safeDirectory}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${safeExtension(preparedUri, preparedDetails.mimeType)}`;
  const destinationUri = resolveAttachmentUri(storagePath);
  if (!destinationUri) throw new Error('Chits could not prepare a safe attachment path.');
  const destinationDirectory = destinationUri.slice(0, destinationUri.lastIndexOf('/') + 1);
  try {
    await makeDirectoryAsync(destinationDirectory, { intermediates: true });
    await copyAsync({ from: preparedUri, to: destinationUri });
    const persisted = await getInfoAsync(destinationUri);
    if (!persisted.exists) throw new Error('Chits could not save this attachment.');
    const persistedSize = 'size' in persisted ? persisted.size : preparedSize;
    return { attachment: { ...preparedDetails, storagePath, size: persistedSize }, remove: () => deleteAttachment(storagePath) };
  } catch (error) {
    await deleteAsync(destinationUri, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    if (optimizedUri) await deleteAsync(optimizedUri, { idempotent: true }).catch(() => undefined);
  }
}

function messageDirectory(type: MessageType) {
  if (type === 'audio') return 'audio';
  if (type === 'file') return 'files';
  return 'chat';
}

export async function persistAttachment(sourceUri: string, details: Omit<Attachment, 'id' | 'messageId' | 'createdAt' | 'storagePath'>) {
  return copyIntoAttachmentStorage(sourceUri, messageDirectory(details.type), details);
}
