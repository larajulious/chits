import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';

type BoardAppearance = { name: string; icon: BoardIconName | null; accent: string | null };

type Props = {
  visible: boolean;
  board: BoardAppearance;
  onClose: () => void;
  onSave: (next: BoardAppearance) => Promise<void>;
};

const MAX_BOARD_NAME_LENGTH = 80;

// Same fields as Create Board (name, icon, accent), saved together — see PHASE:
// EDIT BOARD APPEARANCE. Reuses BoardAppearanceFields verbatim so the picker is
// never a second, drifted design.
export function EditBoardSheet({ visible, board, onClose, onSave }: Props) {
  const { tokens: theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(false);
  const [name, setName] = useState(board.name);
  const [icon, setIcon] = useState<BoardIconName | null>(board.icon);
  const [accent, setAccent] = useState<string | null>(board.accent);
  const [original, setOriginal] = useState(board);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setOriginal(board);
      setName(board.name);
      setIcon(board.icon);
      setAccent(board.accent);
      setTouched(false);
      setSaving(false);
      setError(null);
    }
    wasVisible.current = visible;
  }, [board, visible]);

  const trimmedName = name.trim();
  const validation = touched && !trimmedName ? 'Board name can’t be empty.' : null;
  const hasChanges = trimmedName !== original.name || icon !== original.icon || accent !== original.accent;
  const canSave = Boolean(trimmedName && hasChanges && !saving);

  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    setTouched(true);
    if (!trimmedName || !hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmedName, icon, accent });
      onClose();
    } catch {
      setError('Couldn’t save these changes. Try again.');
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
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing board" style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.surface }]}>
          <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
            <ScrollView
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
              <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Edit board</Text>
              <Text style={[styles.supportingCopy, { color: theme.textSecondary }]}>Update this board’s name and appearance.</Text>

              <View accessible accessibilityLabel={`Preview: ${trimmedName || 'Untitled board'}`} style={[styles.preview, { backgroundColor: theme.background, borderColor: theme.borderSubtle }]}>
                <View style={[styles.previewMark, { backgroundColor: accent ?? theme.accentSoft }]}>
                  <Ionicons accessible={false} name={resolveBoardIcon(icon)} size={19} color={accent ? '#FFFFFF' : theme.accentStrong} />
                </View>
                <Text numberOfLines={1} style={[styles.previewName, { color: theme.textPrimary }]}>{trimmedName || 'Untitled board'}</Text>
              </View>

              <Text nativeID="board-name-label" style={[styles.label, { color: theme.textSecondary }]}>Board name</Text>
              <TextInput
                ref={inputRef}
                autoFocus
                accessibilityLabel="Board name"
                accessibilityLabelledBy="board-name-label"
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setTouched(true);
                  setError(null);
                }}
                onSubmitEditing={() => void save()}
                editable={!saving}
                maxLength={MAX_BOARD_NAME_LENGTH}
                returnKeyType="done"
                selectionColor={theme.accent}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    borderColor: validation ? theme.danger : theme.borderSubtle,
                    color: theme.textPrimary,
                  },
                ]}
              />
              {validation ? <Text accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{validation}</Text> : null}

              <BoardAppearanceFields icon={icon} accent={accent} onIconChange={setIcon} onAccentChange={setAccent} />

              {error ? <Text accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</Text> : null}

              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={saving} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save changes"
                  accessibilityState={{ disabled: !canSave }}
                  disabled={!canSave}
                  onPress={() => void save()}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: theme.accent },
                    !canSave && styles.disabled,
                    pressed && canSave && styles.pressed,
                  ]}
                >
                  {saving ? <ActivityIndicator accessibilityLabel="Saving changes" size="small" color={theme.accentText} /> : <Text style={[styles.saveText, { color: theme.accentText }]}>Save changes</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </GlassSurface>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  safeArea: { width: '100%', flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  handle: { alignSelf: 'center', width: 36, height: 4, marginBottom: spacing.xs, borderRadius: 2 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
  supportingCopy: { marginTop: spacing.xxs, fontSize: 14, lineHeight: 20 },
  preview: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  previewMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewName: { flex: 1, fontSize: 17, fontWeight: '700' },
  label: { marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: 13, fontWeight: '600' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 16 },
  message: { marginTop: spacing.xs, fontSize: 12, lineHeight: 17 },
  actions: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '700' },
  saveButton: { minWidth: 140, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12 },
  saveText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
