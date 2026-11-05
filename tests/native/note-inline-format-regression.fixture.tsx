// Temporarily copy to src/app/formatting-regression-qa.tsx, then remove it.
// Reuses the production fullscreen editor. No database or attachment writes.
// "Send" selects the final word; "Save as draft" reports the stored marks.
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { FullscreenComposer } from '@/components/chat/fullscreen-composer';
import type { NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import type { NoteDraftBlock } from '@/services/note-content';
import { marksAt } from '@/services/note-rich-text';

const text = Array.from({ length: 60 }, (_, index) => `Line ${String(index + 1).padStart(2, '0')}. A thought in a long note.`).join('\n') + '\nTarget AlphaBeta';
export default function InlineFormattingRegression() {
  const router = useRouter();
  const editor = useRef<NoteBlocksEditorControl>(null);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>([{ key: 'long-note', type: 'text', text, title: 'Formatting regression QA' }]);
  const [report, setReport] = useState<string | null>(null);
  return <FullscreenComposer blocks={blocks} onChangeBlocks={setBlocks} editorRef={editor} onClose={() => router.back()} canSave saving={false} savedText={null} savedContent={null} attachmentLabel={null} error={report}
    onSend={() => editor.current?.focusAt({ key: 'long-note', start: text.length - 9, end: text.length })}
    onSaveDraft={async () => {
      const block = blocks[0];
      const marks = block.type === 'text' ? marksAt(block, text.length - 9, text.length) : {};
      setReport(`Bold ${Boolean(marks.bold)}; italic ${Boolean(marks.italic)}`);
    }} />;
}
