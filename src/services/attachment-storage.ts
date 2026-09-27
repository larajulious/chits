import type { Attachment, AttachmentLike } from '@/db/types';

export function resolveAttachmentUri(_storedPath: string): string | null { return null; }
export async function attachmentExists(_storedPath: string): Promise<boolean> { return false; }
export async function deleteAttachment(_storedPath: string): Promise<void> {}
export async function copyIntoAttachmentStorage(_sourceUri: string, _directory: string, _details: Pick<AttachmentLike, 'type' | 'originalName' | 'mimeType' | 'size' | 'duration' | 'width' | 'height'>): Promise<never> {
  throw new Error('Attachments are available in the native Chits app.');
}
export async function persistAttachment(_: string, __: Omit<Attachment, 'id' | 'messageId' | 'createdAt' | 'storagePath'>): Promise<never> {
  throw new Error('Attachments are available in the native Chits app.');
}
