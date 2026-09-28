import { createContext, useContext } from 'react';
import type { AttachmentLike } from '@/db/types';
import type { ChatBackground, ChatBackgroundImage } from '@/services/chat-background';

type ChatBackgroundContextValue = {
  background: ChatBackground | null;
  applyBackground: (value: ChatBackground) => Promise<void>;
  removeBackground: () => Promise<void>;
  openBackgroundPreview: (image: ChatBackgroundImage, onApplied?: () => void) => void;
  isCurrentBackground: (image: Pick<AttachmentLike, 'storagePath'>) => boolean;
};

export const ChatBackgroundContext = createContext<ChatBackgroundContextValue | null>(null);

export function useChatBackground() {
  const context = useContext(ChatBackgroundContext);
  if (!context) throw new Error('ChatBackgroundProvider is missing.');
  return context;
}
