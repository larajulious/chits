// Temporarily copy to src/app/existing-editor-qa.tsx. Use on a QA simulator.
// Seeds owned notes, then opens the real database-backed Edit Note screen.
// Return here to inspect persisted data and delete only the fixture's notes.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText } from '@/components/ui/app-text';
import { createMessageRepository } from '@/db/repositories';
import { nativeNoteFormattingAvailable } from '@/services/native-note-formatting';

export default function ExistingEditorQA() {
  const router = useRouter();
  const { cleanupId } = useLocalSearchParams<{ cleanupId?: string }>();
  const database = useSQLiteContext();
  const notes = useMemo(() => createMessageRepository(database), [database]);
  const [owned, setOwned] = useState<string[]>([]);
  const [report, setReport] = useState('Existing Edit Note QA');
  const seed = async (structured: boolean) => {
    const id = structured ? await notes.createNote({ blocks: [
      { type: 'text', text: 'Heading', heading: 1, paragraph: true, title: 'Editor QA' },
      { type: 'text', text: 'textA\ntextB\n\ntextC', paragraph: true, spans: [{ start: 0, end: 5, marks: { bold: true } }] },
    ] }) : (await notes.createText('textA\ntextB')).id;
    setOwned(current => [...current, id]);
    setReport(id);
    router.push({ pathname: '/card/edit-content', params: { messageId: id } });
  };
  return <ScrollView contentContainerStyle={{ padding: 30, gap: 20 }}>
    <AppText>{nativeNoteFormattingAvailable ? 'Native formatting active' : 'Attributed fallback active'}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="Seed plain existing note" onPress={() => void seed(false)}><AppText>Seed plain existing note</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Seed structured existing note" onPress={() => void seed(true)}><AppText>Seed structured existing note</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Inspect saved QA notes" onPress={() => void Promise.all(owned.map(id => notes.getActiveById(id))).then(saved => setReport(JSON.stringify(saved.map(note => ({ id: note?.id, text: note?.text, content: note?.content })))))}><AppText>Inspect saved QA notes</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Delete owned QA notes" onPress={() => void (async () => {
      // Explicit IDs allow cleanup after a dev reload. Serialize SQLite writes.
      for (const id of new Set([...owned, ...(cleanupId?.split(',') ?? [])])) {
        const note = await notes.getActiveById(id);
        if (!note) continue;
        if (note.attachments.length || !(note.content?.[0]?.type === 'text' && note.content[0].title === 'Editor QA') && !/^textA\ntextB(?:\nafter)?$/.test(note.text ?? '')) throw new Error('Not a fixture note');
        await notes.deletePermanently(id);
      }
      setOwned([]); setReport('QA notes removed');
    })().catch(error => setReport(String(error)))}><AppText>Delete owned QA notes</AppText></Pressable>
    <AppText selectable>{report}</AppText>
  </ScrollView>;
}
