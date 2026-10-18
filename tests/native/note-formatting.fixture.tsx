// Copy temporarily to src/app/editor-formatting-qa.tsx. No database writes.
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/app-text';
import { NoteBlocksEditor, NoteListButtons, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { FullscreenComposer } from '@/components/chat/fullscreen-composer';
import { AddNoteSheet } from '@/components/boards/add-note-sheet';
import type { NoteDraftBlock } from '@/services/note-content';
const examples = {
  Fresh: { text: '', start: 0, end: 0 },
  Existing: { text: 'Buy groceries', start: 13, end: 13 },
  Empty: { text: 'Meeting notes\n', start: 14, end: 14 },
  Middle: { text: 'Buy groceries today', start: 4, end: 4 },
  Selected: { text: 'Before\nOne\nTwo\nAfter', start: 7, end: 14 },
};
export default function FormattingQA() {
  const [example, setExample] = useState(examples.Existing);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>([{ key: 'qa', type: 'text', text: example.text }]);
  const [caret, setCaret] = useState('');
  const editor = useRef<NoteBlocksEditorControl>(null);
  const chatEditor = useRef<NoteBlocksEditorControl>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [submitted, setSubmitted] = useState('');
  const preserved = blocks.every(b => b.type === 'text') && blocks.map(b => b.type === 'text' ? b.text : '').join('\n') === example.text;
  const formatted = blocks.filter(b => b.type === 'text' && b.list).length;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <AppText>Formatting QA</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Chat fullscreen QA" onPress={() => setChatOpen(true)}><AppText>Open Chat fullscreen QA</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Add Note QA" onPress={() => setNoteOpen(true)}><AppText>Open Add Note QA</AppText></Pressable>
    <AppText>{submitted}</AppText>
    {Object.entries(examples).map(([name, value]) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Seed ${name}`} onPress={() => { setExample(value); setBlocks([{ key: 'qa', type: 'text', text: value.text }]); setCaret(''); }}><AppText>{`Seed ${name}`}</AppText></Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Focus selected paragraph" onPress={() => editor.current?.focusAt({ key: 'qa', start: example.start, end: example.end })}><AppText>Focus selected paragraph</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Read caret" onPress={() => setCaret(`Caret ${editor.current?.cursor()?.start}`)}><AppText>Read caret</AppText></Pressable>
    <AppText>{caret}</AppText>
    <AppText>{preserved ? 'Paragraphs preserved' : 'Paragraphs changed'}</AppText>
    <AppText>{`Formatted items ${formatted}`}</AppText>
    <NoteBlocksEditor ref={editor} blocks={blocks} onChangeBlocks={setBlocks} editable placeholder="Type" maxLength={10000} maxImageHeight={200} accessibilityLabel="QA text" singleInputStyle={{ flex: 1, color: '#111', fontSize: 18, padding: 12 }} blockContainerStyle={{ flex: 1, padding: 12 }} blockInputStyle={{ color: '#111', fontSize: 18, padding: 0, minHeight: 28 }} />
    <NoteListButtons editor={editor} />
    {chatOpen ? <FullscreenComposer blocks={blocks} onChangeBlocks={setBlocks} editorRef={chatEditor} onClose={() => setChatOpen(false)} onSaveDraft={async () => {}} onSend={() => {}} canSave saving={false} error={null} savedText={null} savedContent={null} attachmentLabel={null} listButtons={<NoteListButtons editor={chatEditor} />} /> : null}
    <AddNoteSheet visible={noteOpen} onClose={() => setNoteOpen(false)} onSubmit={async note => { setSubmitted(note.blocks?.map(b => b.type === 'text' ? b.text : '').join('|') === 'Meeting notes|Task' ? 'Submission preserved' : 'Submission changed'); }} />
  </KeyboardAvoidingView></SafeAreaView>;
}
