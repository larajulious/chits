import type { Attachment } from '@/db/types';

// Native devices resolve attachment-storage.native.ts; this protects static web rendering.
export async function persistAttachment(_: string, __: Omit<Attachment, 'id' | 'messageId' | 'createdAt' | 'localUri'>): Promise<never> {
  throw new Error('Attachments are available in the native Chits app.');
}
