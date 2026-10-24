import { tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectedNotes } from '@/components/notes/connected-notes.native';
import { FocusEntry } from '@/features/focus/focus-entry';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { requestReminderSync } from '@/services/reminders';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { AppHeader, IconButton, Screen, HeaderIcon, useHeaderInk } from '@/components/ui/primitives';
import { DeskPage, PaperDesk, useDesk } from '@/components/desk/paper-desk';
import { spacing } from '@/constants/theme';
import { discardPastedImages, NoteBlocksEditor, InsertImageButton, NoteListButtons, PasteImageButton, useNoteImagePaste, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { createMessageRepository } from '@/db/repositories';
import { deleteAttachment } from '@/services/attachment-storage';
import { draftFromNote, noteHasChecklist, draftImageCount, noteBlocksText, textDraft, type NoteDraftBlock } from '@/services/note-content';

// What a save would change: words, and which images sit where.
const signature = (blocks: NoteDraftBlock[]) => JSON.stringify(blocks.map((block) => block.type === 'text' ? { text: block.text, list: block.list } : `img:${block.attachmentId ?? block.image.storagePath}`));

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
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle } = useDirection();
  const database = useSQLiteContext();
  const { messageId, autoFocus, fromWidget } = useLocalSearchParams<{ messageId: string; autoFocus?: string; fromWidget?: string }>();
  const leaveNote = useCallback(() => {
    if (fromWidget === '1' && !router.canGoBack()) router.replace('/chat');
    else router.back();
  }, [fromWidget]);
  const autoFocusOnOpen = useRef(autoFocus !== '0');
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { tokens: theme } = useTheme();
  const desk = useDesk();
  const headerInk = useHeaderInk();
  const { confirm } = useAppDialog();
  const navigation = useNavigation();
  const inputRef = useRef<NoteBlocksEditorControl>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
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
      if (autoFocusOnOpen.current) requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => { active = false; };
  }, [messageId, messageRepository]);

  const changeBlocks = useCallback((update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => { setBlocks(update); setError(null); }, []);
  const pasteImage = useNoteImagePaste({ active: initialSignature !== null, blocks, setBlocks: changeBlocks, editor: inputRef, onError: setError });
  const hasChanges = initialSignature !== null && signature(blocks) !== initialSignature;
  const canSave = hasChanges && (noteBlocksText(blocks).length > 0 || noteHasChecklist(blocks) || draftImageCount(blocks) > 0 || hasOtherAttachments) && !saving && !pasteImage.pasting;
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
        title: tr("editcontent.discardChanges"),
        message: tr("editcontent.yourEditsHavenTBeenSaved"),
        confirmText: tr("editcontent.discard"),
        cancelText: tr("editcontent.keepEditing"),
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
      await Promise.all(removablePaths.map((path) => deleteAttachment(path).catch(() => undefined)));
      void requestReminderSync();
      justSavedRef.current = true;
      leaveNote();
    } catch {
      setError(tr("editcontent.chitsCouldNotSaveYourChangesTryAgain"));
      setSaving(false);
    }
  }, [blocks, canSave, messageId, messageRepository, leaveNote]);

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
      <AppHeader
        title={tr("editcontent.editNote")}
        leading={<IconButton label={tr("chat.cancel")} disabled={saving || pasteImage.pasting} onPress={leaveNote}><HeaderIcon name="close" size={24} /></IconButton>}
        trailing={<IconButton label={tr("editcontent.save")} disabled={!canSave} onPress={() => void save()}><Icon name={saving ? 'ellipsis-horizontal' : 'checkmark'} size={24} color={canSave ? (headerInk.banded ? headerInk.ink : theme.accent) : headerInk.inkMuted} /></IconButton>}
      />
      <PaperDesk>
      <View style={[styles.noteActions, rowStyle]}>
        <ConnectedNotes noteKey={`thought:${messageId}`} compact inline />
        {!hasChanges && initialSignature !== null ? <FocusEntry noteKey={`thought:${messageId}`} compact /> : null}
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {error ? <View accessibilityRole="alert" style={[styles.errorBanner, { borderColor: desk.danger }]}><AppText style={[styles.errorText, { color: desk.danger }]}>{error}</AppText></View> : null}
        {/* The note is a page of the theme's own paper lying on the desk. */}
        <DeskPage style={styles.page}>
        {/* The screen itself is the editing surface — no boxed field, no
            border. Without images, a single flex:1 TextInput handles its own
            scrolling for content of any length, so it never has to compete
            with a parent scroll view for the same gesture. With images, the
            words and images stack in one scrolling column instead. */}
        <NoteBlocksEditor
          ref={inputRef}
          accessibilityLabel={tr("editcontent.noteContent")}
          blocks={blocks}
          onChangeBlocks={changeBlocks}
          onReplaceImage={(key) => void pasteImage.pick(key)}
          placeholder={tr("editcontent.startWriting")}
          maxLength={10000}
          editable={!saving && !pasteImage.pasting}
          maxImageHeight={360}
          singleInputStyle={[styles.input, { color: theme.textPrimary }]}
          blockContainerStyle={styles.blocks}
          blockInputStyle={[styles.blockInput, { color: theme.textPrimary }]}
        />
        </DeskPage>
        <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={styles.footer}>
          <InsertImageButton disabled={saving} busy={pasteImage.pasting} onPress={() => void pasteImage.pick()} />
          <NoteListButtons editor={inputRef} disabled={saving || pasteImage.pasting} />
          <PasteImageButton visible={pasteImage.canPaste} pasting={pasteImage.pasting && !pasteImage.picking} disabled={saving || pasteImage.picking} onPress={() => void pasteImage.paste()} />
        </SafeAreaView>
      </KeyboardAvoidingView>
      </PaperDesk>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noteActions: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, fontSize: 17, lineHeight: 27 },
  blocks: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  blockInput: { minHeight: 27, padding: 0, fontSize: 17, lineHeight: 27, textAlignVertical: 'top' },
  // Image actions sit above the keyboard.
  page: { flex: 1, marginHorizontal: spacing.sm, marginTop: spacing.xs },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  errorBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  errorText: { fontSize: 13, lineHeight: 18 },
});
