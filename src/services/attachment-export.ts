import type { AttachmentLike } from '@/db/types';
import type { ExportOutcome } from '@/services/attachment-export-naming';

export type { ExportOutcome } from '@/services/attachment-export-naming';

export function exportActionLabel(_: Pick<AttachmentLike, 'type'>): string {
  return 'Download';
}

// Attachments only exist in the native app's local storage.
export async function exportAttachment(_: AttachmentLike): Promise<ExportOutcome> {
  return { status: 'failed', code: 'failed' };
}

export async function shareAttachment(_: AttachmentLike): Promise<boolean> {
  return false;
}
