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

import { useTheme } from '@/components/theme-provider';
import { GlassSurface } from '@/components/ui/glass-surface';
import { spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  boardName: string;
  columnName: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
};

const MAX_NOTE_LENGTH = 10000;

// The lightweight composer for "+ Add note" — contextual capture straight into a
// known board/column, as opposed to Chat's own composer (deeply tied to its
// scroll/keyboard/attachment machinery). Deliberately text-only: it reuses the same
// message/card creation the rest of the app relies on (via onSubmit), it just
// doesn't expose Chat's attachment picker here — a note that needs a photo/video
// still starts in Chat, same as before.
export function AddNoteSheet({ visible, boardName, columnName, onClose, onSubmit }: Props) {
  const { tokens: theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setText('');
      setSaving(false);
      setError(null);
    }
    wasVisible.current = visible;
  }, [visible]);

  const trimmed = text.trim();
  const canAdd = Boolean(trimmed) && !saving;

  const close = () => { if (!saving) onClose(); };

  const submit = async () => {
    if (!canAdd) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
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
              <Text accessibilityLabel={`Adding to ${boardName}, ${columnName}`} style={[styles.context, { color: theme.textSecondary }]}>
                Adding to <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>{boardName}</Text>  ›  <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>{columnName}</Text>
              </Text>

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
                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.borderSubtle, color: theme.textPrimary }]}
              />
              {error ? <Text accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</Text> : null}

              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={saving} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
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
