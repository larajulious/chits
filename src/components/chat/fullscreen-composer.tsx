import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { AppHeader, Button, IconButton } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';

export function FullscreenComposer({ value, onChangeText, onClose, onSaveDraft, onSend, canSave, saving, error, savedText, attachmentLabel }: {
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  onSaveDraft: () => Promise<void>;
  onSend: () => void;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  savedText: string | null;
  attachmentLabel: string | null;
}) {
  const { tokens } = useTheme();
  const font = useFontStyle('body');
  const input = useRef<TextInput>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!saving) onClose(); }} onShow={() => input.current?.focus()}>
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: tokens.background }]}>
        <AppHeader title="Edit thought" leading={<IconButton label="Return to chat with draft" disabled={saving} onPress={onClose}><Icon name="contract-outline" size={22} color={tokens.textPrimary} /></IconButton>} />
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {attachmentLabel ? <AppText style={[styles.attachment, { color: tokens.textSecondary }]}>{attachmentLabel}</AppText> : null}
          <TextInput ref={input} accessibilityLabel={attachmentLabel ? 'Attachment description' : 'Message note'} value={value} onChangeText={onChangeText} editable={!saving} placeholder={attachmentLabel ? 'Add a description...' : 'Message note...'} placeholderTextColor={tokens.textMuted} selectionColor={tokens.accent} cursorColor={tokens.accent} multiline maxLength={10000} textAlignVertical="top" style={[styles.input, font, { color: tokens.textPrimary }]} />
          <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
            <AppText accessibilityLiveRegion="polite" style={[styles.status, { color: error ? tokens.danger : tokens.textSecondary }]}>{error ?? (saving ? 'Saving...' : savedText === value.trim() ? 'Saved in chat' : savedText !== null ? 'Unsaved changes' : 'Save to chat and keep writing.')}</AppText>
            <View style={styles.actions}>
              <Button label="Save as draft" onPress={() => { void onSaveDraft().then(() => requestAnimationFrame(() => input.current?.focus())); }} disabled={!canSave || saving} style={styles.action} />
              <Button label="Send" onPress={onSend} disabled={!canSave || saving} style={styles.action} />
              {saving ? <ActivityIndicator color={tokens.accent} /> : null}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  input: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md, fontSize: 17, lineHeight: 26 },
  attachment: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, fontSize: 13 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  status: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { flex: 1 },
});
