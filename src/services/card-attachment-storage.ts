import type { CardAttachment } from '@/db/types';

// Native devices resolve card-attachment-storage.native.ts; this protects static web rendering.
export async function persistCardAttachment(_cardId: string, _sourceUri: string, __: Omit<CardAttachment, 'id' | 'cardId' | 'createdAt' | 'updatedAt' | 'localUri'>): Promise<never> {
  throw new Error('Attachments are available in the native Chits app.');
}

export async function removeCardAttachmentFile(_localUri: string): Promise<void> {}
