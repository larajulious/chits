import { normalizeStoredAttachmentPath } from './attachment-path';

export const CHAT_BACKGROUND_KEY = 'chat_background';
export const DEFAULT_BACKGROUND_DIM = 0.35;
export type ChatBackgroundImage = {
  storagePath: string;
  // Device photos have their own asset; attachment photos keep the original reference.
  source: 'attachment' | 'device';
  attachmentId: string | null;
  deviceAssetId?: string;
  deviceImageHash?: string;
};
export type ChatBackground = ChatBackgroundImage & { dim: number; blur: boolean };

export function backgroundDim(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(0.85, value)) : DEFAULT_BACKGROUND_DIM;
}

export function parseChatBackground(value: string | null | undefined): ChatBackground | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value);
    const storagePath = normalizeStoredAttachmentPath(candidate.storagePath);
    if (!storagePath?.startsWith('chits-attachments/') || !['attachment', 'device'].includes(candidate.source)) return null;
    if (candidate.source === 'attachment' && typeof candidate.attachmentId !== 'string') return null;
    if (candidate.source === 'device' && !storagePath.startsWith('chits-attachments/backgrounds/')) return null;
    return { storagePath, source: candidate.source, attachmentId: candidate.source === 'attachment' ? candidate.attachmentId : null, ...(candidate.source === 'device' && typeof candidate.deviceAssetId === 'string' ? { deviceAssetId: candidate.deviceAssetId } : {}), ...(candidate.source === 'device' && typeof candidate.deviceImageHash === 'string' && /^[a-f0-9]{32}$/.test(candidate.deviceImageHash) ? { deviceImageHash: candidate.deviceImageHash } : {}), dim: backgroundDim(candidate.dim), blur: candidate.blur === true };
  } catch { return null; }
}

export function deviceBackgroundMatches(background: ChatBackground | null, assetId?: string | null, imageHash?: string | null) {
  return background?.source === 'device' && Boolean((assetId && background.deviceAssetId === assetId) || (imageHash && background.deviceImageHash === imageHash));
}

export function attachmentBackgroundImage(attachment: { id: string; type: string; storagePath: string }): ChatBackgroundImage {
  const storagePath = normalizeStoredAttachmentPath(attachment.storagePath);
  if (attachment.type !== 'photo' || !storagePath?.startsWith('chits-attachments/')) throw new Error('Choose a photo saved in Chits.');
  return { storagePath, source: 'attachment', attachmentId: attachment.id };
}

const listeners = new Set<() => void>();
export function notifyChatBackgroundChanged() { for (const listener of listeners) listener(); }
export function subscribeToChatBackgroundChanges(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
