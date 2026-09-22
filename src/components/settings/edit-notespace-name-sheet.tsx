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
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
};

const MAX_NOTESPACE_NAME_LENGTH = 40;

// NoteSpace naming lives in Settings, not Chat's header — this is the only place
// app_settings.chat_title is ever written, mirroring the board-editing sheet's
// name-field shape so the two "rename this identity" flows in the app feel
// consistent even though a NoteSpace and a Board are different concepts.
export function EditNoteSpaceNameSheet({ visible, currentName, onClose, onSave }: Props) {
  const { tokens: theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const wasVisible = useRef(false);
  const [name, setName] = useState(currentName);
  const [originalName, setOriginalName] = useState(currentName);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setOriginalName(currentName);
      setName(currentName);
      setTouched(false);
      setSaving(false);
      setError(null);
    }
    wasVisible.current = visible;
  }, [currentName, visible]);

  const trimmedName = name.trim();
  const validation = touched && !trimmedName ? 'NoteSpace name can’t be empty.' : null;
  const canSave = Boolean(trimmedName && trimmedName !== originalName && !saving);

  const close = () => {
    if (!saving) onClose();
  };

  const save = async () => {
    setTouched(true);
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmedName);
      onClose();
    } catch {
      setError('Couldn’t update your NoteSpace name. Try again.');
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
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing NoteSpace name" style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.surface }]}>
          <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
            <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.content}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Edit NoteSpace name</Text>
              <Text style={[styles.supportingCopy, { color: theme.textSecondary }]}>Choose a name for your NoteSpace.</Text>

              <Text nativeID="notespace-name-label" style={[styles.label, { color: theme.textSecondary }]}>NoteSpace name</Text>
              <TextInput
                ref={inputRef}
                autoFocus
                accessibilityLabel="NoteSpace name"
                accessibilityLabelledBy="notespace-name-label"
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setTouched(true);
                  setError(null);
                }}
                onSubmitEditing={() => void save()}
                editable={!saving}
                maxLength={MAX_NOTESPACE_NAME_LENGTH}
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
              {error ? <Text accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</Text> : null}

              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={saving} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save NoteSpace name"
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
                  {saving ? <ActivityIndicator accessibilityLabel="Saving NoteSpace name" size="small" color={theme.accentText} /> : <Text style={[styles.saveText, { color: theme.accentText }]}>Save</Text>}
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
  supportingCopy: { marginTop: spacing.xxs, fontSize: 14, lineHeight: 20 },
  label: { marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: 13, fontWeight: '600' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 16 },
  message: { marginTop: spacing.xs, fontSize: 12, lineHeight: 17 },
  actions: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '700' },
  saveButton: { minWidth: 88, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12 },
  saveText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
