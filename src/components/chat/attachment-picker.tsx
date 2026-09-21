import type { Attachment } from '@/db/types';

export type AttachmentDraft = {
  attachment: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>;
  remove: () => Promise<void>;
};
export type AttachmentPickerHandle = { startAudio: () => void };

// Route-export fallback. Native devices resolve attachment-picker.native.tsx.
export function AttachmentPicker(_: { disabled?: boolean; onSelected: (draft: AttachmentDraft) => void; onError: (message: string) => void }) {
  return null;
}
