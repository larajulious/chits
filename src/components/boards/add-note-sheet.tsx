import { AppDialogProvider } from '@/components/dialogs/app-dialog-provider';
import { TemplateLibrary, type TemplateLibraryHandle } from '@/features/templates/template-library';
import { createSingleFlight } from '@/services/note-templates';
import { tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { BottomSheetSurface, IconButton } from '@/components/ui/primitives';
import { GlassSurface } from '@/components/ui/glass-surface';
import { spacing } from '@/constants/theme';
import { AttachmentDraftPreview } from '@/components/chat/attachment-draft-preview';
import { discardPastedImages, NoteBlocksEditor, InsertImageButton, NoteListButtons, PasteImageButton, useNoteImagePaste, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { pickAndStageFile, pickAndStageMedia, type AttachmentDraft } from '@/services/attachment-import';
import { draftHasRichContent, noteHasChecklist, draftImageCount, noteBlocksText, textDraft, type NoteDraftBlock } from '@/services/note-content';

// `blocks` is set only when the note has pasted images: its text and images in order.
export type NoteSubmission = { text: string; attachment: AttachmentDraft['attachment'] | null; blocks: NoteDraftBlock[] | null };

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
};

const ATTACH_OPTIONS = [
  { key: 'photo', get label() { return tr("id.photo"); }, icon: 'image-outline' },
  { key: 'video', get label() { return tr("addcardattachmentsheet.video"); }, icon: 'videocam-outline' },
  { key: 'file', get label() { return tr("addcardattachmentsheet.file"); }, icon: 'document-outline' },
] as const;

const MAX_NOTE_LENGTH = 10000;

// The lightweight composer for "+ Add note" — contextual capture straight into a
// known board/column (or Unorganized), as opposed to Chat's own composer (deeply
// tied to its scroll/keyboard machinery). A note can be text, one photo/video/file,
// or both — plus any number of images pasted from the clipboard, inline with the
// text where the cursor was. Picking and storage are the same shared path Chat uses
// (services/attachment-import), so media is optimized and stored identically; a
// staged file is deleted again if the sheet is dismissed without adding.
export function AddNoteSheet({ visible, boardName, columnName, onClose, onSubmit, title = tr("id.addNote"), context, extra, extraSummary, canSubmit = true, initialBlocks }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const inputRef = useRef<NoteBlocksEditorControl>(null);
  const wasVisible = useRef(false);
  const [stage, setStage] = useState<'choice' | 'templates' | 'editor'>('choice');
  const libraryRef = useRef<TemplateLibraryHandle>(null);
  const [runSubmit] = useState(createSingleFlight);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>(() => textDraft());
  const [saving, setSaving] = useState(false);
  const [staging, setStaging] = useState(false);
  const [draft, setDraft] = useState<AttachmentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Full-screen writing mode (like Edit Note) for longer notes; same state, so
  // text and any attachment carry over when switching either way.
  const [fullscreen, setFullscreen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!visible || !extra) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [visible, extra]);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setFullscreen(false);
      setBlocks(initialBlocks ?? textDraft());
      setStage(initialBlocks ? 'editor' : 'choice');
      setSaving(false);
      setStaging(false);
      setDraft(null);
      setError(null);
    }
    wasVisible.current = visible;
  }, [visible, initialBlocks]);

  const trimmed = noteBlocksText(blocks);
  const imageCount = draftImageCount(blocks);
  const changeBlocks = useCallback((update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => { setBlocks(update); setError(null); }, [setBlocks, setError]);
  const pasteImage = useNoteImagePaste({ active: visible, blocks, setBlocks: changeBlocks, editor: inputRef, onError: setError });
  const busy = saving || staging || pasteImage.pasting;
  const canAdd = (Boolean(trimmed) || noteHasChecklist(blocks) || Boolean(draft) || imageCount > 0) && canSubmit && !busy;

  const discardDraft = () => {
    if (!draft) return;
    void draft.remove().catch(() => undefined);
    setDraft(null);
  };

  // Dismissing without adding deletes the staged copy so nothing is orphaned.
  const close = () => {
    if (busy) return;
    discardDraft();
    discardPastedImages(blocks);
    setBlocks(textDraft());
    onClose();
  };

  const attach = async (kind: typeof ATTACH_OPTIONS[number]['key'], inline = false) => {
    if (busy || draft) return;
    const cursor = inputRef.current?.cursor() ?? null;
    setStaging(true);
    setError(null);
    try {
      const staged = kind === 'file' ? await pickAndStageFile() : await pickAndStageMedia(kind);
      if (staged) { if (inline) pasteImage.insertAttachment(staged, cursor); else setDraft(staged); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("id.thatAttachmentCouldNotBeAdded"));
    } finally {
      setStaging(false);
    }
  };

  const toggleFullscreen = () => {
    setFullscreen((current) => !current);
    // The other layout has its own input; keep the cursor in the note.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const noteInput = (
    <NoteBlocksEditor
      ref={inputRef}
      accessibilityLabel={tr("addnotesheet.noteText")}
      blocks={blocks}
      onChangeBlocks={changeBlocks}
      onReplaceImage={(key) => void pasteImage.pick(key)}
      placeholder={tr('editcontent.startWriting')}
      maxLength={MAX_NOTE_LENGTH}
      editable={!busy}
      maxImageHeight={fullscreen ? 320 : 140}
      singleInputStyle={fullscreen
        ? [styles.fullInput, { color: theme.textPrimary }]
        : [styles.input, controls.input, draft && styles.inputWithAttachment, { backgroundColor: theme.background, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
      blockContainerStyle={fullscreen
        ? styles.fullBlocks
        : [styles.blocksBox, controls.input as ViewStyle | null, { backgroundColor: theme.background, borderColor: theme.borderSubtle }]}
      blockInputStyle={[fullscreen ? styles.fullBlockInput : styles.blockInput, !fullscreen && controls.input ? { fontFamily: controls.input.fontFamily, fontWeight: controls.input.fontWeight } : null, { color: theme.textPrimary }]}
    />
  );
  const pasteButton = <PasteImageButton visible={pasteImage.canPaste} pasting={pasteImage.pasting && !pasteImage.picking} disabled={saving || staging || pasteImage.picking} onPress={() => void pasteImage.paste()} />;

  const attachmentArea = draft ? (
    <View style={styles.attachmentPreview}>
      <AttachmentDraftPreview draft={draft} compact={fullscreen} onRemove={discardDraft} />
      {pasteImage.canPaste || pasteImage.pasting ? <View style={styles.attachRow}>{pasteButton}</View> : null}
    </View>
  ) : (
    <View style={styles.attachRow}>
      {pasteButton}
      {ATTACH_OPTIONS.map((option) => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityLabel={tr("addnotesheet.attachValue", { value1: option.label.toLowerCase() })}
          accessibilityHint={option.key === 'photo' ? tr("addnotesheet.holdToInsertAPhotoAtTheCursor") : undefined}
          onLongPress={option.key === 'photo' ? () => void attach('photo', true) : undefined}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void attach(option.key)}
          style={({ pressed }) => [styles.attachChip, controls.panel, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, busy && styles.disabled, pressed && styles.pressed]}
        >
          <Icon name={option.icon} size={17} color={theme.textSecondary} />
          <AppText style={[styles.attachLabel, { color: theme.textPrimary }]}>{option.label}</AppText>
        </Pressable>
      ))}
      {staging ? <ActivityIndicator accessibilityLabel={tr("addnotesheet.preparingAttachment")} size="small" color={theme.textMuted} /> : null}
    </View>
  );

  const contextLine = context ?? (boardName && columnName
    ? <AppText accessibilityLabel={tr("addnotesheet.addingToValueValue", { value1: boardName, value2: columnName })} style={[styles.context, { color: theme.textSecondary }]}>{tr("addnotesheet.addingTo")}{' '}<AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{boardName}</AppText>  ›  <AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{columnName}</AppText></AppText>
    : <AppText style={[styles.context, { color: theme.textSecondary }]}>{tr("addnotesheet.savedTo")}{' '}<AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{tr("index.unorganized")}</AppText> {' '}{tr("addnotesheet.addItToABoardAnytime")}</AppText>);

  const submit = async () => {
    if (!canAdd) return;
    await runSubmit(async () => {
      setSaving(true);
      setError(null);
      try {
        await onSubmit({ text: trimmed, attachment: draft?.attachment ?? null, blocks: draftHasRichContent(blocks) ? blocks : null });
        // Saved: the file now belongs to the note, so it must not be removed.
        setDraft(null);
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
      onRequestClose={() => stage === 'templates' ? libraryRef.current?.back() : close()}
      onShow={() => { if (initialBlocks) requestAnimationFrame(() => inputRef.current?.focus()); }}
    >
      <SafeAreaProvider>
      <KeyboardAvoidingView style={[styles.backdrop, fullscreen && { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {stage === 'choice' ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('attachments.close')} onPress={close} style={StyleSheet.absoluteFill} />
          <BottomSheetSurface style={styles.choiceSurface}>
            <SafeAreaView edges={['bottom']} style={styles.choiceSafe}>
              <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
              <View style={[styles.choiceHeading, rowStyle]}><AppText accessibilityRole="header" variant="display" weight="600" style={[styles.choiceTitle, { color: theme.textPrimary }]}>{tr('templates.choose')}</AppText><IconButton label={tr('attachments.close')} onPress={close}><Icon name="close" size={22} color={theme.textPrimary} /></IconButton></View>
              <View style={styles.choiceContext}>{contextLine}</View>
              {(['blank', 'fromTemplate'] as const).map((kind) => <Pressable key={kind} accessibilityRole="button" onPress={() => { setStage(kind === 'blank' ? 'editor' : 'templates'); if (kind === 'blank') requestAnimationFrame(() => inputRef.current?.focus()); }} style={({ pressed }) => [styles.choiceRow, rowStyle, pressed && styles.pressed]}><Icon name={kind === 'blank' ? 'document-outline' : 'grid-outline'} size={22} color={theme.textPrimary} /><AppText style={[styles.choiceLabel, { color: theme.textPrimary }]}>{tr(`templates.${kind}`)}</AppText><Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.textMuted} /></Pressable>)}
            </SafeAreaView>
          </BottomSheetSurface>
        </> : stage === 'templates' ? <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.fullScreen, { backgroundColor: theme.background }]}>
          <AppDialogProvider><TemplateLibrary ref={libraryRef} onClose={() => setStage('choice')} onSelect={(next) => { setBlocks(next); setStage('editor'); setFullscreen(true); requestAnimationFrame(() => inputRef.current?.focus()); }} /></AppDialogProvider>
        </SafeAreaView> : fullscreen ? (
          <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.fullScreen}>
            {/* Same header pattern as Edit Note: exit on the left, Add (✓) on the right. */}
            <View style={[styles.fullHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={tr("addnotesheet.exitFullScreen")} hitSlop={8} disabled={saving} onPress={toggleFullscreen} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
                <Icon name="contract-outline" size={22} color={theme.textPrimary} />
              </Pressable>
              <AppText accessibilityRole="header" style={[styles.fullTitle, { color: theme.textPrimary }]}>{title}</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={tr("id.addNote")} accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} hitSlop={8} onPress={() => void submit()} style={({ pressed }) => [styles.headerButton, pressed && canAdd && styles.pressed]}>
                {saving ? <ActivityIndicator accessibilityLabel={tr("addnotesheet.addingNote")} size="small" color={theme.accent} /> : <Icon name="checkmark" size={24} color={canAdd ? theme.accent : theme.textMuted} />}
              </Pressable>
            </View>
            <View style={styles.fullContext}>{contextLine}</View>
            {noteInput}
            <View style={[styles.fullFooter, { borderTopColor: theme.borderSubtle }]}>
              {extra ? (keyboardVisible && extraSummary
                ? <Pressable accessibilityRole="button" accessibilityLabel={tr("addnotesheet.valueHideKeyboardToChange", { value1: extraSummary })} onPress={() => Keyboard.dismiss()} style={({ pressed }) => [styles.summary, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
                  <Icon name="calendar-outline" size={16} color={theme.textSecondary} />
                  <AppText numberOfLines={1} style={[styles.summaryText, { color: theme.textPrimary }]}>{extraSummary}</AppText>
                  <Icon name="chevron-up" size={16} color={theme.textSecondary} />
                </Pressable>
                : <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.extraFull}>{extra}</ScrollView>) : null}
              {error ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</AppText> : null}
              <View style={styles.attachRow}><InsertImageButton disabled={saving || staging} busy={pasteImage.pasting} onPress={() => void pasteImage.pick()} /><NoteListButtons editor={inputRef} disabled={busy} /></View>
              {attachmentArea}
            </View>
          </SafeAreaView>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("addnotesheet.closeAddNote")} style={StyleSheet.absoluteFill} onPress={close} />
            <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.surface }]}>
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
      </KeyboardAvoidingView>
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
  // Full-screen mode mirrors Edit Note (card/edit-content): plain header, the
  // page itself is the writing surface, attachments sit above the keyboard.
  fullScreen: { flex: 1, alignSelf: 'stretch' },
  fullHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fullTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  fullContext: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  fullInput: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, fontSize: 17, lineHeight: 27 },
  fullFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  context: { marginTop: spacing.xxs, marginBottom: spacing.md, fontSize: 13, lineHeight: 18 },
  inputWithAttachment: { minHeight: 64 },
  attachRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  attachChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  attachLabel: { fontSize: 14, fontWeight: '600' },
  attachmentPreview: { marginTop: spacing.sm },
  input: { minHeight: 96, maxHeight: 220, borderWidth: 1, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  // With pasted images the box scrolls as a whole; its inputs grow with their text.
  blocksBox: { flexGrow: 0, minHeight: 96, maxHeight: 280, borderWidth: 1, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  blockInput: { minHeight: 24, padding: 0, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  fullBlocks: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  fullBlockInput: { minHeight: 27, padding: 0, fontSize: 17, lineHeight: 27, textAlignVertical: 'top' },
  message: { marginTop: spacing.xs, fontSize: 12, lineHeight: 17 },
  actions: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '700' },
  addButton: { minWidth: 88, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12 },
  addText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
