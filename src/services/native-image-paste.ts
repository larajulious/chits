import type { TextInput } from 'react-native';
import type { NoteCursor } from '@/services/note-content';
export function bindNativeImagePaste(_input: TextInput, _key: string): () => void { return () => {}; }
export function subscribeNativeImagePaste(_callback: (cursor: NonNullable<NoteCursor> & { kind?: 'paste' | 'pick' }) => void): () => void { return () => {}; }
