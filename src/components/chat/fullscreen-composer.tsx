import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { type RefObject } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { AppHeader, Button, HeaderIcon, IconButton } from '@/components/ui/primitives';
import { KeyboardPane } from '@/components/ui/keyboard-pane';
import { useDesk } from '@/components/desk/paper-desk';
import { spacing } from '@/constants/theme';
import { NoteBlocksEditor, noteEditorStyles, NoteToolbar, type NoteBlocksEditorControl, type NoteImagePaste } from '@/components/notes/note-blocks-editor';
import { draftContentForStorage, draftHasUnsavedImages, draftPlainText, type NoteDraftBlock } from '@/services/note-content';

// The same draft as Chat's composer (words and pasted images, in order), with
// room to write: one continuous fullscreen page, Chat's save and send under
// it, and the same toolbar at the very bottom, on the keyboard.
export function FullscreenComposer({ blocks, onChangeBlocks, editorRef, onClose, onSaveDraft, onSend, canSave, saving, error, savedText, savedContent, attachmentLabel, images, onReplaceImage }: {
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
  images?: NoteImagePaste;
  onReplaceImage?: (key: string) => void;
}) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!saving && !editorRef.current?.dismissActivePanel()) onClose(); }} onShow={() => editorRef.current?.focus()}>
    {/* The safe-area insets are this modal's own, so they're read inside it. */}
    <SafeAreaProvider>
      <ComposerPage {...{ blocks, onChangeBlocks, editorRef, onClose, onSaveDraft, onSend, canSave, saving, error, savedText, savedContent, attachmentLabel, images, onReplaceImage }} />
    </SafeAreaProvider>
  </Modal>;
}

function ComposerPage({ blocks, onChangeBlocks, editorRef, onClose, onSaveDraft, onSend, canSave, saving, error, savedText, savedContent, attachmentLabel, images, onReplaceImage }: Parameters<typeof FullscreenComposer>[0]) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const desk = useDesk();
  const font = useFontStyle('paragraph');
  const value = draftPlainText(blocks);
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: tokens.cardPaper }]}>
    <AppHeader title={tr("fullscreencomposer.editThought")} leading={<IconButton label={tr("fullscreencomposer.returnToChatWithDraft")} disabled={saving} onPress={onClose}><HeaderIcon name="contract-outline" size={22} /></IconButton>} />
    <View style={[noteEditorStyles.fullscreenPage, { backgroundColor: tokens.cardPaper }]}>
      <KeyboardPane>
        {attachmentLabel ? <AppText style={[styles.attachment, { color: desk.inkMuted }]}>{attachmentLabel}</AppText> : null}
        <View style={noteEditorStyles.fullscreenPage}>
          <NoteBlocksEditor
            ref={editorRef}
            fillViewport
            accessibilityLabel={attachmentLabel ? tr("chat.attachmentDescription") : tr("chat.messageNote")}
            blocks={blocks}
            onChangeBlocks={onChangeBlocks}
            onReplaceImage={onReplaceImage}
            editable={!saving}
            placeholder={attachmentLabel ? tr('chat.attachmentDescription') : tr('chatbackgroundpreview.messageNote')}
            maxLength={10000}
            maxImageHeight={320}
            singleInputStyle={[noteEditorStyles.input, font, { color: tokens.textPrimary }]}
            blockContainerStyle={noteEditorStyles.blocks}
            blockInputStyle={[noteEditorStyles.blockInput, font, { color: tokens.textPrimary }]}
          />
        </View>
        <View style={styles.footer}>
          <AppText accessibilityLiveRegion="polite" style={[styles.status, { color: error ? desk.danger : desk.inkMuted }]}>{error ?? (saving ? tr("fullscreencomposer.saving") : savedText === value.trim() && savedContent === draftContentForStorage(blocks) && !draftHasUnsavedImages(blocks) ? tr("fullscreencomposer.savedInChat") : savedText !== null ? tr("fullscreencomposer.unsavedChanges") : tr("fullscreencomposer.saveToChatAndKeepWriting"))}</AppText>
          <View style={styles.actions}>
            <Button label={tr("fullscreencomposer.saveAsDraft")} onPress={() => { void onSaveDraft().then(() => requestAnimationFrame(() => editorRef.current?.focus())); }} disabled={!canSave || saving} style={styles.action} />
            <Button label={tr("fullscreencomposer.send")} onPress={onSend} disabled={!canSave || saving} style={styles.action} />
            {saving ? <ActivityIndicator color={tokens.accent} /> : null}
          </View>
        </View>
        <NoteToolbar editor={editorRef} images={images} disabled={saving} safeBottom />
      </KeyboardPane>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  attachment: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, fontSize: 13 },
  footer: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  status: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { flex: 1 },
});
