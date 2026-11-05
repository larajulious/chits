// Temporarily copy to src/app/existing-editor-qa.tsx. Use on a QA simulator.
// Seeds owned notes, then opens the real database-backed Edit Note screen.
// Return here to inspect persisted data and delete only the fixture's notes.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText } from '@/components/ui/app-text';
import { createMessageRepository } from '@/db/repositories';
import { nativeNoteFormattingAvailable } from '@/services/native-note-formatting';

export default function ExistingEditorQA() {
  const router = useRouter();
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
    <Pressable accessibilityRole="button" accessibilityLabel="Delete owned QA notes" onPress={() => void Promise.all(owned.map(id => notes.deletePermanently(id))).then(() => { setOwned([]); setReport('QA notes removed'); })}><AppText>Delete owned QA notes</AppText></Pressable>
    <AppText selectable>{report}</AppText>
  </ScrollView>;
}
