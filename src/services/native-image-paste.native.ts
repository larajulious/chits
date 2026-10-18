import { requireOptionalNativeModule } from 'expo';
import { findNodeHandle, type TextInput } from 'react-native';
import type { NoteCursor } from '@/services/note-content';

type PasteEvent = NonNullable<NoteCursor> & { kind?: 'paste' | 'pick' | 'backspace' };
type PasteModule = {
  attachInlinePaste?: (tag: number, key: string) => Promise<boolean>;
  detachInlinePaste?: (tag: number) => Promise<void>;
  addListener: (name: string, callback: (event: PasteEvent) => void) => { remove: () => void };
};
const pending = new Map<number, Promise<unknown>>();
const native = requireOptionalNativeModule<PasteModule>('ChitsFiles');

export function bindNativeImagePaste(input: TextInput, key: string): () => void {
  const tag = findNodeHandle(input);
  if (!tag || !native?.attachInlinePaste || !native.detachInlinePaste) return () => {};
  // Serialize detach after attach, including unmount before native registration completes.
  const attached = (pending.get(tag) ?? Promise.resolve()).then(() => native.attachInlinePaste?.(tag, key)).catch(() => false);
  pending.set(tag, attached);
  return () => {
    const detached = attached.then(() => native.detachInlinePaste?.(tag)).catch(() => undefined);
    pending.set(tag, detached);
    void detached.finally(() => { if (pending.get(tag) === detached) pending.delete(tag); });
  };
}
export function subscribeNativeImagePaste(callback: (cursor: NonNullable<NoteCursor> & { kind?: 'paste' | 'pick' }) => void) {
  if (!native?.attachInlinePaste) return () => {};
  const subscription = native.addListener('inlineImagePaste', (event) => { if (event.kind !== 'backspace') callback({ ...event, kind: event.kind }); });
  return () => subscription.remove();
}

export function subscribeNativeBoundaryBackspace(callback: (cursor: NonNullable<NoteCursor>) => void) {
  if (!native?.attachInlinePaste) return () => {};
  const subscription = native.addListener('inlineImagePaste', (event) => { if (event.kind === 'backspace') callback(event); });
  return () => subscription.remove();
}
