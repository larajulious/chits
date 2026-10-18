import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText } from '@/components/ui/app-text';
import { useTheme } from '@/components/theme-provider';
import { CHITS_REVISIT_ENABLED } from '@/constants/revisit';
import { createRevisitRepository } from '@/db/revisit-repository';
import type { NoteKey, RevisitNote } from '@/services/revisit-engine';

// Deliberately one quiet row on established editor/detail surfaces. The review
// detail holds the complete, manageable list and dismissible suggestions.
export function ConnectedNotes({ noteKey, compact = false }: { noteKey: NoteKey; compact?: boolean }) {
  const database = useSQLiteContext();
  const repository = useMemo(() => createRevisitRepository(database), [database]);
  const { tokens } = useTheme();
  const [count, setCount] = useState(0);
  const [resolvedKey, setResolvedKey] = useState(noteKey);
  const [notes, setNotes] = useState<RevisitNote[]>([]);
  useFocusEffect(useCallback(() => {
    if (!CHITS_REVISIT_ENABLED) return;
    let active = true;
    void (async () => {
      let key = noteKey;
      if (key.startsWith('thought:')) {
        const row = await database.getFirstAsync<{ card_id: string }>('SELECT card_id FROM card_messages WHERE message_id = ? ORDER BY card_id LIMIT 1', key.slice('thought:'.length));
        if (row) key = `card:${row.card_id}`;
      }
      if (active) setResolvedKey(key);
      await repository.opened(key);
      const links = await repository.relationships(key);
      const targets: RevisitNote[] = [];
      if (!compact) for (const link of links.slice(0, 3)) {
        const target = await repository.get(link.note_a === key ? link.note_b : link.note_a);
        if (target) targets.push(target);
      }
      if (active) { setCount(links.length); setNotes(targets); }
    })().catch(() => undefined);
    return () => { active = false; };
  }, [compact, database, noteKey, repository]));
  if (!CHITS_REVISIT_ENABLED) return null;
  return <View style={{ paddingHorizontal: 16 }}><Pressable accessibilityRole="button" accessibilityLabel={`Connected notes, ${count}. View or link notes.`}
    onPress={() => router.push({ pathname: '/revisit', params: { note: resolvedKey } })}
    style={{ minHeight: 48, justifyContent: 'center' }}><AppText style={{ color: tokens.accentStrong }}>Connected notes{count ? ` · ${count}` : ''}</AppText></Pressable>
    {notes.map((note) => <Pressable key={note.key} accessibilityRole="button" accessibilityLabel={`Open connected note, ${note.title}`}
      onPress={() => router.push({ pathname: '/revisit', params: { note: note.key } })}
      style={{ minHeight: 48, justifyContent: 'center' }}><AppText>{note.title}</AppText></Pressable>)}
  </View>;
}
