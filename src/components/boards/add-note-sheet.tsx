import { router } from 'expo-router';
import { AppDialogProvider } from '@/components/dialogs/app-dialog-provider';
import { TemplateLibrary, type TemplateLibraryHandle } from '@/features/templates/template-library';
import { createSingleFlight } from '@/services/note-templates';
import { tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { AppHeader, BottomSheetSurface, HeaderIcon, IconButton } from '@/components/ui/primitives';
import { KeyboardPane } from '@/components/ui/keyboard-pane';
import { useDesk } from '@/components/desk/paper-desk';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { GlassSurface } from '@/components/ui/glass-surface';
import { spacing } from '@/constants/theme';
import { AttachmentPicker } from '@/components/chat/attachment-picker';
import { NoteAttachmentAddRow, NoteAttachmentList, NoteAttachmentToggle, type NoteAttachmentItem } from '@/components/notes/note-attachment-list';
import { discardPastedImages, NoteBlocksEditor, noteEditorStyles, NoteToolbar, PasteImageButton, useNoteImagePaste, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import type { AttachmentDraft } from '@/services/attachment-import';
import type { createMessageRepository } from '@/db/repositories';
import { draftHasRichContent, noteHasChecklist, draftImageCount, noteBlocksText, textDraft, type NoteDraftBlock } from '@/services/note-content';

// `blocks` is set only when the note has pasted images: its text and images in
// order. `attachments` are the ones picked to attach, in the order picked.
export type NoteSubmission = { text: string; attachments: AttachmentDraft['attachment'][]; blocks: NoteDraftBlock[] | null };

/**
 * Saves a submitted note as a thought, the same way wherever Add note opened.
 * Plain words with one attachment stay the plain attachment note chat makes;
 * anything richer is a note with its attachments.
 */
export async function createSubmittedNote(messages: Pick<ReturnType<typeof createMessageRepository>, 'createNote' | 'createAttachmentMessage' | 'createText'>, { text, attachments, blocks }: NoteSubmission): Promise<string> {
  if (blocks || attachments.length > 1) return messages.createNote({ blocks: blocks ?? textDraft(text), attachments });
  if (attachments[0]) return (await messages.createAttachmentMessage(attachments[0], text || null)).id;
  return (await messages.createText(text)).id;
}

type Props = {
  visible: boolean;
  // Omitted when the note isn't going into a board (e.g. the Cards tab), in
  // which case it's saved as an unorganized note, same as a Chat thought.
  boardName?: string;
  columnName?: string;
  onClose: () => void;
  onSubmit: (note: NoteSubmission) => Promise<void>;
  /** Sheet title (default "Add note"). */
  title?: string;
  /** Replaces the "Adding to…" / "Saved to Unorganized" line. */
  context?: ReactNode;
  /** Extra fields under the note (Calendar's date, time and reminder); the sheet scrolls when set. */
  extra?: ReactNode;
  /** One line standing in for `extra` in full screen while the keyboard is up, so the note keeps the room. */
  extraSummary?: string;
  /** False while those fields aren't valid yet. */
  canSubmit?: boolean;
  initialBlocks?: NoteDraftBlock[];
  /** Open directly into the full-screen editor, without the capture chooser. */
  startFullscreen?: boolean;
  /** When it opens straight into the editor, put the cursor in the note and raise the keyboard. */
  focusOnOpen?: boolean;
};


const MAX_NOTE_LENGTH = 10000;

// The lightweight composer for "+ Add note" — contextual capture straight into a
// known board/column (or Unorganized), as opposed to Chat's own composer (deeply
// tied to its scroll/keyboard machinery). A note can be text, one photo/video/file,
// or both — plus any number of images pasted from the clipboard, inline with the
// text where the cursor was. Picking and storage are the same shared path Chat uses
// (services/attachment-import), so media is optimized and stored identically; a
// staged file is deleted again if the sheet is dismissed without adding.
export function AddNoteSheet({ visible, boardName, columnName, onClose, onSubmit, title = tr("id.addNote"), context, extra, extraSummary, canSubmit = true, initialBlocks, startFullscreen = false, focusOnOpen = true }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const desk = useDesk();
  const paragraphFont = useFontStyle('paragraph');
  const inputRef = useRef<NoteBlocksEditorControl>(null);
  const wasVisible = useRef(false);
  const [stage, setStage] = useState<'choice' | 'templates' | 'editor'>(initialBlocks || startFullscreen ? 'editor' : 'choice');
  const libraryRef = useRef<TemplateLibraryHandle>(null);
  const [runSubmit] = useState(createSingleFlight);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>(() => textDraft());
  const [saving, setSaving] = useState(false);
  // Attachments picked so far: staged into Chits storage, deleted again if the note isn't added.
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  // Folded away like Edit Note's until it's wanted; open while a recording runs in it.
  const [showAttachments, setShowAttachments] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Full-screen writing mode (like Edit Note) for longer notes; same state, so
  // text and any attachment carry over when switching either way.
  const [fullscreen, setFullscreen] = useState(startFullscreen);
  const keyboardVisible = useKeyboardInset() > 0;

  useLayoutEffect(() => {
    if (visible && !wasVisible.current) {
      setFullscreen(startFullscreen);
      setBlocks(initialBlocks ?? textDraft());
      setStage(initialBlocks || startFullscreen ? 'editor' : 'choice');
      setSaving(false);
      setDrafts([]);
      setShowAttachments(false);
      setError(null);
    }
    wasVisible.current = visible;
  }, [visible, initialBlocks, startFullscreen]);

  const trimmed = noteBlocksText(blocks);
  const imageCount = draftImageCount(blocks);
  const changeBlocks = useCallback((update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => { setBlocks(update); setError(null); }, [setBlocks, setError]);
  const pasteImage = useNoteImagePaste({ active: visible, blocks, setBlocks: changeBlocks, editor: inputRef, onError: setError });
  const busy = saving || pasteImage.pasting;
  const canAdd = (Boolean(trimmed) || noteHasChecklist(blocks) || drafts.length > 0 || imageCount > 0) && canSubmit && !busy;

  const discardDrafts = () => {
    for (const draft of drafts) void draft.remove().catch(() => undefined);
    setDrafts([]);
  };
  // The same list and the same two ways to add a photo as Edit Note: "Photo"
  // attaches it, "Insert photo inline" places it in the text at the cursor.
  const addDraft = (draft: AttachmentDraft) => { setError(null); setDrafts((current) => [...current, draft]); };
  const insertInline = (draft: AttachmentDraft) => { setError(null); pasteImage.insertAttachment(draft); };
  const removeDraft = (item: NoteAttachmentItem) => {
    const draft = drafts.find((candidate) => candidate.attachment.storagePath === item.key);
    if (!draft) return;
    setDrafts((current) => current.filter((candidate) => candidate !== draft));
    void draft.remove().catch(() => undefined);
  };

  // Dismissing without adding deletes the staged copy so nothing is orphaned.
  const close = () => {
    if (busy) return;
    discardDrafts();
    discardPastedImages(blocks);
    setBlocks(textDraft());
    onClose();
  };

  const toggleFullscreen = () => {
    setFullscreen((current) => !current);
    // The other layout has its own input; keep the cursor in the note.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const noteInput = (
    <NoteBlocksEditor
      ref={inputRef}
      fillViewport={fullscreen}
      accessibilityLabel={tr("addnotesheet.noteText")}
      blocks={blocks}
      onChangeBlocks={changeBlocks}
      onReplaceImage={(key) => void pasteImage.pick(key)}
      placeholder={tr('editcontent.startWriting')}
      maxLength={MAX_NOTE_LENGTH}
      editable={!busy}
      maxImageHeight={fullscreen ? 320 : 140}
      singleInputStyle={fullscreen
        ? [noteEditorStyles.input, paragraphFont, { color: theme.textPrimary }]
        : [styles.input, controls.input, drafts.length > 0 && styles.inputWithAttachment, { backgroundColor: theme.background, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
      blockContainerStyle={fullscreen
        ? noteEditorStyles.blocks
        : [styles.blocksBox, controls.input as ViewStyle | null, { backgroundColor: theme.background, borderColor: theme.borderSubtle }]}
      blockInputStyle={[fullscreen ? [noteEditorStyles.blockInput, paragraphFont] : styles.blockInput, !fullscreen && controls.input ? { fontFamily: controls.input.fontFamily, fontWeight: controls.input.fontWeight } : null, { color: theme.textPrimary }]}
    />
  );
  const pasteButton = <PasteImageButton visible={pasteImage.canPaste} pasting={pasteImage.pasting && !pasteImage.picking} disabled={saving || pasteImage.picking} onPress={() => void pasteImage.paste()} />;

  const attachmentArea = <>
    <View style={[styles.attachToggle, fullscreen && styles.attachToggleFull, rowStyle]}>
      <NoteAttachmentToggle count={drafts.length} open={showAttachments} disabled={recording} onPress={() => setShowAttachments((open) => !open)} />
    </View>
    {showAttachments ? <NoteAttachmentList style={fullscreen ? styles.attachmentsFull : styles.attachments} disabled={busy} onRemove={removeDraft} onError={setError}
      items={drafts.map((draft) => ({ key: draft.attachment.storagePath, attachment: { ...draft.attachment, id: draft.attachment.storagePath, createdAt: 0 }, saved: false }))}
      footer={<AttachmentPicker disabled={busy} onSelected={addDraft} onInlineSelected={insertInline} onError={setError} onRecordingChange={setRecording}
        renderTrigger={({ open, disabled }) => <NoteAttachmentAddRow label={tr('id.addAttachment')} disabled={disabled} onPress={open} />} />} /> : null}
    {pasteImage.canPaste || pasteImage.pasting ? <View style={[styles.attachRow, fullscreen && styles.attachRowFull]}>{pasteButton}</View> : null}
  </>;

  const contextLine = context ?? (boardName && columnName
    ? <AppText accessibilityLabel={tr("addnotesheet.addingToValueValue", { value1: boardName, value2: columnName })} style={[styles.context, { color: theme.textSecondary }]}>{tr("addnotesheet.addingTo")}{' '}<AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{boardName}</AppText>  ›  <AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{columnName}</AppText></AppText>
    : <AppText style={[styles.context, { color: theme.textSecondary }]}>{tr("addnotesheet.savedTo")}{' '}<AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{tr("index.unorganized")}</AppText> {' '}{tr("addnotesheet.addItToABoardAnytime")}</AppText>);

  const submit = async () => {
    if (!canAdd) return;
    await runSubmit(async () => {
      setSaving(true);
      setError(null);
      try {
        await onSubmit({ text: trimmed, attachments: drafts.map((draft) => draft.attachment), blocks: draftHasRichContent(blocks) ? blocks : null });
        // Saved: the files now belong to the note, so they must not be removed.
        setDrafts([]);
        setBlocks(textDraft());
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : tr("addnotesheet.couldnTAddThatNoteTryAgain"));
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => { if (inputRef.current?.dismissActivePanel()) return; if (stage === 'templates') libraryRef.current?.back(); else close(); }}
      onShow={() => { if (focusOnOpen && (initialBlocks || startFullscreen)) requestAnimationFrame(() => inputRef.current?.focus()); }}
    >
      <SafeAreaProvider>
      <KeyboardPane style={[styles.backdrop, fullscreen && { backgroundColor: desk.desk }]}>
        {stage === 'choice' ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('attachments.close')} onPress={close} style={StyleSheet.absoluteFill} />
          <BottomSheetSurface style={styles.choiceSurface}>
            <SafeAreaView edges={['bottom']} style={styles.choiceSafe}>
              <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
              <View style={[styles.choiceHeading, rowStyle]}><AppText accessibilityRole="header" variant="display" weight="600" style={[styles.choiceTitle, { color: theme.textPrimary }]}>{tr('templates.choose')}</AppText><IconButton label={tr('attachments.close')} onPress={close}><Icon name="close" size={22} color={theme.textPrimary} /></IconButton></View>
              <View style={styles.choiceContext}>{contextLine}</View>
              {(['blank', 'fromTemplate'] as const).map((kind) => <Pressable key={kind} accessibilityRole="button" onPress={() => { setStage(kind === 'blank' ? 'editor' : 'templates'); if (kind === 'blank') requestAnimationFrame(() => inputRef.current?.focus()); }} style={({ pressed }) => [styles.choiceRow, rowStyle, pressed && styles.pressed]}><Icon name={kind === 'blank' ? 'document-outline' : 'grid-outline'} size={22} color={theme.textPrimary} /><AppText style={[styles.choiceLabel, { color: theme.textPrimary }]}>{tr(`templates.${kind}`)}</AppText><Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.textMuted} /></Pressable>)}
              <Pressable accessibilityRole="button" onPress={() => { close(); router.push('/canvas-new'); }} style={({ pressed }) => [styles.choiceRow, rowStyle, pressed && styles.pressed]}><Icon name="easel-outline" size={22} color={theme.textPrimary} /><AppText style={[styles.choiceLabel, { color: theme.textPrimary }]}>New Canvas</AppText><Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.textMuted} /></Pressable>
            </SafeAreaView>
          </BottomSheetSurface>
        </> : stage === 'templates' ? <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.fullScreen, { backgroundColor: theme.background }]}>
          <AppDialogProvider><TemplateLibrary ref={libraryRef} onClose={() => setStage('choice')} onSelect={(next) => { setBlocks(next); setStage('editor'); setFullscreen(true); requestAnimationFrame(() => inputRef.current?.focus()); }} /></AppDialogProvider>
        </SafeAreaView> : fullscreen ? (
          <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fullScreen, { backgroundColor: theme.cardPaper }]}>
            {/* One continuous editing page, with the shared toolbar above the keyboard. */}
            <AppHeader
              title={title}
              leading={<IconButton label={tr("addnotesheet.exitFullScreen")} disabled={saving} onPress={toggleFullscreen}><HeaderIcon name="contract-outline" size={22} /></IconButton>}
              trailing={<IconButton label={tr("id.addNote")} disabled={!canAdd} onPress={() => void submit()}>{saving ? <ActivityIndicator accessibilityLabel={tr("addnotesheet.addingNote")} size="small" color={theme.accent} /> : <HeaderIcon name="checkmark" size={24} />}</IconButton>}
            />
            <View style={[noteEditorStyles.fullscreenPage, { backgroundColor: theme.cardPaper }]}>
              <View style={styles.fullContext}>{contextLine}</View>
              {/* Attachments sit above the note, where Edit Note lists them. */}
              {attachmentArea}
              <View style={noteEditorStyles.fullscreenPage}>{noteInput}</View>
              <View style={styles.fullFooter}>
                {extra ? (keyboardVisible && extraSummary
                  ? <Pressable accessibilityRole="button" accessibilityLabel={tr("addnotesheet.valueHideKeyboardToChange", { value1: extraSummary })} onPress={() => Keyboard.dismiss()} style={({ pressed }) => [styles.summary, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
                    <Icon name="calendar-outline" size={16} color={theme.textSecondary} />
                    <AppText numberOfLines={1} style={[styles.summaryText, { color: theme.textPrimary }]}>{extraSummary}</AppText>
                    <Icon name="chevron-up" size={16} color={theme.textSecondary} />
                  </Pressable>
                  : <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.extraFull}>{extra}</ScrollView>) : null}
                {error ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</AppText> : null}
              </View>
              <NoteToolbar editor={inputRef} images={pasteImage} disabled={saving} safeBottom />
            </View>
          </SafeAreaView>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("addnotesheet.closeAddNote")} style={StyleSheet.absoluteFill} onPress={close} />
            {/* The keyboard covers the home indicator / navigation bar, so that room goes while it's up. */}
            <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={[styles.safeArea, { backgroundColor: theme.surface }]}>
              <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
                <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
                <ScrollView scrollEnabled={Boolean(extra)} bounces={false} keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
                  <View style={styles.titleRow}>
                    <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{title}</AppText>
                    <Pressable accessibilityRole="button" accessibilityLabel={tr("addnotesheet.writeInFullScreen")} hitSlop={8} disabled={busy} onPress={toggleFullscreen} style={({ pressed }) => [styles.expandButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
                      <Icon name="expand-outline" size={18} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                  {contextLine}
                  {noteInput}
                  <NoteToolbar editor={inputRef} disabled={busy} />
                  {attachmentArea}
                  {extra ? <View style={styles.extra}>{extra}</View> : null}
                  {error ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</AppText> : null}

                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                      <AppText style={[styles.cancelText, { color: theme.textSecondary }]}>{tr("chat.cancel")}</AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tr("id.addNote")}
                      accessibilityState={{ disabled: !canAdd }}
                      disabled={!canAdd}
                      onPress={() => void submit()}
                      style={({ pressed }) => [styles.addButton, controls.button, { backgroundColor: theme.accent }, !canAdd && styles.disabled, pressed && canAdd && styles.pressed]}
                    >
                      {saving ? <ActivityIndicator accessibilityLabel={tr("addnotesheet.addingNote")} size="small" color={theme.accentText} /> : <AppText style={[styles.addText, { color: theme.accentText }]}>{tr("addnotesheet.add")}</AppText>}
                    </Pressable>
                  </View>
                </ScrollView>
              </GlassSurface>
            </SafeAreaView>
          </>
        )}
      </KeyboardPane>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  choiceSafe: { width: '100%' },
  choiceSurface: { paddingBottom: spacing.sm },
  choiceHeading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  choiceTitle: { flex: 1, fontSize: 18, lineHeight: 26 },
  choiceContext: { paddingHorizontal: spacing.lg },
  choiceRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  choiceLabel: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '500' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  safeArea: { width: '100%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, borderRadius: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  extra: { marginTop: spacing.sm },
  // In full screen the fields never take more than about half the page from the note.
  extraFull: { flexGrow: 0, maxHeight: 320, marginTop: spacing.xs },
  summary: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 12, marginTop: spacing.xs },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '600' },
  title: { flex: 1, fontSize: 20, lineHeight: 25, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  expandButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  // Full-screen mode is Edit Note's page (card/edit-content): the shared
  // header, paper and toolbar, with this sheet's attachments and fields above the toolbar.
  fullScreen: { flex: 1, alignSelf: 'stretch' },
  fullContext: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  fullFooter: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  context: { marginTop: spacing.xxs, marginBottom: spacing.md, fontSize: 13, lineHeight: 18 },
  inputWithAttachment: { minHeight: 64 },
  attachRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  attachToggle: { marginTop: spacing.xxs },
  attachToggleFull: { marginTop: 0, paddingHorizontal: spacing.md },
  attachments: { marginHorizontal: 0, marginBottom: 0, marginTop: 0 },
  attachmentsFull: { marginTop: 0 },
  attachRowFull: { paddingHorizontal: spacing.md, marginTop: 0, marginBottom: spacing.xs },
  input: { minHeight: 96, maxHeight: 220, borderWidth: 1, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  // With pasted images the box scrolls as a whole; its inputs grow with their text.
  blocksBox: { flexGrow: 0, minHeight: 96, maxHeight: 280, borderWidth: 1, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  blockInput: { minHeight: 24, padding: 0, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  message: { marginTop: spacing.xs, fontSize: 12, lineHeight: 17 },
  actions: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '700' },
  addButton: { minWidth: 88, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12 },
  addText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
