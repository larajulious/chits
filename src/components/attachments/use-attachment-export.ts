import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

import { showPermissionSettingsPrompt } from '@/components/permissions/permission-settings-prompt';
import type { AttachmentLike } from '@/db/types';
import { exportAttachment } from '@/services/attachment-export';
import { exportFeedback } from '@/services/attachment-export-naming';

const PREPARING_DELAY_MS = 350;
const FEEDBACK_MS = 2400;

/**
 * Shared Download / Save to Files state for any screen or viewer. `status` is
 * the one line to show in a Toast: "Saving file…" only if the work takes
 * long enough to notice (the system picker normally opens instantly), then the
 * outcome — nothing at all when the user cancels.
 */
export function useAttachmentExport() {
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const run = useCallback(async (attachment: AttachmentLike) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    const timer = setTimeout(() => setPreparing(true), PREPARING_DELAY_MS);
    try {
      const outcome = await exportAttachment(attachment);
      if (outcome.status === 'saved') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Photos access was declined on an earlier attempt and the user tried
      // again: offer Settings. (Declining the prompt itself comes back as a cancel.)
      if (outcome.status === 'failed' && outcome.code === 'permission') showPermissionSettingsPrompt('photos');
      setFeedback(exportFeedback(outcome));
    } finally {
      clearTimeout(timer);
      busyRef.current = false;
      setBusy(false);
      setPreparing(false);
    }
  }, []);

  return { exportAttachment: run, busy, status: preparing ? 'Saving file…' : feedback };
}
