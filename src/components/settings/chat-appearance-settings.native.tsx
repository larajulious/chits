import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { getInfoAsync } from 'expo-file-system/legacy';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppDialogProvider, useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton, PrimaryButton, SecondaryButton } from '@/components/ui/primitives';
import { QuickThoughtBubble } from '@/components/chat/message-note-cards';
import { BackgroundStyleControls } from '@/components/chat/background-style-controls';
import { ChatBackgroundLayer } from '@/components/chat/background-layer';
import { useChatBackground } from '@/components/chat/chat-background-context';
import { copyIntoAttachmentStorage, resolveAttachmentUri } from '@/services/attachment-storage';
import { DEFAULT_BACKGROUND_DIM, deviceBackgroundMatches, parseChatBackground, type ChatBackground, type ChatBackgroundImage } from '@/services/chat-background';
import { dismissKeyboardAsync } from '@/services/keyboard';
import type { Message } from '@/db/types';

const sampleMessage: Message = { id: 'appearance-preview', text: 'Your chat will look like this', createdAt: 0, updatedAt: 0, type: 'text', archivedAt: null, pinned: false, isHiddenContent: false, deletedAt: null, attachments: [] };
const noAction = () => undefined;

function ChatAppearancePreview({ background, onError }: { background: ChatBackground | null; onError: () => void }) {
  const { tokens } = useTheme();
  return <View testID="chat-appearance-preview" style={[styles.preview, { backgroundColor: tokens.background, borderColor: tokens.borderSubtle }]}>
    <ChatBackgroundLayer background={background} onError={onError} />
    {!background ? <View style={styles.default}>
      <Ionicons accessible={false} name="image-outline" size={28} color={tokens.textMuted} />
      <Text style={[styles.defaultTitle, { color: tokens.textPrimary }]}>Default</Text>
      <Text style={[styles.copy, { color: tokens.textSecondary }]}>Choose a photo to personalize your chat.</Text>
    </View> : null}
    <View pointerEvents="none" accessible accessibilityRole="text" accessibilityLabel="Your chat will look like this" style={styles.sample}>
      <View collapsable={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><QuickThoughtBubble message={sampleMessage} focused={false} onActions={noAction} preview /></View>
    </View>
  </View>;
}

function AppearanceOption({ label, icon, onPress, destructive = false, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean; disabled: boolean }) {
  const { tokens } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.option, { borderColor: tokens.borderSubtle }, pressed && { opacity: 0.7 }]}><Ionicons accessible={false} name={icon} size={21} color={destructive ? tokens.danger : tokens.textSecondary} /><Text style={[styles.optionText, { color: destructive ? tokens.danger : tokens.textPrimary }]}>{label}</Text><Ionicons accessible={false} name="chevron-forward" size={16} color={tokens.textMuted} /></Pressable>;
}

function AppearanceContent({ close, initialSelection }: { close: (after?: () => void) => void; initialSelection: ChatBackgroundImage | null }) {
  const { tokens } = useTheme();
  const { confirm } = useAppDialog();
  const { background, applyBackground, removeBackground } = useChatBackground();
  const [selected, setSelected] = useState<ChatBackgroundImage | null>(initialSelection);
  const currentSelection = !initialSelection || initialSelection.storagePath === background?.storagePath;
  const [dim, setDim] = useState(currentSelection ? background?.dim ?? DEFAULT_BACKGROUND_DIM : DEFAULT_BACKGROUND_DIM);
  const [blur, setBlur] = useState(currentSelection ? background?.blur ?? false : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const mounted = useRef(true);
  const stagedAsset = useRef<{ remove: () => Promise<void> } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (stagedAsset.current) void stagedAsset.current.remove(); }; }, []);
  const discardSelection = () => {
    const staged = stagedAsset.current;
    stagedAsset.current = null;
    setSelected(null);
    setDim(background?.dim ?? DEFAULT_BACKGROUND_DIM);
    setBlur(background?.blur ?? false);
    setError(null);
    setImageFailed(false);
    if (staged) void staged.remove();
  };
  const selectImage = (image: ChatBackgroundImage, staged: { remove: () => Promise<void> } | null = null) => {
    const previous = stagedAsset.current;
    stagedAsset.current = staged;
    setSelected(image);
    setImageFailed(false);
    const current = background?.storagePath === image.storagePath;
    setDim(current ? background.dim : DEFAULT_BACKGROUND_DIM);
    setBlur(current ? background.blur : false);
    if (previous) void previous.remove();
  };
  const changeStyle = async (nextDim: number, nextBlur: boolean) => {
    if (selected || !background || busy) return;
    setBusy(true); setError(null);
    try { await applyBackground({ ...background, dim: nextDim, blur: nextBlur }); }
    catch { setDim(background.dim); setBlur(background.blur); setError('That background style could not be saved. Try again.'); }
    finally { setBusy(false); }
  };
  const chooseDevice = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (background && deviceBackgroundMatches(background, asset.assetId)) { selectImage(background); return; }
      // Android's system picker may omit assetId; compare the source bytes before copying.
      const info = await getInfoAsync(asset.uri, { md5: true }).catch(() => null);
      const imageHash = info?.exists ? info.md5 : undefined;
      if (background && deviceBackgroundMatches(background, asset.assetId, imageHash)) { selectImage(background); return; }
      const staged = await copyIntoAttachmentStorage(asset.uri, 'backgrounds', { type: 'photo', originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? null, duration: null, width: asset.width, height: asset.height });
      if (!mounted.current) { await staged.remove(); return; }
      selectImage({ storagePath: staged.attachment.storagePath, source: 'device', attachmentId: null, ...(asset.assetId ? { deviceAssetId: asset.assetId } : {}), ...(imageHash ? { deviceImageHash: imageHash } : {}) }, staged);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not open that photo.'); }
    finally { setBusy(false); }
  };
  const applySelection = async () => {
    if (!selected || busy || imageFailed) return;
    setBusy(true); setError(null);
    // A system Back during saving must not delete the photo being persisted.
    const staged = stagedAsset.current;
    stagedAsset.current = null;
    // Saved: back to Settings, whose Background row now shows the new photo.
    try { await applyBackground({ ...selected, dim, blur }); setSelected(null); close(); }
    catch (cause) {
      if (staged) { if (mounted.current) stagedAsset.current = staged; else void staged.remove(); }
      setError(cause instanceof Error ? cause.message : 'This background could not be saved.');
    }
    finally { setBusy(false); }
  };
  const remove = () => confirm({ type: 'destructive', title: 'Remove custom chat background?', confirmText: 'Remove', onConfirm: async () => {
    try { await removeBackground(); discardSelection(); setDim(DEFAULT_BACKGROUND_DIM); setBlur(false); }
    catch { setError('The background could not be removed. Try again.'); throw new Error('Background removal failed'); }
  } });
  const previewImage = selected ?? background;
  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <AppHeader title="Chat Appearance" leading={<IconButton label="Close chat appearance" disabled={busy} onPress={() => close()}><Ionicons accessible={false} name="close" size={24} color={tokens.textPrimary} /></IconButton>} />
    <ScrollView contentContainerStyle={styles.content}>
      <ChatAppearancePreview background={previewImage ? { ...previewImage, dim, blur } : null} onError={() => setImageFailed(true)} />
      <AppearanceOption label="Choose from Attachments" icon="images-outline" disabled={busy} onPress={() => close(() => router.push({ pathname: '/attachments', params: { chooseBackground: '1' } }))} />
      <AppearanceOption label={busy ? 'Preparing photo…' : 'Choose from Device'} icon="image-outline" disabled={busy} onPress={() => void chooseDevice()} />
      {previewImage ? <>
        <View style={styles.styleControls}><BackgroundStyleControls dim={dim} blur={blur} disabled={busy} onDimChange={setDim} onDimCommit={(value) => void changeStyle(value, blur)} onBlurChange={(value) => { setBlur(value); void changeStyle(dim, value); }} /></View>
        {selected ? <View style={styles.selectionActions}>
          <PrimaryButton label="Use as Background" disabled={busy || imageFailed} onPress={() => void applySelection()} />
          <SecondaryButton label="Cancel" disabled={busy} onPress={discardSelection} />
        </View> : null}
      </> : null}
      {background ? <>
        <AppearanceOption label="Remove Background" icon="trash-outline" disabled={busy} destructive onPress={remove} />
        <AppearanceOption label="Reset to Default" icon="refresh-outline" disabled={busy} onPress={remove} />
      </> : null}
      {error || imageFailed ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error ?? 'This photo could not be loaded. Choose another photo.'}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

export function ChatAppearanceSettings() {
  const { tokens } = useTheme();
  const { background } = useChatBackground();
  const { chatAppearanceSelection } = useLocalSearchParams<{ chatAppearanceSelection?: string }>();
  const [initialSelection, setInitialSelection] = useState<ChatBackgroundImage | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const finishClose = () => { setMounted(false); const after = afterClose.current; afterClose.current = undefined; after?.(); };
  const close = (after?: () => void) => { afterClose.current = after; setOpen(false); if (Platform.OS !== 'ios') requestAnimationFrame(finishClose); };
  useFocusEffect(useCallback(() => {
    if (!chatAppearanceSelection) return;
    const image = chatAppearanceSelection === 'current' ? null : parseChatBackground(chatAppearanceSelection);
    // Consume the picker result once; revisiting Settings must not reopen it.
    router.setParams({ chatAppearanceSelection: undefined });
    if (chatAppearanceSelection !== 'current' && image?.source !== 'attachment') return;
    setInitialSelection(image);
    setMounted(true);
    setOpen(true);
  }, [chatAppearanceSelection]));
  return <View>
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: tokens.textSecondary }]}>CHAT APPEARANCE</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Background, ${background ? 'Custom photo' : 'Default'}`} onPress={() => { void dismissKeyboardAsync().then(() => { setInitialSelection(null); setMounted(true); setOpen(true); }); }} style={[styles.backgroundRow, { borderColor: tokens.borderSubtle }]}>
      {background ? <Image source={resolveAttachmentUri(background.storagePath)} blurRadius={background.blur ? 5 : 0} contentFit="cover" style={styles.thumbnail} /> : <View style={[styles.thumbnail, styles.thumbnailDefault, { backgroundColor: tokens.surfaceElevated }]}><Ionicons name="image-outline" size={22} color={tokens.textMuted} /></View>}
      <View style={styles.rowCopy}><Text style={[styles.defaultTitle, { color: tokens.textPrimary }]}>Background</Text><Text style={[styles.copy, { color: tokens.textSecondary }]}>{background ? 'Custom photo' : 'Default'}</Text>{!background ? <Text style={[styles.copy, { color: tokens.textSecondary }]}>Choose a photo to personalize your chat.</Text> : null}</View>
      <Ionicons name="chevron-forward" size={17} color={tokens.textMuted} />
    </Pressable>
    <Modal visible={open} animationType="none" presentationStyle="fullScreen" onRequestClose={() => close()} onDismiss={finishClose}>
      <SafeAreaProvider><AppDialogProvider>{mounted ? <AppearanceContent key={initialSelection?.storagePath ?? 'current'} close={close} initialSelection={initialSelection} /> : null}</AppDialogProvider></SafeAreaProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }, backgroundRow: { minHeight: 80, paddingVertical: 12, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, thumbnail: { width: 48, height: 58, borderRadius: 10 }, thumbnailDefault: { alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, gap: 3 }, content: { padding: 16, gap: 8 }, preview: { height: 220, borderRadius: 20, overflow: 'hidden', marginBottom: 12, borderWidth: StyleSheet.hairlineWidth }, sample: { position: 'absolute', bottom: 16, left: 16, right: 16 }, default: { padding: 24, gap: 8, alignItems: 'center' }, defaultTitle: { fontSize: 16, fontWeight: '600' }, copy: { fontSize: 13, lineHeight: 19 }, option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, optionText: { flex: 1, fontSize: 15 }, styleControls: { paddingVertical: 12 }, selectionActions: { gap: 8, paddingBottom: 12 } });
