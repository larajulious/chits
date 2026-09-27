import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Add note sheet can attach a photo, video or file and cleans up a discarded one', () => {
  const sheet = read('src/components/boards/add-note-sheet.tsx');
  assert.match(sheet, /\{ key: 'photo', label: 'Photo'/);
  assert.match(sheet, /\{ key: 'video', label: 'Video'/);
  assert.match(sheet, /\{ key: 'file', label: 'File'/);
  assert.doesNotMatch(sheet, /key: 'audio'/);
  assert.match(sheet, /const canAdd = \(Boolean\(trimmed\) \|\| Boolean\(draft\)\) && !busy;/);
  // Dismissing deletes the staged copy; a successful save keeps it.
  assert.match(sheet, /const close = \(\) => \{\s*if \(busy\) return;\s*discardDraft\(\);/);
  assert.match(sheet, /await onSubmit\(\{ text: trimmed, attachment: draft\?\.attachment \?\? null \}\);\s*\/\/[^\n]*\n\s*setDraft\(null\);/);
});

test('both Add note entry points save the attachment through the existing storage paths', () => {
  const cards = read('src/app/(tabs)/index.native.tsx');
  assert.match(cards, /if \(attachment\) await messageRepository\.createAttachmentMessage\(attachment, text \|\| null\);/);
  const board = read('src/app/board/[id].native.tsx');
  assert.match(board, /repository\.createNoteCard\(\{ boardId: id, columnId: targetColumn\.id, text, attachment \}\)/);
  const repository = read('src/db/repositories.ts');
  assert.match(repository, /async createNoteCard\(input: \{ boardId: string; columnId: string; text: string; attachment\?:/);
  assert.match(repository, /if \(attachment\) await transaction\.runAsync\('INSERT INTO attachments/);
});

test('Chat and the Add note sheet share one picking/staging implementation', () => {
  const picker = read('src/components/chat/attachment-picker.native.tsx');
  assert.match(picker, /from '@\/services\/attachment-import'/);
  assert.doesNotMatch(picker, /launchImageLibraryAsync|getDocumentAsync/);
  const shared = read('src/services/attachment-import.native.ts');
  assert.match(shared, /export async function pickAndStageMedia/);
  assert.match(shared, /export async function pickAndStageFile/);
});

test('the keyboard is fully dismissed before any permission prompt can appear', () => {
  const keyboard = read('src/services/keyboard.ts');
  assert.match(keyboard, /export function dismissKeyboardAsync/);
  assert.match(keyboard, /Keyboard\.addListener\('keyboardDidHide', finish\)/);
  const picker = read('src/components/chat/attachment-picker.native.tsx');
  assert.match(picker, /await dismissKeyboardAsync\(\);\s*const current = await getRecordingPermissionsAsync\(\);\s*const permission = current\.granted \? current : await requestRecordingPermissionsAsync\(\);/);
  const media = read('src/services/attachment-import.native.ts');
  assert.match(media, /await dismissKeyboardAsync\(\);\s*const permission = await ImagePicker\.requestMediaLibraryPermissionsAsync\(\);/);
});
