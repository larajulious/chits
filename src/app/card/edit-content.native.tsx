import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { requestReminderSync } from '@/services/reminders';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { AppHeader, IconButton, Screen, HeaderIcon, useHeaderInk } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { discardPastedImages, NoteBlocksEditor, PasteImageButton, useNoteImagePaste, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { createMessageRepository } from '@/db/repositories';
import { deleteAttachment } from '@/services/attachment-storage';
import { draftFromNote, draftImageCount, noteBlocksText, textDraft, type NoteDraftBlock } from '@/services/note-content';

// What a save would change: words, and which images sit where.
const signature = (blocks: NoteDraftBlock[]) => JSON.stringify(blocks.map((block) => block.type === 'text' ? block.text : `img:${block.attachmentId ?? block.image.storagePath}`));

// The dedicated full-screen "Edit Content" editor — see PHASE: FULL-SCREEN
// CONTENT EDITOR. Card Details previously edited a message's text inline
// (a short embedded TextInput competing for scroll with the rest of the
// screen); long notes need real room, so this is now its own screen with a
// single responsibility — edit the note's words and its images (pasted inline,
// in order, or removed); a note's video, audio and files stay as they are. Reached via
// router.push from Card Details and returns via router.back(), so Card
// Details' own useFocusEffect reload picks up the saved change automatically
// without this screen needing to reach back into its caller's state.
export default function EditContentScreen() {
  const database = useSQLiteContext();
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { tokens: theme } = useTheme();
  const headerInk = useHeaderInk();
  const { confirm } = useAppDialog();
  const navigation = useNavigation();
  const inputRef = useRef<NoteBlocksEditorControl>(null);
  // null while loading; an empty note body is a legitimate loaded state (an
  // attachment message with no caption yet), so it can't double as "not
  // loaded yet" the way it would for a plain string default.
  const [initialSignature, setInitialSignature] = useState<string | null>(null);
  // Video, audio and files: kept on save, and enough on their own for a note to stay.
  const [hasOtherAttachments, setHasOtherAttachments] = useState(false);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>(() => textDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set right before the navigating-away call that follows a successful save,
  // so the beforeRemove guard below (which reads `hasChanges`, necessarily a
  // render behind at that exact instant) doesn't mistake the save's own
  // navigation for an unsaved-changes exit and re-show the discard dialog.
  const justSavedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void messageRepository.getActiveById(messageId).then((message) => {
      if (!active) return;
      const loaded = message ? draftFromNote(message) : textDraft();
      setInitialSignature(signature(loaded));
      setBlocks(loaded);
      setHasOtherAttachments(Boolean(message?.attachments.some((attachment) => attachment.type !== 'photo')));
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => { active = false; };
  }, [messageId, messageRepository]);

  const changeBlocks = useCallback((update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => { setBlocks(update); setError(null); }, []);
  const pasteImage = useNoteImagePaste({ active: initialSignature !== null, blocks, setBlocks: changeBlocks, editor: inputRef, onError: setError });
  const hasChanges = initialSignature !== null && signature(blocks) !== initialSignature;
  const canSave = hasChanges && (noteBlocksText(blocks).length > 0 || draftImageCount(blocks) > 0 || hasOtherAttachments) && !saving && !pasteImage.pasting;
  // Images pasted here but not saved are deleted on every way out without saving.
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // The one guard for every exit path — header Cancel, iOS swipe-back, and
  // Android hardware back all resolve to the same underlying navigation
  // removal, so intercepting it here (rather than duplicating a check in each
  // trigger) is the only way none of them can silently drop unsaved edits.
  useEffect(() => {
    const subscription = navigation.addListener('beforeRemove', (event) => {
      if (justSavedRef.current || !hasChanges) return;
      event.preventDefault();
      confirm({
        type: 'destructive',
        title: 'Discard changes?',
        message: 'Your edits haven’t been saved.',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        onConfirm: () => { discardPastedImages(blocksRef.current); navigation.dispatch(event.data.action); },
      });
    });
    return subscription;
  }, [confirm, hasChanges, navigation]);

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { removablePaths } = await messageRepository.updateContent(messageId, blocks);
      // Removed images' files go only once the note no longer refers to them.
      await Promise.all(removablePaths.map((path) => deleteAttachment(path)));
      void requestReminderSync();
      justSavedRef.current = true;
      router.back();
    } catch {
      setError('Chits could not save your changes. Try again.');
      setSaving(false);
    }
  }, [blocks, canSave, messageId, messageRepository]);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="Edit Note"
        leading={<IconButton label="Cancel" onPress={() => router.back()}><HeaderIcon name="close" size={24} /></IconButton>}
        trailing={<IconButton label="Save" disabled={!canSave} onPress={() => void save()}><Icon name={saving ? 'ellipsis-horizontal' : 'checkmark'} size={24} color={canSave ? (headerInk.banded ? headerInk.ink : theme.accent) : headerInk.inkMuted} /></IconButton>}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {error ? <View accessibilityRole="alert" style={[styles.errorBanner, { borderColor: theme.danger }]}><AppText style={[styles.errorText, { color: theme.danger }]}>{error}</AppText></View> : null}
        {/* The screen itself is the editing surface — no boxed field, no
            border. Without images, a single flex:1 TextInput handles its own
            scrolling for content of any length, so it never has to compete
            with a parent scroll view for the same gesture. With images, the
            words and images stack in one scrolling column instead. */}
        <NoteBlocksEditor
          ref={inputRef}
          accessibilityLabel="Note content"
          blocks={blocks}
          onChangeBlocks={changeBlocks}
          placeholder="Start writing…"
          maxLength={10000}
          editable={!saving}
          maxImageHeight={360}
          singleInputStyle={[styles.input, { color: theme.textPrimary }]}
          blockContainerStyle={styles.blocks}
          blockInputStyle={[styles.blockInput, { color: theme.textPrimary }]}
        />
        {pasteImage.canPaste || pasteImage.pasting ? <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
          <PasteImageButton visible={pasteImage.canPaste} pasting={pasteImage.pasting} disabled={saving} onPress={() => void pasteImage.paste()} />
        </View> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, fontSize: 17, lineHeight: 27 },
  blocks: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  blockInput: { minHeight: 27, padding: 0, fontSize: 17, lineHeight: 27, textAlignVertical: 'top' },
  // The paste action sits just above the keyboard, only while the clipboard holds an image.
  footer: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
  errorBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  errorText: { fontSize: 13, lineHeight: 18 },
});
