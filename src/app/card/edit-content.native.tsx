import { tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectedNotes } from '@/components/notes/connected-notes.native';
import { NoteAttachmentAddRow, NoteAttachmentList, NoteAttachmentToggle, type NoteAttachmentItem } from '@/components/notes/note-attachment-list.native';
import { FocusEntry } from '@/features/focus/focus-entry';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { requestReminderSync } from '@/services/reminders';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { AttachmentPicker, type AttachmentDraft } from '@/components/chat/attachment-picker';
import { useTheme } from '@/components/theme-provider';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { AppHeader, IconButton, Screen, HeaderIcon } from '@/components/ui/primitives';
import { KeyboardPane } from '@/components/ui/keyboard-pane';
import { useDesk } from '@/components/desk/paper-desk';
import { spacing } from '@/constants/theme';
import { discardPastedImages, NoteBlocksEditor, noteEditorStyles, NoteToolbar, useNoteImagePaste, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { createMessageRepository } from '@/db/repositories';
import { deleteAttachment } from '@/services/attachment-storage';
import { draftFromNote, noteHasChecklist, draftImageCount, noteBlocksText, textDraft, type NoteDraftBlock } from '@/services/note-content';
import type { AttachmentLike } from '@/db/types';

// What a save would change: words, and which images sit where.
const signature = (blocks: NoteDraftBlock[]) => JSON.stringify(blocks.map((block) => block.type === 'text' ? { text: block.text, list: block.list, title: block.title, heading: block.heading, paragraph: block.paragraph, spans: block.spans } : `img:${block.attachmentId ?? block.image.storagePath}`));

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
  const font = useFontStyle('paragraph');
  const { confirm } = useAppDialog();
  const navigation = useNavigation();
  const inputRef = useRef<NoteBlocksEditorControl>(null);
  // null while loading; an empty note body is a legitimate loaded state (an
  // attachment message with no caption yet), so it can't double as "not
  // loaded yet" the way it would for a plain string default.
  const [initialSignature, setInitialSignature] = useState<string | null>(null);
  // Everything attached outside the note's text: video, audio, files, and
  // photos that aren't placed in the text. Kept on save, and enough on their
  // own for a note to stay. Photos placed in the text are edited in it.
  const [otherAttachments, setOtherAttachments] = useState<AttachmentLike[]>([]);
  // Video, audio and files picked here: already staged into Chits storage,
  // added to the note on save, and deleted again on any way out without saving.
  const [added, setAdded] = useState<AttachmentDraft[]>([]);
  const addedRef = useRef(added);
  useEffect(() => { addedRef.current = added; }, [added]);
  // Saved ones taken off here go when the note is saved, like a removed photo.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const attachmentItems: NoteAttachmentItem[] = [
    ...otherAttachments.filter((attachment) => !removedIds.includes(attachment.id)).map((attachment) => ({ key: attachment.id, attachment, saved: true })),
    ...added.map((draft) => ({ key: draft.attachment.storagePath, attachment: { ...draft.attachment, id: draft.attachment.storagePath, createdAt: 0 }, saved: false })),
  ];
  const attachmentCount = attachmentItems.length;
  const hasOtherAttachments = attachmentCount > 0;
  const [showAttachments, setShowAttachments] = useState(false);
  // A voice recording runs inside the list, so the list stays open until it ends.
  const [recording, setRecording] = useState(false);
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
      // A photo the text places is edited in the text; any other is listed with the attachments.
      const inline = new Set((message?.content ?? []).flatMap((block) => block.type === 'image' ? [block.attachmentId] : []));
      const listed = message?.attachments.filter((attachment) => attachment.type !== 'photo' || !inline.has(attachment.id)) ?? [];
      const loaded = message ? draftFromNote({ ...message, attachments: message.attachments.filter((attachment) => !listed.includes(attachment)) }) : textDraft();
      setInitialSignature(signature(loaded));
      setBlocks(loaded);
      setOtherAttachments(listed);
      // Show what's attached straight away; the chip folds it away.
      setShowAttachments(listed.length > 0);
      if (autoFocusOnOpen.current) requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => { active = false; };
  }, [messageId, messageRepository]);

  const changeBlocks = useCallback((update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => { setBlocks(update); setError(null); }, []);
  const pasteImage = useNoteImagePaste({ active: initialSignature !== null, blocks, setBlocks: changeBlocks, editor: inputRef, onError: setError });
  const hasChanges = initialSignature !== null && (signature(blocks) !== initialSignature || added.length > 0 || removedIds.length > 0);
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
        onConfirm: () => {
          discardPastedImages(blocksRef.current);
          for (const draft of addedRef.current) void draft.remove().catch(() => undefined);
          navigation.dispatch(event.data.action);
        },
      });
    });
    return subscription;
  }, [confirm, hasChanges, navigation]);

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { removablePaths } = await messageRepository.updateContent(messageId, blocks, undefined, {
        added: added.map((draft) => draft.attachment),
        removed: removedIds,
        attachedPhotos: otherAttachments.filter((attachment) => attachment.type === 'photo' && !removedIds.includes(attachment.id)).map((attachment) => attachment.id),
      });
      // Removed images' files go only once the note no longer refers to them.
      await Promise.all(removablePaths.map((path) => deleteAttachment(path).catch(() => undefined)));
      void requestReminderSync();
      justSavedRef.current = true;
      leaveNote();
    } catch {
      setError(tr("editcontent.chitsCouldNotSaveYourChangesTryAgain"));
      setSaving(false);
    }
  }, [added, blocks, canSave, messageId, messageRepository, leaveNote, otherAttachments, removedIds]);

  // Two ways to add a photo, as in the chat composer: "Photo" attaches it with
  // the video, audio and files; "Insert photo inline" places it in the text at
  // the cursor, as the toolbar's image button does.
  const addAttachment = useCallback((draft: AttachmentDraft) => {
    setError(null);
    setAdded((current) => [...current, draft]);
    setShowAttachments(true);
  }, []);
  const insertInline = useCallback((draft: AttachmentDraft) => {
    setError(null);
    pasteImage.insertAttachment(draft);
  }, [pasteImage]);
  // Something picked in this edit is deleted straight away; a saved one waits for Save.
  const removeAttachment = useCallback((item: NoteAttachmentItem) => {
    setError(null);
    if (item.saved) { setRemovedIds((current) => [...current, item.attachment.id]); return; }
    const draft = added.find((candidate) => candidate.attachment.storagePath === item.key);
    if (!draft) return;
    setAdded((current) => current.filter((candidate) => candidate !== draft));
    void draft.remove().catch(() => undefined);
  }, [added]);

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: theme.cardPaper }}>
      <AppHeader
        title={tr("editcontent.editNote")}
        leading={<IconButton label={tr("chat.cancel")} disabled={saving || pasteImage.pasting} onPress={leaveNote}><HeaderIcon name="close" size={24} /></IconButton>}
        trailing={<IconButton label={tr("editcontent.save")} disabled={!canSave} onPress={() => void save()}><HeaderIcon name={saving ? 'ellipsis-horizontal' : 'checkmark'} size={24} /></IconButton>}
      />
      <View style={[noteEditorStyles.fullscreenPage, { backgroundColor: theme.cardPaper }]}>
      <View style={[styles.noteActions, rowStyle]}>
        <ConnectedNotes noteKey={`thought:${messageId}`} compact inline />
        {initialSignature !== null ? <NoteAttachmentToggle count={attachmentCount} open={showAttachments} disabled={recording} onPress={() => setShowAttachments((open) => !open)} /> : null}
        {!hasChanges && initialSignature !== null ? <FocusEntry noteKey={`thought:${messageId}`} compact /> : null}
      </View>
      {/* Each row opens the way it does on the note: video and PDFs in their
          viewers, audio plays in place, other files open in another app. */}
      {showAttachments ? <NoteAttachmentList items={attachmentItems} onRemove={removeAttachment} onError={setError} disabled={saving}
        footer={<AttachmentPicker disabled={saving} onSelected={addAttachment} onInlineSelected={insertInline} onError={setError} onRecordingChange={setRecording}
          renderTrigger={({ open, disabled }) => <NoteAttachmentAddRow label={tr('id.addAttachment')} disabled={disabled} onPress={open} />} />} /> : null}
      <KeyboardPane>
        {error ? <View accessibilityRole="alert" style={[styles.errorBanner, { borderColor: desk.danger }]}><AppText style={[styles.errorText, { color: desk.danger }]}>{error}</AppText></View> : null}
        <View style={noteEditorStyles.fullscreenPage}>
        {/* The screen itself is the editing surface — no boxed field, no
            border. Without images, a single flex:1 TextInput handles its own
            scrolling for content of any length, so it never has to compete
            with a parent scroll view for the same gesture. With images, the
            words and images stack in one scrolling column instead. */}
        <NoteBlocksEditor
          ref={inputRef}
          fillViewport
          accessibilityLabel={tr("editcontent.noteContent")}
          blocks={blocks}
          onChangeBlocks={changeBlocks}
          onReplaceImage={(key) => void pasteImage.pick(key)}
          placeholder={tr("editcontent.startWriting")}
          maxLength={10000}
          editable={!saving && !pasteImage.pasting}
          maxImageHeight={360}
          singleInputStyle={[noteEditorStyles.input, font, { color: theme.textPrimary }]}
          blockContainerStyle={noteEditorStyles.blocks}
          blockInputStyle={[noteEditorStyles.blockInput, font, { color: theme.textPrimary }]}
        />
        </View>
        <NoteToolbar editor={inputRef} images={pasteImage} disabled={saving} safeBottom />
      </KeyboardPane>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noteActions: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.6 },
  errorBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  errorText: { fontSize: 13, lineHeight: 18 },
});
