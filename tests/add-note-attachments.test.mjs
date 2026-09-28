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
  assert.match(picker, /await dismissKeyboardAsync\(\);\s*const access = await ensureMicrophonePermission\(\);/);
  const media = read('src/services/attachment-import.native.ts');
  assert.match(media, /await dismissKeyboardAsync\(\);[\s\S]*?launchImageLibraryAsync/);
});

// App Review Guideline 5.1.1(iv): "Don't Allow" must never be followed by
// another prompt or a Settings shortcut; Settings is offered only when the
// user deliberately retries after an earlier refusal.
test('the system prompt is shown at most once per attempt and a fresh refusal is told apart from a repeat attempt', async () => {
  const { resolvePermission } = await import('../src/services/permission-state.ts');
  const run = async (current, answer) => {
    let requests = 0;
    const state = await resolvePermission(async () => current, async () => { requests += 1; return answer; });
    return { state, requests };
  };
  assert.deepEqual(await run({ granted: true, canAskAgain: true }, null), { state: 'granted', requests: 0 });
  assert.deepEqual(await run({ granted: false, canAskAgain: true }, { granted: true, canAskAgain: true }), { state: 'granted', requests: 1 });
  // Declined at the prompt just now → 'denied' (stop quietly), even though iOS
  // now reports canAskAgain: false.
  assert.deepEqual(await run({ granted: false, canAskAgain: true }, { granted: false, canAskAgain: false }), { state: 'denied', requests: 1 });
  // Declined on an earlier attempt → 'blocked', and no request is made.
  assert.deepEqual(await run({ granted: false, canAskAgain: false }, null), { state: 'blocked', requests: 0 });
});

test('every permission flow stops quietly on a fresh refusal and offers Settings only on a repeat attempt', () => {
  const prompt = read('src/components/permissions/permission-settings-prompt.ts');
  assert.match(prompt, /\{ text: 'Cancel', style: 'cancel' \},\s*\{ text: 'Open Settings', onPress: \(\) => void Linking\.openSettings\(\) \}/);

  const microphone = read('src/components/chat/attachment-picker.native.tsx');
  assert.match(microphone, /if \(access === 'denied'\) return;/);
  assert.match(microphone, /if \(access === 'blocked'\) \{ showPermissionSettingsPrompt\('microphone'\); return; \}/);

  const reminders = read('src/services/reminders.native.ts');
  assert.match(reminders, /if \(access === 'denied'\) return \{ ok: false, reason: 'declined' \};/);
  assert.match(reminders, /if \(access === 'blocked'\) return \{ ok: false, reason: 'blocked' \};/);
  const sheet = read('src/components/reminders/reminder-sheet.native.tsx');
  assert.match(sheet, /else if \(result\.reason === 'blocked'\) showPermissionSettingsPrompt\('notifications'\);/);
  assert.doesNotMatch(sheet, /Linking|openSettings/);

  const photos = read('src/services/attachment-export.native.ts');
  assert.match(photos, /if \(access === 'denied'\) return \{ status: 'cancelled' \};/);
  assert.match(read('src/components/attachments/use-attachment-export.ts'), /outcome\.code === 'permission'\) showPermissionSettingsPrompt\('photos'\)/);

  // Settings opens only from the explicit prompt button.
  for (const path of ['src/components/chat/attachment-picker.native.tsx', 'src/services/reminders.native.ts', 'src/services/attachment-export.native.ts', 'src/app/card/[id].native.tsx', 'src/components/attachments/use-attachment-export.ts']) {
    assert.doesNotMatch(read(path), /openSettings/, path);
  }
});

test('picking photos and videos never asks for photo-library access', () => {
  for (const path of ['src/services/attachment-import.native.ts', 'src/app/card/[id].native.tsx', 'src/components/settings/chat-appearance-settings.native.tsx']) {
    assert.doesNotMatch(read(path), /MediaLibraryPermissionsAsync|ensurePermission/, path);
  }
});
