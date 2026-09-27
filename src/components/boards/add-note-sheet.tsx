import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/components/theme-provider';
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
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [staging, setStaging] = useState(false);
  const [draft, setDraft] = useState<AttachmentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current) {
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
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close add note" style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.surface }]}>
          <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
            <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.content}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Add note</Text>
              {boardName && columnName ? <Text accessibilityLabel={`Adding to ${boardName}, ${columnName}`} style={[styles.context, { color: theme.textSecondary }]}>
                Adding to <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>{boardName}</Text>  ›  <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>{columnName}</Text>
              </Text> : <Text style={[styles.context, { color: theme.textSecondary }]}>Saved to <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Unorganized</Text> — add it to a board anytime.</Text>}

              <TextInput
                ref={inputRef}
                accessibilityLabel="Note text"
                value={text}
                onChangeText={(value) => { setText(value); setError(null); }}
                placeholder="Write something..."
                placeholderTextColor={theme.textMuted}
                selectionColor={theme.accent}
                cursorColor={theme.accent}
                multiline
                maxLength={MAX_NOTE_LENGTH}
                editable={!saving}
                style={[styles.input, draft && styles.inputWithAttachment, { backgroundColor: theme.background, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
              />

              {draft ? (
                <View style={styles.attachmentPreview}>
                  <AttachmentDraftPreview draft={draft} compact={false} onRemove={discardDraft} />
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
                      style={({ pressed }) => [styles.attachChip, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, busy && styles.disabled, pressed && styles.pressed]}
                    >
                      <Ionicons accessible={false} name={option.icon} size={17} color={theme.textSecondary} />
                      <Text style={[styles.attachLabel, { color: theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  ))}
                  {staging ? <ActivityIndicator accessibilityLabel="Preparing attachment" size="small" color={theme.textMuted} /> : null}
                </View>
              )}
              {error ? <Text accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</Text> : null}

              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add note"
                  accessibilityState={{ disabled: !canAdd }}
                  disabled={!canAdd}
                  onPress={() => void submit()}
                  style={({ pressed }) => [styles.addButton, { backgroundColor: theme.accent }, !canAdd && styles.disabled, pressed && canAdd && styles.pressed]}
                >
                  {saving ? <ActivityIndicator accessibilityLabel="Adding note" size="small" color={theme.accentText} /> : <Text style={[styles.addText, { color: theme.accentText }]}>Add</Text>}
                </Pressable>
              </View>
            </View>
          </GlassSurface>
        </SafeAreaView>
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
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
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
