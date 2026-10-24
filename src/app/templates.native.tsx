import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen, EmptyState } from '@/components/ui/primitives';
import { useDesk } from '@/components/desk/paper-desk';
import { AddNoteSheet } from '@/components/boards/add-note-sheet';
import { TemplateLibrary, type TemplateLibraryHandle } from '@/features/templates/template-library';
import { createMessageRepository } from '@/db/repositories';
import { templateFromNote } from '@/services/note-templates';
import type { NoteText, NoteDraftBlock } from '@/services/note-content';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

export default function TemplatesScreen() {
  'use no memo';
  useLocale();
  const { sourceMessageId } = useLocalSearchParams<{ sourceMessageId?: string }>();
  const database = useSQLiteContext();
  const repository = useMemo(() => createMessageRepository(database), [database]);
  const [source, setSource] = useState<{ document: NoteText[]; title: string } | null | undefined>(sourceMessageId ? undefined : null);
  const [loading, setLoading] = useState(Boolean(sourceMessageId));
  const [draft, setDraft] = useState<NoteDraftBlock[] | undefined>();
  const library = useRef<TemplateLibraryHandle>(null);
  const navigation = useNavigation();
  const desk = useDesk();
  const leaving = useRef(false);
  const close = () => { leaving.current = true; router.back(); };
  useEffect(() => {
    let active = true;
    if (!sourceMessageId) return;
    void repository.getActiveById(sourceMessageId).then((message) => {
      if (!active) return;
      if (!message || message.isHiddenContent) { setSource(undefined); return; }
      setSource({ document: templateFromNote(message), title: (message.text?.split('\n')[0] ?? '').slice(0,120) });
    }).catch(() => { if (active) setSource(undefined); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repository, sourceMessageId]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (library.current) library.current.back(); else close(); return true; });
    const stop = navigation.addListener('beforeRemove', (event) => {
      if (leaving.current) return;
      event.preventDefault(); if (library.current) library.current.back(); else close();
    });
    return () => { sub.remove(); stop(); };
  }, [navigation]);
  return <Screen edges={['top','left','right','bottom']} style={{ backgroundColor: desk.desk }}>
    {loading ? <ActivityIndicator accessibilityLabel={tr('templates.loading')} /> : source !== undefined || !sourceMessageId ? <TemplateLibrary ref={library} initialDocument={source?.document} initialTitle={source?.title} onClose={close} onSelect={setDraft} /> : <EmptyState title={tr('templates.unavailable')} description={tr('templates.error')} action={{ label: tr('templates.back'), onPress: close }} />}
    <AddNoteSheet visible={Boolean(draft)} initialBlocks={draft} onClose={() => setDraft(undefined)} onSubmit={async ({ text, attachment, blocks }) => { if (blocks) await repository.createNote({ blocks, attachment }); else await repository.createText(text); }} />
  </Screen>;
}
