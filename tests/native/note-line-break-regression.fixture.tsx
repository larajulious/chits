// Temporarily copy to src/app/line-break-regression-qa.tsx, then remove it.
// Uses the production editor without database or attachment writes.
// Send selects textB; Save as draft reports the exact document and marks.
import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { AddNoteSheet } from '@/components/boards/add-note-sheet';
import { AppText } from '@/components/ui/app-text';
import { FullscreenComposer } from '@/components/chat/fullscreen-composer';
import type { NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import type { NoteDraftBlock } from '@/services/note-content';
import { marksAt } from '@/services/note-rich-text';

export default function LineBreakRegression() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const editor = useRef<NoteBlocksEditorControl>(null);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>([{ key: 'body', type: 'text', text: 'textA\ntextB' }]);
  const [report, setReport] = useState<string | null>(null);
  if (mode === 'add') return <View style={{ flex: 1 }}><AppText>{report}</AppText><AddNoteSheet visible initialBlocks={blocks} onClose={() => router.back()} onSubmit={async note => { setReport(JSON.stringify(note.blocks)); }} /></View>;
  return <FullscreenComposer blocks={blocks} onChangeBlocks={setBlocks} editorRef={editor} onClose={() => router.back()} canSave saving={false} savedText={null} savedContent={null} attachmentLabel={null} error={report}
    onSend={() => editor.current?.focusAt({ key: 'body', start: 6, end: 11 }, false)}
    onSaveDraft={async () => {
      const block = blocks[0];
      setReport(block.type === 'text' ? `${JSON.stringify(block.text)} ${JSON.stringify(marksAt(block, 6, 11))}` : 'Unexpected block');
    }} />;
}
