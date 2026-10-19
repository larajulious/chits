import { tr } from '@/localization/runtime';
import type { CardAttachment } from '@/db/types';

// Native devices resolve card-attachment-storage.native.ts; this protects static web rendering.
export async function persistCardAttachment(_cardId: string, _sourceUri: string, __: Omit<CardAttachment, 'id' | 'cardId' | 'createdAt' | 'updatedAt' | 'storagePath'>): Promise<never> {
  throw new Error(tr("attachmentimport.attachmentsAreAvailableInTheNativeChitsApp"));
}

export async function removeCardAttachmentFile(_storagePath: string): Promise<void> {}
