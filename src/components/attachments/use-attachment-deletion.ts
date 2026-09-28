import { useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useChatBackground } from '@/components/chat/chat-background-provider';
import { createAttachmentRepository } from '@/db/repositories';
import { deleteAttachment } from '@/services/attachment-storage';
import type { AttachmentLike } from '@/db/types';

export function useAttachmentDeletion() {
  const database = useSQLiteContext();
  const { confirm } = useAppDialog();
  const { isCurrentBackground } = useChatBackground();
  const [status, setStatus] = useState<string | null>(null);
  const confirmDelete = (attachment: AttachmentLike, onDeleted?: () => void) => {
    const current = isCurrentBackground(attachment);
    confirm({ type: 'destructive', icon: 'trash-outline', title: current ? 'This photo is currently your chat background.' : 'Delete attachment?', message: current ? 'Removing this photo restores the default chat background.' : 'This attachment will be removed from Chits. This can’t be undone.', confirmText: current ? 'Remove Background & Delete' : 'Delete Attachment', onConfirm: async () => {
      setStatus(null);
      try {
        const paths = await createAttachmentRepository(database).delete(attachment);
        await Promise.all(paths.map(deleteAttachment));
        onDeleted?.();
      } catch { setStatus('Chits could not delete that attachment. Please try again.'); throw new Error('Attachment deletion failed'); }
    } });
  };
  return { confirmDelete, status };
}
