import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { getInfoAsync } from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppDialogProvider, useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton } from '@/components/ui/primitives';
import { ChatBackgroundPreview } from '@/components/chat/chat-background-preview';
import { BackgroundStyleControls } from '@/components/chat/background-style-controls';
import { ChatBackgroundLayer } from '@/components/chat/background-layer';
import { useChatBackground } from '@/components/chat/chat-background-provider';
import { copyIntoAttachmentStorage, resolveAttachmentUri } from '@/services/attachment-storage';
import { deviceBackgroundMatches, type ChatBackgroundImage } from '@/services/chat-background';
import { dismissKeyboardAsync } from '@/services/keyboard';

function AppearanceOption({ label, icon, onPress, destructive = false, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean; disabled: boolean }) {
  const { tokens } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.option, { borderColor: tokens.borderSubtle }, pressed && { opacity: 0.7 }]}><Ionicons accessible={false} name={icon} size={21} color={destructive ? tokens.danger : tokens.textSecondary} /><Text style={[styles.optionText, { color: destructive ? tokens.danger : tokens.textPrimary }]}>{label}</Text><Ionicons accessible={false} name="chevron-forward" size={16} color={tokens.textMuted} /></Pressable>;
}

function AppearanceContent({ close }: { close: (after?: () => void) => void }) {
  const { tokens } = useTheme();
  const { confirm } = useAppDialog();
  const { background, applyBackground, removeBackground } = useChatBackground();
  const [selected, setSelected] = useState<ChatBackgroundImage | null>(null);
  const [dim, setDim] = useState(background?.dim ?? 0.35);
  const [blur, setBlur] = useState(background?.blur ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stagedAsset = useRef<{ remove: () => Promise<void> } | null>(null);
  useEffect(() => () => { if (stagedAsset.current) void stagedAsset.current.remove(); }, []);
  const changeStyle = async (nextDim: number, nextBlur: boolean) => {
    if (!background || busy) return;
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
      if (background && deviceBackgroundMatches(background, asset.assetId)) { setSelected(background); return; }
      // Android's system picker may omit assetId; compare the source bytes before copying.
      const info = await getInfoAsync(asset.uri, { md5: true }).catch(() => null);
      const imageHash = info?.exists ? info.md5 : undefined;
      if (background && deviceBackgroundMatches(background, asset.assetId, imageHash)) { setSelected(background); return; }
      const staged = await copyIntoAttachmentStorage(asset.uri, 'backgrounds', { type: 'photo', originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? null, duration: null, width: asset.width, height: asset.height });
      stagedAsset.current = staged;
      setSelected({ storagePath: staged.attachment.storagePath, source: 'device', attachmentId: null, ...(asset.assetId ? { deviceAssetId: asset.assetId } : {}), ...(imageHash ? { deviceImageHash: imageHash } : {}) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not open that photo.'); }
    finally { setBusy(false); }
  };
  const remove = () => confirm({ type: 'destructive', title: 'Remove custom chat background?', confirmText: 'Remove', onConfirm: async () => {
    try { await removeBackground(); }
    catch { setError('The background could not be removed. Try again.'); throw new Error('Background removal failed'); }
  } });
  if (selected) return <ChatBackgroundPreview key={selected.storagePath} image={selected} onCancel={() => { setSelected(null); const staged = stagedAsset.current; stagedAsset.current = null; if (staged) void staged.remove(); }} onApplied={() => { stagedAsset.current = null; close(() => router.navigate('/chat')); }} />;

  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <AppHeader title="Chat Appearance" leading={<IconButton label="Close chat appearance" disabled={busy} onPress={() => close()}><Ionicons accessible={false} name="close" size={24} color={tokens.textPrimary} /></IconButton>} />
    <ScrollView contentContainerStyle={styles.content}>
      {background ? <Pressable accessibilityRole="button" accessibilityLabel="Current Background" onPress={() => setSelected(background)} style={[styles.current, { backgroundColor: tokens.surface }]}><ChatBackgroundLayer background={{ ...background, dim, blur }} /><View style={[styles.currentLabel, { backgroundColor: tokens.surface }]}><Text style={{ color: tokens.textPrimary }}>Current Background</Text><Ionicons name="expand-outline" size={18} color={tokens.textPrimary} /></View></Pressable> : <View style={[styles.default, { backgroundColor: tokens.surface }]}><Ionicons name="image-outline" size={28} color={tokens.textMuted} /><Text style={[styles.defaultTitle, { color: tokens.textPrimary }]}>Default</Text><Text style={[styles.copy, { color: tokens.textSecondary }]}>Choose a photo to personalize your chat.</Text></View>}
      <AppearanceOption label="Choose from Attachments" icon="images-outline" disabled={busy} onPress={() => close(() => router.push({ pathname: '/attachments', params: { chooseBackground: '1' } }))} />
      <AppearanceOption label={busy ? 'Preparing photo…' : 'Choose from Device'} icon="image-outline" disabled={busy} onPress={() => void chooseDevice()} />
      {background ? <>
        <View style={styles.styleControls}><BackgroundStyleControls dim={dim} blur={blur} disabled={busy} onDimChange={setDim} onDimCommit={(value) => void changeStyle(value, blur)} onBlurChange={(value) => { setBlur(value); void changeStyle(dim, value); }} /></View>
        <AppearanceOption label="Remove Background" icon="trash-outline" disabled={busy} destructive onPress={remove} />
        <AppearanceOption label="Reset to Default" icon="refresh-outline" disabled={busy} onPress={remove} />
      </> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

export function ChatAppearanceSettings() {
  const { tokens } = useTheme();
  const { background } = useChatBackground();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const finishClose = () => { setMounted(false); const after = afterClose.current; afterClose.current = undefined; after?.(); };
  const close = (after?: () => void) => { afterClose.current = after; setOpen(false); if (Platform.OS !== 'ios') requestAnimationFrame(finishClose); };
  return <View>
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: tokens.textSecondary }]}>CHAT APPEARANCE</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Background, ${background ? 'Custom photo' : 'Default'}`} onPress={() => { void dismissKeyboardAsync().then(() => { setMounted(true); setOpen(true); }); }} style={[styles.backgroundRow, { borderColor: tokens.borderSubtle }]}>
      {background ? <Image source={resolveAttachmentUri(background.storagePath)} blurRadius={background.blur ? 5 : 0} contentFit="cover" style={styles.thumbnail} /> : <View style={[styles.thumbnail, styles.thumbnailDefault, { backgroundColor: tokens.surfaceElevated }]}><Ionicons name="image-outline" size={22} color={tokens.textMuted} /></View>}
      <View style={styles.rowCopy}><Text style={[styles.defaultTitle, { color: tokens.textPrimary }]}>Background</Text><Text style={[styles.copy, { color: tokens.textSecondary }]}>{background ? 'Custom photo' : 'Default'}</Text>{!background ? <Text style={[styles.copy, { color: tokens.textSecondary }]}>Choose a photo to personalize your chat.</Text> : null}</View>
      <Ionicons name="chevron-forward" size={17} color={tokens.textMuted} />
    </Pressable>
    <Modal visible={open} animationType="none" presentationStyle="fullScreen" onRequestClose={() => close()} onDismiss={finishClose}>
      <SafeAreaProvider><AppDialogProvider>{mounted ? <AppearanceContent close={close} /> : null}</AppDialogProvider></SafeAreaProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }, backgroundRow: { minHeight: 80, paddingVertical: 12, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, thumbnail: { width: 48, height: 58, borderRadius: 10 }, thumbnailDefault: { alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, gap: 3 }, content: { padding: 16, gap: 8 }, current: { height: 220, borderRadius: 20, overflow: 'hidden', marginBottom: 12 }, currentLabel: { position: 'absolute', bottom: 12, left: 12, right: 12, padding: 12, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between' }, default: { padding: 24, gap: 8, alignItems: 'center', borderRadius: 20, marginBottom: 12 }, defaultTitle: { fontSize: 16, fontWeight: '600' }, copy: { fontSize: 13, lineHeight: 19 }, option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, optionText: { flex: 1, fontSize: 15 }, styleControls: { paddingVertical: 12 } });
