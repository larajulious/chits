import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { AppHeader, Button, IconButton } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { NoteBlocksEditor, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { draftContentForStorage, draftHasUnsavedImages, draftPlainText, type NoteDraftBlock } from '@/services/note-content';

// The same draft as Chat's composer (words and pasted images, in order), with room to write.
export function FullscreenComposer({ blocks, onChangeBlocks, editorRef, onClose, onSaveDraft, onSend, canSave, saving, error, savedText, savedContent, attachmentLabel, pasteButton, insertImageButton, listButtons, onReplaceImage }: {
  blocks: NoteDraftBlock[];
  onChangeBlocks: (update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => void;
  editorRef: RefObject<NoteBlocksEditorControl | null>;
  onClose: () => void;
  onSaveDraft: () => Promise<void>;
  onSend: () => void;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  savedText: string | null;
  savedContent: string | null;
  attachmentLabel: string | null;
  // "Paste image", while the clipboard holds one (sits above the footer).
  pasteButton?: ReactNode;
  insertImageButton?: ReactNode;
  listButtons?: ReactNode;
  onReplaceImage?: (key: string) => void;
}) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const font = useFontStyle('body');
  const value = draftPlainText(blocks);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!saving) onClose(); }} onShow={() => editorRef.current?.focus()}>
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: tokens.background }]}>
        <AppHeader title={tr("fullscreencomposer.editThought")} leading={<IconButton label={tr("fullscreencomposer.returnToChatWithDraft")} disabled={saving} onPress={onClose}><Icon name="contract-outline" size={22} color={tokens.textPrimary} /></IconButton>} />
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {attachmentLabel ? <AppText style={[styles.attachment, { color: tokens.textSecondary }]}>{attachmentLabel}</AppText> : null}
          <NoteBlocksEditor
            ref={editorRef}
            accessibilityLabel={attachmentLabel ? tr("chat.attachmentDescription") : tr("chat.messageNote")}
            blocks={blocks}
            onChangeBlocks={onChangeBlocks}
            onReplaceImage={onReplaceImage}
            editable={!saving}
            placeholder={attachmentLabel ? tr('chat.attachmentDescription') : tr('chatbackgroundpreview.messageNote')}
            maxLength={10000}
            maxImageHeight={320}
            singleInputStyle={[styles.input, font, { color: tokens.textPrimary }]}
            blockContainerStyle={styles.blocks}
            blockInputStyle={[styles.blockInput, font, { color: tokens.textPrimary }]}
          />
          <View style={styles.paste}>{insertImageButton}{listButtons}{pasteButton}</View>
          <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={[styles.footer, { borderTopColor: tokens.borderSubtle }]}>
            <AppText accessibilityLiveRegion="polite" style={[styles.status, { color: error ? tokens.danger : tokens.textSecondary }]}>{error ?? (saving ? tr("fullscreencomposer.saving") : savedText === value.trim() && savedContent === draftContentForStorage(blocks) && !draftHasUnsavedImages(blocks) ? tr("fullscreencomposer.savedInChat") : savedText !== null ? tr("fullscreencomposer.unsavedChanges") : tr("fullscreencomposer.saveToChatAndKeepWriting"))}</AppText>
            <View style={styles.actions}>
              <Button label={tr("fullscreencomposer.saveAsDraft")} onPress={() => { void onSaveDraft().then(() => requestAnimationFrame(() => editorRef.current?.focus())); }} disabled={!canSave || saving} style={styles.action} />
              <Button label={tr("fullscreencomposer.send")} onPress={onSend} disabled={!canSave || saving} style={styles.action} />
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
  paste: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  blocks: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  blockInput: { minHeight: 26, padding: 0, fontSize: 17, lineHeight: 26, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { flex: 1 },
});
