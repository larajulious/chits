import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useChatBackground } from '@/components/chat/chat-background-context';
import { createAttachmentRepository } from '@/db/repositories';
import { deleteAttachment } from '@/services/attachment-storage';
import type { AttachmentLike } from '@/db/types';

export function useAttachmentDeletion() {
  useLocale();
  const database = useSQLiteContext();
  const { confirm } = useAppDialog();
  const { isCurrentBackground } = useChatBackground();
  const [status, setStatus] = useState<string | null>(null);
  const confirmDelete = (attachment: AttachmentLike, onDeleted?: () => void) => {
    const current = isCurrentBackground(attachment);
    confirm({ type: 'destructive', icon: 'trash-outline', title: current ? tr("useattachmentdeletion.thisPhotoIsCurrentlyYourChatBackground") : tr("useattachmentdeletion.deleteAttachment"), message: current ? tr("useattachmentdeletion.removingThisPhotoRestoresTheDefaultChatBackground") : tr("useattachmentdeletion.thisAttachmentWillBeRemovedFromChitsThis"), confirmText: current ? tr("chat.removeBackgroundDelete") : tr("attachments.deleteAttachment"), onConfirm: async () => {
      setStatus(null);
      try {
        const paths = await createAttachmentRepository(database).delete(attachment);
        await Promise.all(paths.map(deleteAttachment));
        onDeleted?.();
      } catch { setStatus(tr("useattachmentdeletion.chitsCouldNotDeleteThatAttachmentPleaseTry")); throw new Error(tr("useattachmentdeletion.attachmentDeletionFailed")); }
    } });
  };
  return { confirmDelete, status };
}
