// Temporary route editor-empty-qa. This draft never writes to storage.
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/app-text';
import { NoteBlocksEditor, NoteListButtons, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import type { NoteDraftBlock } from '@/services/note-content';
export default function EmptyLayoutQA() {
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>([{ key: 'fresh', type: 'text', text: '' }]);
  const editor = useRef<NoteBlocksEditorControl>(null);
  const empty = blocks.length === 1 && blocks[0].type === 'text' && blocks[0].text === '' && !blocks[0].list;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <AppText>Empty layout QA</AppText>
    <View style={{ flexDirection: 'row' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Focus end" onPress={() => { const block = blocks.findLast(b => b.type === 'text'); if (block?.type === 'text') editor.current?.focusAt({ key: block.key, start: block.text.length, end: block.text.length }); }}><AppText>Focus end</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Seed blank remnants" onLongPress={() => setBlocks([{ key: 'blank', type: 'text', text: '\n'.repeat(70) }, { key: 'fresh', type: 'text', text: '', list: { kind: 'checklist', id: 'qa', checked: false } }])} onPress={() => setBlocks([{ key: 'blank', type: 'text', text: '\n'.repeat(8) }, { key: 'fresh', type: 'text', text: '', list: { kind: 'checklist', id: 'qa', checked: false } }])}><AppText>Seed blank remnants</AppText></Pressable>
    </View>
    <AppText>{empty ? 'One empty paragraph' : 'Document contains content'}</AppText>
    <NoteBlocksEditor ref={editor} blocks={blocks} onChangeBlocks={setBlocks} editable placeholder="Write here" maxLength={10000} maxImageHeight={200} accessibilityLabel="QA writing" singleInputStyle={{ flex: 1, paddingHorizontal: 24, paddingTop: 4, fontSize: 17, lineHeight: 27, color: '#111' }} blockContainerStyle={{ flex: 1, paddingHorizontal: 24, paddingTop: 4 }} blockInputStyle={{ minHeight: 27, padding: 0, fontSize: 17, lineHeight: 27, color: '#111' }} />
    <NoteListButtons editor={editor} />
  </KeyboardAvoidingView></SafeAreaView>;
}
