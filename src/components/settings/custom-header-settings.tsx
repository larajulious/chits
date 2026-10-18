import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, AppText, HeaderIcon, Icon, IconButton, MenuIcon, PrimaryButton, Screen, SecondaryButton } from '@/components/ui/primitives';
import { HeaderPhotoPreviewContext } from '@/components/ui/header-photo-context';
import { copyIntoAttachmentStorage } from '@/services/attachment-storage';
import { clamp, headerPhotoFrame, type HeaderPhoto } from '@/services/header-photo';
import { spacing } from '@/constants/theme';

function HeaderPreview({ photo, onError }: { photo: HeaderPhoto; onError: () => void }) {
  const insets = useSafeAreaInsets();
  return <HeaderPhotoPreviewContext.Provider value={{ photo, onError }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ paddingTop: insets.top }}>
      <AppHeader title="Chits" subtitle="Your thoughts, beautifully kept" actionWidth={96}
        leading={<IconButton label="Open menu"><MenuIcon /></IconButton>}
        trailing={<View style={{ flexDirection: 'row' }}><IconButton label="Search notes"><HeaderIcon name="search-outline" size={23} /></IconButton><IconButton label="Add note"><HeaderIcon name="add" size={26} /></IconButton></View>} />
    </View>
  </HeaderPhotoPreviewContext.Provider>;
}

function HeaderEditor({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { tokens, scheme, topBar, customHeader, headerPhotoFailed, setCustomHeader } = useTheme();
  const statusStyle = customHeader && !headerPhotoFailed ? 'light' : topBar ? (topBar.dark ? 'light' : 'dark') : scheme === 'dark' ? 'light' : 'dark';
  const [photo, setPhoto] = useState<HeaderPhoto | null>(customHeader);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  const mounted = useRef(true);
  const staged = useRef<null | { remove: () => Promise<void> }>(null);
  const latest = useRef(photo);
  useEffect(() => { latest.current = photo; }, [photo]);
  const size = useRef({ width: 1, height: 1 });
  const gesture = useRef<{ photo: HeaderPhoto; x: number; y: number; distance: number; count: number } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (staged.current) void staged.current.remove(); }; }, []);
  // PanResponder stores these event callbacks; it does not read their refs during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { gesture.current = null; },
    onPanResponderMove: (event) => {
      const touches = event.nativeEvent.touches;
      const current = latest.current;
      if (!current || !touches[0]) return;
      const x = touches.reduce((sum, t) => sum + t.pageX, 0) / touches.length;
      const y = touches.reduce((sum, t) => sum + t.pageY, 0) / touches.length;
      const distance = touches.length > 1 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : 0;
      if (!gesture.current || gesture.current.count !== touches.length) { gesture.current = { photo: current, x, y, distance, count: touches.length }; return; }
      const start = gesture.current;
      const zoom = distance && start.distance ? clamp(start.photo.zoom * distance / start.distance, 1, 3) : start.photo.zoom;
      const frame = headerPhotoFrame({ ...start.photo, zoom }, size.current.width, size.current.height);
      setPhoto({ ...start.photo, zoom, x: clamp(start.photo.x - (x - start.x) / Math.max(1, frame.width - size.current.width), 0, 1), y: clamp(start.photo.y - (y - start.y) / Math.max(1, frame.height - size.current.height), 0, 1) });
    },
    onPanResponderRelease: () => { gesture.current = null; },
    onPanResponderTerminate: () => { gesture.current = null; },
  }));
  const choose = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const copy = await copyIntoAttachmentStorage(asset.uri, 'headers', { type: 'photo', originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? null, duration: null, width: asset.width, height: asset.height });
      if (!mounted.current) { await copy.remove(); return; }
      const previous = staged.current; staged.current = copy;
      if (previous) void previous.remove();
      setPhoto({ storagePath: copy.attachment.storagePath, width: copy.attachment.width!, height: copy.attachment.height!, x: 0.5, y: 0.5, zoom: 1, overlay: 0.6 });
      setFailed(false);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'That photo could not be opened. Please choose another.'); }
    finally { if (mounted.current) { setBusy(false); StatusBar.setStyle(statusStyle); } }
  }, [busy, statusStyle]);
  const pickedOnOpen = useRef(false);
  useEffect(() => { if (!customHeader && !pickedOnOpen.current) { pickedOnOpen.current = true; void choose(); } }, [choose, customHeader]);
  const apply = async () => {
    if (!photo || busy || failed) return;
    setBusy(true); setError(null);
    const copy = staged.current; staged.current = null;
    try { await setCustomHeader(photo); onClose(); }
    catch { if (mounted.current) { staged.current = copy; setError('The header could not be saved. Please try again.'); } else if (copy) void copy.remove(); }
    finally { if (mounted.current) setBusy(false); }
  };
  const adjust = (key: 'x' | 'y' | 'zoom' | 'overlay', amount: number) => setPhoto((p) => p ? { ...p, [key]: clamp(p[key] + amount, key === 'zoom' ? 1 : key === 'overlay' ? 0.6 : 0, key === 'zoom' ? 3 : key === 'overlay' ? 0.8 : 1) } : p);
  return <Screen edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style={statusStyle} />
    <AppHeader title="Custom Header" leading={<IconButton label="Cancel header changes" disabled={busy} onPress={onClose}><HeaderIcon name="close" size={24} /></IconButton>} />
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
      <View style={styles.copy}><AppText variant="title">Make Chits feel more like yours.</AppText><AppText style={{ color: tokens.textSecondary }}>Drag to position. Pinch to zoom. The preview uses your app’s header and current text size.</AppText></View>
      {photo ? <View testID="custom-header-crop" accessibilityLabel="Header crop preview. Use the positioning buttons below to adjust." {...responder.panHandlers} onLayout={({ nativeEvent: { layout } }) => { size.current = layout; }} style={{ overflow: 'hidden' }}><HeaderPreview photo={photo} onError={() => setFailed(true)} /></View> : <View style={[styles.placeholder, { backgroundColor: tokens.surface }]}><Icon color={tokens.textMuted} name="image-outline" size={32} /><AppText>Choose a favorite photo</AppText></View>}
      <View style={styles.copy}>
        <SecondaryButton label={photo ? 'Replace Photo' : 'Choose Photo'} disabled={busy} onPress={() => void choose()} />
        {photo ? <>
          <View style={styles.row}><IconButton label="Move photo left" disabled={busy} onPress={() => adjust('x', 0.1)}><Icon color={tokens.textPrimary} name="arrow-back" size={22} /></IconButton><IconButton label="Move photo up" disabled={busy} onPress={() => adjust('y', 0.1)}><Icon color={tokens.textPrimary} name="arrow-up" size={22} /></IconButton><IconButton label="Move photo down" disabled={busy} onPress={() => adjust('y', -0.1)}><Icon color={tokens.textPrimary} name="arrow-down" size={22} /></IconButton><IconButton label="Move photo right" disabled={busy} onPress={() => adjust('x', -0.1)}><Icon color={tokens.textPrimary} name="arrow-forward" size={22} /></IconButton></View>
          <View style={styles.row}><SecondaryButton label="Zoom out" disabled={busy || photo.zoom <= 1} onPress={() => adjust('zoom', -0.25)} /><AppText>{Math.round(photo.zoom * 100)}%</AppText><SecondaryButton label="Zoom in" disabled={busy || photo.zoom >= 3} onPress={() => adjust('zoom', 0.25)} /></View>
          <AppText style={{ color: tokens.textSecondary }}>Photo shading</AppText>
          <View style={styles.row}><SecondaryButton label="Lighter" disabled={busy || photo.overlay <= 0.6} onPress={() => adjust('overlay', -0.05)} /><SecondaryButton label="Darker" disabled={busy || photo.overlay >= 0.8} onPress={() => adjust('overlay', 0.05)} /></View>
          <AppText style={{ color: tokens.textMuted }}>Your photo fills the header on each screen. Framing adapts to screen size and longer titles.</AppText>
        </> : null}
        {error || failed ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error ?? 'This photo could not be loaded. Please choose another.'}</AppText> : null}
        <PrimaryButton label={busy ? 'Please wait…' : 'Apply Header'} disabled={busy || !photo || failed} onPress={() => void apply()} />
        <SecondaryButton label="Cancel" disabled={busy} onPress={onClose} />
      </View>
    </ScrollView>
  </Screen>;
}

export function CustomHeaderSettings() {
  const { tokens, styleTokens, customHeader, headerPhotoFailed, setCustomHeader, failHeaderPhoto } = useTheme();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try { await setCustomHeader(null); } catch { setError('The photo could not be removed. Please try again.'); }
    finally { setBusy(false); }
  };
  if (Platform.OS === 'web') return null;
  return <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle, borderRadius: styleTokens.radius.panel }]}>
    {customHeader && !headerPhotoFailed ? <View style={{ overflow: 'hidden' }}><HeaderPreview photo={customHeader} onError={failHeaderPhoto} /></View> : null}
    <View style={styles.copy}>
      <View style={styles.row}><AppText variant="title">Custom Header</AppText>{customHeader && !headerPhotoFailed ? <AppText style={{ color: tokens.textPrimary }}>✓ Selected</AppText> : null}</View>
      <AppText style={{ color: tokens.textSecondary }}>Make Chits feel more like yours.</AppText>
      {!customHeader || headerPhotoFailed ? <View style={[styles.placeholder, { backgroundColor: tokens.surfaceElevated }]}><Icon color={tokens.textMuted} name="image-outline" size={30} /><AppText style={{ color: tokens.textMuted }}>{headerPhotoFailed ? 'Photo unavailable. Your built-in header is in use.' : 'A favorite place, a quiet moment, your photo.'}</AppText></View> : null}
      <SecondaryButton label={customHeader ? 'Edit or Replace Photo' : 'Choose Photo'} disabled={busy} onPress={() => setEditing(true)} />
      {customHeader ? <SecondaryButton label="Remove Photo · Use Built-in Header" disabled={busy} onPress={() => void remove()} /> : null}
      {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
    </View>
    <Modal visible={editing} animationType="none" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) setEditing(false); }}>
      <SafeAreaProvider>{editing ? <HeaderEditor onClose={() => { setBusy(false); setEditing(false); }} onBusyChange={setBusy} /> : null}</SafeAreaProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, overflow: 'hidden', marginTop: spacing.lg },
  copy: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  placeholder: { padding: spacing.lg, minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 12 },
});
