import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { AttachmentLike } from '@/db/types';

// Route-export fallback. Attachments are stored by the native app only, so the
// web build shows no attachment list; native resolves note-attachment-list.native.tsx.
export type NoteAttachmentItem = { key: string; attachment: AttachmentLike; saved: boolean };

export function NoteAttachmentList(_: { items: NoteAttachmentItem[]; onRemove: (item: NoteAttachmentItem) => void; onError: (message: string) => void; disabled?: boolean; footer: ReactNode; style?: StyleProp<ViewStyle> }) {
  return null;
}

export function NoteAttachmentAddRow(_: { label: string; disabled: boolean; onPress: () => void }) {
  return null;
}

export function NoteAttachmentToggle(_: { count: number; open: boolean; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return null;
}
