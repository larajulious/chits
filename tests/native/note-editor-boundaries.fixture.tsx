// Temporarily copy to src/app/editor-boundary-qa.tsx for disposable-draft QA.
import { useRef, useState } from 'react';
import { Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoteBlocksEditor, NoteListButtons, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { AppText } from '@/components/ui/app-text';
import type { NoteDraftBlock } from '@/services/note-content';

const seed = (): NoteDraftBlock[] => [
  { key: 'p', type: 'text', text: 'P' },
  { key: 'n', type: 'text', text: 'N', list: { kind: 'numbered', id: 'n' } },
  { key: 'b', type: 'text', text: 'B', list: { kind: 'bullet', id: 'b' } },
  { key: 'c', type: 'text', text: 'C', list: { kind: 'checklist', id: 'c', checked: true } },
  { key: 'z', type: 'text', text: 'Z' },
];
export default function EditorBoundaryQA() {
  const [blocks, setBlocks] = useState(seed);
  const editor = useRef<NoteBlocksEditorControl>(null);
  const empty = blocks.length === 1 && blocks[0].type === 'text' && !blocks[0].text && !blocks[0].list;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <AppText>Boundary QA</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="Reset QA document" onPress={() => setBlocks(seed())}><AppText>Reset QA document</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Focus document end" onPress={() => { const block = blocks.findLast(b => b.type === 'text'); if (block?.type === 'text') editor.current?.focusAt({ key: block.key, start: block.text.length, end: block.text.length }); }}><AppText>Focus document end</AppText></Pressable>
    <AppText accessibilityLabel={empty ? 'Document cleared' : 'Document has content'}>{empty ? 'Document cleared' : 'Document has content'}</AppText>
    <AppText>{blocks.map(b => b.type === 'text' ? `${b.key}:${b.list?.kind ?? 'plain'}:${JSON.stringify(b.text)}` : 'image').join(' / ')}</AppText>
    <NoteBlocksEditor ref={editor} blocks={blocks} onChangeBlocks={setBlocks} editable placeholder="Type here" maxLength={10000} maxImageHeight={200} accessibilityLabel="QA note" singleInputStyle={{ flex: 1, fontSize: 18, color: '#111', padding: 12 }} blockContainerStyle={{ flex: 1, padding: 12 }} blockInputStyle={{ fontSize: 18, color: '#111', padding: 0, minHeight: 28 }} />
    <NoteListButtons editor={editor} />
  </KeyboardAvoidingView></SafeAreaView>;
}
