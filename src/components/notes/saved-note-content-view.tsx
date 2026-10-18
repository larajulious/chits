import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import type { Message } from '@/db/types';
import { createMessageRepository } from '@/db/repositories';
import { noteRenderContent, serializeNoteContent } from '@/services/note-content';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { NoteContentView } from './note-content-view';

/** Saved readers write only the tapped state, guarded against a stale note. */
export function SavedNoteContentView({ message, ...props }: Omit<ComponentProps<typeof NoteContentView>, 'onToggleChecklist'> & { message: Message }) {
  const database = useSQLiteContext();
  const repository = useMemo(() => createMessageRepository(database), [database]);
  const [local, setLocal] = useState<{ source: Message; value: Message } | null>(null);
  const current = local?.source === message ? local.value : message;
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let revision = 0;
    const stop = subscribeToNoteChanges((id) => {
      if (id !== message.id) return;
      const request = ++revision;
      void repository.getActiveById(id).then((next) => {
        if (mounted.current && request === revision && next) setLocal({ source: message, value: next });
      }).catch(() => undefined);
    });
    return () => { mounted.current = false; stop(); };
  }, [message, repository]);
  const toggle = async (key: string) => {
    if (busy.current) return;
    const index = /^t(\d+)$/.exec(key)?.[1];
    const block = index === undefined ? null : current.content?.[Number(index)];
    const expected = serializeNoteContent(current.content ?? []);
    if (block?.type !== 'text' || block.list?.kind !== 'checklist' || !expected) return;
    busy.current = true;
    try {
      const result = await repository.setChecklistChecked(current.id, Number(index), !block.list.checked, expected);
      if (mounted.current) setLocal({ source: message, value: { ...current, ...result } });
    } catch (cause) {
      if (mounted.current) Alert.alert('Checklist could not be updated', cause instanceof Error ? cause.message : 'Try again.');
    } finally { busy.current = false; }
  };
  return <NoteContentView {...props} blocks={noteRenderContent(current)?.blocks ?? props.blocks} onToggleChecklist={(key) => { void toggle(key); }} />;
}
