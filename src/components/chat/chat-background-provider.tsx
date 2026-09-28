import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Modal } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { attachmentExists, deleteAttachment } from '@/services/attachment-storage';
import { readChatBackground, removeChatBackground, writeChatBackground } from '@/db/chat-background';
import { attachmentBackgroundImage, subscribeToChatBackgroundChanges, type ChatBackground, type ChatBackgroundImage } from '@/services/chat-background';
import type { AttachmentLike } from '@/db/types';
import { dismissKeyboardAsync } from '@/services/keyboard';
import { ChatBackgroundPreview } from './chat-background-preview';

type Context = {
  background: ChatBackground | null;
  applyBackground: (value: ChatBackground) => Promise<void>;
  removeBackground: () => Promise<void>;
  openBackgroundPreview: (image: ChatBackgroundImage, onApplied?: () => void) => void;
  isCurrentBackground: (image: Pick<AttachmentLike, 'storagePath'>) => boolean;
};
const BackgroundContext = createContext<Context | null>(null);
export function ChatBackgroundProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const [background, setBackground] = useState<ChatBackground | null>(null);
  const [preview, setPreview] = useState<{ image: ChatBackgroundImage; onApplied?: () => void } | null>(null);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++revision.current;
    const saved = await readChatBackground(database);
    const available = saved ? await attachmentExists(saved.storagePath) : false;
    if (token !== revision.current) return;
    // A missing file uses the default surface; keep the reference recoverable.
    setBackground(available ? saved : null);
  }, [database]);
  useEffect(() => {
    const reload = () => void refresh().catch(() => undefined);
    reload();
    const unsubscribe = subscribeToChatBackgroundChanges(reload);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') reload(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate in-flight reads, not a mounted view ref.
    return () => { revision.current++; unsubscribe(); subscription.remove(); };
  }, [refresh]);
  const applyBackground = useCallback(async (next: ChatBackground) => {
    if (!await attachmentExists(next.storagePath)) throw new Error('This photo is no longer available.');
    const previous = await writeChatBackground(database, next);
    revision.current++;
    setBackground(next);
    if (previous?.source === 'device' && previous.storagePath !== next.storagePath) await deleteAttachment(previous.storagePath);
  }, [database]);
  const removeBackground = useCallback(async () => {
    const previous = await removeChatBackground(database);
    revision.current++;
    setBackground(null);
    if (previous?.source === 'device') await deleteAttachment(previous.storagePath);
  }, [database]);
  const openBackgroundPreview = useCallback((image: ChatBackgroundImage, onApplied?: () => void) => { void dismissKeyboardAsync().then(() => setPreview({ image, onApplied })); }, []);
  const value = useMemo(() => ({ background, applyBackground, removeBackground, openBackgroundPreview, isCurrentBackground: (image: Pick<AttachmentLike, 'storagePath'>) => background?.storagePath === image.storagePath }), [background, applyBackground, removeBackground, openBackgroundPreview]);
  return <BackgroundContext.Provider value={value}>{children}
    <Modal visible={preview !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPreview(null)}>
      <SafeAreaProvider>{preview ? <ChatBackgroundPreview image={preview.image} onCancel={() => setPreview(null)} onApplied={() => { setPreview(null); preview.onApplied?.(); }} /> : null}</SafeAreaProvider>
    </Modal>
  </BackgroundContext.Provider>;
}
export function useChatBackground() { const context = useContext(BackgroundContext); if (!context) throw new Error('ChatBackgroundProvider is missing.'); return context; }
export { attachmentBackgroundImage };
