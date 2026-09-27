import type { Attachment, MessageType } from '@/db/types';

export type AttachmentDraft = {
  attachment: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>;
  remove: () => Promise<void>;
};

// Attachments are stored locally by the native app only.
const unavailable = () => Promise.reject(new Error('Attachments are available in the native Chits app.'));
export function stageAttachment(_uri: string, _type: MessageType, _metadata: unknown): Promise<AttachmentDraft> { return unavailable(); }
export function pickAndStageMedia(_type: 'photo' | 'video'): Promise<AttachmentDraft | null> { return unavailable(); }
export function pickAndStageFile(): Promise<AttachmentDraft | null> { return unavailable(); }
