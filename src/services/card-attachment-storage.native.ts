import type { CardAttachment } from '@/db/types';
import { copyIntoAttachmentStorage, deleteAttachment } from '@/services/attachment-storage';

export async function persistCardAttachment(cardId: string, sourceUri: string, details: Omit<CardAttachment, 'id' | 'cardId' | 'createdAt' | 'updatedAt' | 'storagePath'>) {
  const persisted = await copyIntoAttachmentStorage(sourceUri, `cards/${cardId}`, details);
  return { ...persisted, attachment: { ...persisted.attachment, type: details.type } };
}

export async function removeCardAttachmentFile(storagePath: string) {
  await deleteAttachment(storagePath);
}
