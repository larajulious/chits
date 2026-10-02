import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { GlassSurface } from '@/components/ui/glass-surface';
import { spacing } from '@/constants/theme';
import { AttachmentDraftPreview } from '@/components/chat/attachment-draft-preview';
import { pickAndStageFile, pickAndStageMedia, type AttachmentDraft } from '@/services/attachment-import';

export type NoteSubmission = { text: string; attachment: AttachmentDraft['attachment'] | null };

type Props = {
  visible: boolean;
  // Omitted when the note isn't going into a board (e.g. the Cards tab), in
  // which case it's saved as an unorganized note, same as a Chat thought.
  boardName?: string;
  columnName?: string;
  onClose: () => void;
  onSubmit: (note: NoteSubmission) => Promise<void>;
};

const ATTACH_OPTIONS = [
  { key: 'photo', label: 'Photo', icon: 'image-outline' },
  { key: 'video', label: 'Video', icon: 'videocam-outline' },
  { key: 'file', label: 'File', icon: 'document-outline' },
] as const;

const MAX_NOTE_LENGTH = 10000;

// The lightweight composer for "+ Add note" — contextual capture straight into a
// known board/column (or Unorganized), as opposed to Chat's own composer (deeply
// tied to its scroll/keyboard machinery). A note can be text, one photo/video/file,
// or both. Picking and storage are the same shared path Chat uses
// (services/attachment-import), so media is optimized and stored identically; a
// staged file is deleted again if the sheet is dismissed without adding.
export function AddNoteSheet({ visible, boardName, columnName, onClose, onSubmit }: Props) {
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [staging, setStaging] = useState(false);
  const [draft, setDraft] = useState<AttachmentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Full-screen writing mode (like Edit Note) for longer notes; same state, so
  // text and any attachment carry over when switching either way.
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setFullscreen(false);
      setText('');
      setSaving(false);
      setStaging(false);
      setDraft(null);
      setError(null);
    }
    wasVisible.current = visible;
  }, [visible]);

  const trimmed = text.trim();
  const busy = saving || staging;
  const canAdd = (Boolean(trimmed) || Boolean(draft)) && !busy;

  const discardDraft = () => {
    if (!draft) return;
    void draft.remove().catch(() => undefined);
    setDraft(null);
  };

  // Dismissing without adding deletes the staged copy so nothing is orphaned.
  const close = () => {
    if (busy) return;
    discardDraft();
    onClose();
  };

  const attach = async (kind: typeof ATTACH_OPTIONS[number]['key']) => {
    if (busy || draft) return;
    setStaging(true);
    setError(null);
    try {
      const staged = kind === 'file' ? await pickAndStageFile() : await pickAndStageMedia(kind);
      if (staged) setDraft(staged);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That attachment could not be added.');
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
    <TextInput
      ref={inputRef}
      accessibilityLabel="Note text"
      value={text}
      onChangeText={(value) => { setText(value); setError(null); }}
      placeholder={fullscreen ? 'Start writing…' : 'Write something...'}
      placeholderTextColor={theme.textMuted}
      selectionColor={theme.accent}
      cursorColor={theme.accent}
      multiline
      scrollEnabled
      textAlignVertical="top"
      maxLength={MAX_NOTE_LENGTH}
      editable={!saving}
      style={fullscreen
        ? [styles.fullInput, { color: theme.textPrimary }]
        : [styles.input, controls.input, draft && styles.inputWithAttachment, { backgroundColor: theme.background, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
    />
  );

  const attachmentArea = draft ? (
    <View style={styles.attachmentPreview}>
      <AttachmentDraftPreview draft={draft} compact={fullscreen} onRemove={discardDraft} />
    </View>
  ) : (
    <View style={styles.attachRow}>
      {ATTACH_OPTIONS.map((option) => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityLabel={`Attach ${option.label.toLowerCase()}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void attach(option.key)}
          style={({ pressed }) => [styles.attachChip, controls.panel, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, busy && styles.disabled, pressed && styles.pressed]}
        >
          <Icon name={option.icon} size={17} color={theme.textSecondary} />
          <AppText style={[styles.attachLabel, { color: theme.textPrimary }]}>{option.label}</AppText>
        </Pressable>
      ))}
      {staging ? <ActivityIndicator accessibilityLabel="Preparing attachment" size="small" color={theme.textMuted} /> : null}
    </View>
  );

  const contextLine = boardName && columnName
    ? <AppText accessibilityLabel={`Adding to ${boardName}, ${columnName}`} style={[styles.context, { color: theme.textSecondary }]}>Adding to <AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{boardName}</AppText>  ›  <AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>{columnName}</AppText></AppText>
    : <AppText style={[styles.context, { color: theme.textSecondary }]}>Saved to <AppText style={{ color: theme.textPrimary, fontWeight: '700' }}>Unorganized</AppText> — add it to a board anytime.</AppText>;

  const submit = async () => {
    if (!canAdd) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ text: trimmed, attachment: draft?.attachment ?? null });
      // Saved: the file now belongs to the note, so it must not be removed.
      setDraft(null);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t add that note. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      onShow={() => requestAnimationFrame(() => inputRef.current?.focus())}
    >
      <KeyboardAvoidingView style={[styles.backdrop, fullscreen && { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {fullscreen ? (
          <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.fullScreen}>
            {/* Same header pattern as Edit Note: exit on the left, Add (✓) on the right. */}
            <View style={[styles.fullHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Exit full screen" hitSlop={8} disabled={saving} onPress={toggleFullscreen} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
                <Icon name="contract-outline" size={22} color={theme.textPrimary} />
              </Pressable>
              <AppText accessibilityRole="header" style={[styles.fullTitle, { color: theme.textPrimary }]}>Add note</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Add note" accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} hitSlop={8} onPress={() => void submit()} style={({ pressed }) => [styles.headerButton, pressed && canAdd && styles.pressed]}>
                {saving ? <ActivityIndicator accessibilityLabel="Adding note" size="small" color={theme.accent} /> : <Icon name="checkmark" size={24} color={canAdd ? theme.accent : theme.textMuted} />}
              </Pressable>
            </View>
            <View style={styles.fullContext}>{contextLine}</View>
            {noteInput}
            <View style={[styles.fullFooter, { borderTopColor: theme.borderSubtle }]}>
              {error ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</AppText> : null}
              {attachmentArea}
            </View>
          </SafeAreaView>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Close add note" style={StyleSheet.absoluteFill} onPress={close} />
            <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.surface }]}>
              <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
                <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
                <View style={styles.content}>
                  <View style={styles.titleRow}>
                    <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Add note</AppText>
                    <Pressable accessibilityRole="button" accessibilityLabel="Write in full screen" hitSlop={8} disabled={busy} onPress={toggleFullscreen} style={({ pressed }) => [styles.expandButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
                      <Icon name="expand-outline" size={18} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                  {contextLine}
                  {noteInput}
                  {attachmentArea}
                  {error ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</AppText> : null}

                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                      <AppText style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add note"
                      accessibilityState={{ disabled: !canAdd }}
                      disabled={!canAdd}
                      onPress={() => void submit()}
                      style={({ pressed }) => [styles.addButton, controls.button, { backgroundColor: theme.accent }, !canAdd && styles.disabled, pressed && canAdd && styles.pressed]}
                    >
                      {saving ? <ActivityIndicator accessibilityLabel="Adding note" size="small" color={theme.accentText} /> : <AppText style={[styles.addText, { color: theme.accentText }]}>Add</AppText>}
                    </Pressable>
                  </View>
                </View>
              </GlassSurface>
            </SafeAreaView>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  safeArea: { width: '100%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, borderRadius: 2 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
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
  message: { marginTop: spacing.xs, fontSize: 12, lineHeight: 17 },
  actions: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '700' },
  addButton: { minWidth: 88, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12 },
  addText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
