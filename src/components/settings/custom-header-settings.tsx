import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, PanResponder, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, AppText, HeaderIcon, Icon, IconButton, MenuIcon, PrimaryButton, Screen, SecondaryButton } from '@/components/ui/primitives';
import { HeaderPhotoPreviewContext } from '@/components/ui/header-photo-context';
import { copyIntoAttachmentStorage } from '@/services/attachment-storage';
import { clamp, headerPhotoFrame, type HeaderPhoto } from '@/services/header-photo';
import { spacing } from '@/constants/theme';

// Never include assets, URIs, filenames, or native error messages (which can
// contain private paths) in diagnostics.
function photoDiagnostic(event: string, cause?: unknown) {
  if (!__DEV__) return;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  console.debug('[Custom header photo]', event, /^[A-Z_]{1,80}$/.test(code) ? { code } : undefined);
}

function HeaderPreview({ photo, onError }: { photo: HeaderPhoto; onError: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const insets = useSafeAreaInsets();
  return <HeaderPhotoPreviewContext.Provider value={{ photo, onError }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ paddingTop: insets.top }}>
      <AppHeader title="Chits" subtitle={tr("customheadersettings.yourThoughtsBeautifullyKept")} actionWidth={96}
        leading={<IconButton label={tr("customheadersettings.openMenu")}><MenuIcon /></IconButton>}
        trailing={<View style={{ flexDirection: 'row' }}><IconButton label={tr("calendarnotepicker.searchNotes")}><HeaderIcon name="search-outline" size={23} /></IconButton><IconButton label={tr("id.addNote")}><HeaderIcon name="add" size={26} /></IconButton></View>} />
    </View>
  </HeaderPhotoPreviewContext.Provider>;
}

function HeaderEditor({ presentationReady, onClose, onBusyChange }: { presentationReady: boolean; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, scheme, topBar, customHeader, headerPhotoFailed, setCustomHeader } = useTheme();
  const statusStyle = customHeader && !headerPhotoFailed ? 'light' : topBar ? (topBar.dark ? 'light' : 'dark') : scheme === 'dark' ? 'light' : 'dark';
  const [photo, setPhoto] = useState<HeaderPhoto | null>(customHeader);
  const [operation, setOperation] = useState<'selecting' | 'processing' | 'saving' | null>(null);
  const busy = operation !== null;
  // A state update alone cannot exclude two taps within the same render.
  const operationActive = useRef(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [cropGestureActive, setCropGestureActive] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      // An interrupted crop must not leave the editor's scrolling locked.
      if (state !== 'active') setCropGestureActive(false);
    });
    return () => subscription.remove();
  }, []);
  const updateOperation = useCallback((next: typeof operation) => {
    setOperation(next);
    onBusyChange(next !== null);
  }, [onBusyChange]);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const staged = useRef<null | { remove: () => Promise<void> }>(null);
  const latest = useRef(photo);
  useEffect(() => { latest.current = photo; }, [photo]);
  const size = useRef({ width: 1, height: 1 });
  const gesture = useRef<{ photo: HeaderPhoto; x: number; y: number; distance: number; count: number } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (staged.current) void staged.current.remove().catch((cause) => photoDiagnostic('Staged image cleanup failed', cause)); }; }, []);
  // PanResponder stores these event callbacks; it does not read their refs during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // The iOS UIScrollView must not take over a touch that starts on the crop.
    onStartShouldSetPanResponderCapture: () => Platform.OS === 'ios',
    onMoveShouldSetPanResponderCapture: () => Platform.OS === 'ios',
    onPanResponderTerminationRequest: () => Platform.OS !== 'ios',
    onPanResponderGrant: () => {
      gesture.current = null;
      if (Platform.OS === 'ios') setCropGestureActive(true);
      photoDiagnostic('Crop gesture started');
    },
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
    onPanResponderRelease: () => {
      gesture.current = null;
      if (Platform.OS === 'ios') setCropGestureActive(false);
      photoDiagnostic('Crop gesture finished');
    },
    onPanResponderTerminate: () => {
      gesture.current = null;
      if (Platform.OS === 'ios') setCropGestureActive(false);
      photoDiagnostic('Crop gesture interrupted');
    },
  }));
  const choose = useCallback(async () => {
    photoDiagnostic('Choose Photo tap or initial request received');
    if (operationActive.current || !presentationReady || !appActive) {
      photoDiagnostic('Launch ignored: operation active or editor not ready');
      return;
    }
    operationActive.current = true;
    updateOperation('selecting'); setError(null);
    try {
      photoDiagnostic('Picker launch attempted after editor presentation');
      // PHPicker needs no broad library permission for this image-only flow.
      // Expo exposes completion, not a separate picker-opened callback.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 1,
        ...(Platform.OS === 'ios' ? { preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible } : {}),
      });
      photoDiagnostic(result.canceled ? 'Picker completed: canceled' : 'Picker completed: selected');
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error('Missing selected image');
      if (!mounted.current) return;
      updateOperation('processing');
      photoDiagnostic('Image processing and private storage started');
      const copy = await copyIntoAttachmentStorage(asset.uri, 'headers', { type: 'photo', originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? null, duration: null, width: asset.width, height: asset.height });
      photoDiagnostic('Image processing and private storage finished');
      if (!mounted.current) { await copy.remove(); return; }
      const previous = staged.current; staged.current = copy;
      if (previous) void previous.remove().catch((cause) => photoDiagnostic('Staged image cleanup failed', cause));
      setPhoto({ storagePath: copy.attachment.storagePath, width: copy.attachment.width!, height: copy.attachment.height!, x: 0.5, y: 0.5, zoom: 1, overlay: 0.6 });
      setFailed(false);
    } catch (cause) {
      photoDiagnostic('Picker or image processing failed', cause);
      if (mounted.current) setError(tr("customheadersettings.thatPhotoCouldNotBeOpenedPleaseChoose"));
    } finally {
      operationActive.current = false;
      if (mounted.current) { updateOperation(null); StatusBar.setStyle(statusStyle); }
      photoDiagnostic('Selection loading reset');
    }
  }, [presentationReady, appActive, updateOperation, statusStyle]);
  const pickedOnOpen = useRef(false);
  // iOS onShow is emitted by RN from UIKit's presentation completion. A mount
  // effect runs too early, even with animationType="none".
  useEffect(() => {
    if (!customHeader && !pickedOnOpen.current && presentationReady && appActive) {
      pickedOnOpen.current = true;
      void choose();
    }
  }, [choose, customHeader, presentationReady, appActive]);
  useEffect(() => { if (photo) photoDiagnostic('Header preview updated'); }, [photo]);
  const apply = async () => {
    if (!photo || operationActive.current || failed) return;
    operationActive.current = true;
    updateOperation('saving'); setError(null);
    photoDiagnostic('Header save started');
    const copy = staged.current; staged.current = null;
    try { await setCustomHeader(photo); photoDiagnostic('Header save finished'); onClose(); }
    catch (cause) { photoDiagnostic('Header save failed', cause); if (mounted.current) { staged.current = copy; setError(tr("customheadersettings.theHeaderCouldNotBeSavedPleaseTry")); } else if (copy) void copy.remove().catch((cause) => photoDiagnostic('Staged image cleanup failed', cause)); }
    finally { operationActive.current = false; if (mounted.current) updateOperation(null); photoDiagnostic('Save loading reset'); }
  };
  const adjust = (key: 'x' | 'y' | 'zoom' | 'overlay', amount: number) => setPhoto((p) => p ? { ...p, [key]: clamp(p[key] + amount, key === 'zoom' ? 1 : key === 'overlay' ? 0.6 : 0, key === 'zoom' ? 3 : key === 'overlay' ? 0.8 : 1) } : p);
  return <Screen edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style={statusStyle} />
    <AppHeader title={tr("customheadersettings.customHeader")} leading={<IconButton label={tr("customheadersettings.cancelHeaderChanges")} disabled={busy} onPress={onClose}><HeaderIcon name="close" size={24} /></IconButton>} />
    <ScrollView
      scrollEnabled={Platform.OS !== 'ios' || !cropGestureActive}
      {...(Platform.OS === 'ios' ? { canCancelContentTouches: false, pinchGestureEnabled: false } : {})}
      contentContainerStyle={{ paddingBottom: spacing.lg }}>
      <View style={styles.copy}><AppText variant="title">{tr("customheadersettings.makeChitsFeelMoreLikeYours")}</AppText><AppText style={{ color: tokens.textSecondary }}>{tr("customheadersettings.dragToPositionPinchToZoomThePreview")}</AppText></View>
      {photo ? <View collapsable={false} testID="custom-header-crop" accessibilityLabel={tr("customheadersettings.headerCropPreviewUseThePositioningButtonsBelow")} {...responder.panHandlers} onLayout={({ nativeEvent: { layout } }) => { size.current = layout; }} style={{ overflow: 'hidden' }}><HeaderPreview photo={photo} onError={() => { photoDiagnostic('Header preview image failed to load'); setFailed(true); }} /></View> : <View style={[styles.placeholder, { backgroundColor: tokens.surface }]}><Icon color={tokens.textMuted} name="image-outline" size={32} /><AppText>{tr("customheadersettings.chooseAFavoritePhoto")}</AppText></View>}
      <View style={styles.copy}>
        <SecondaryButton label={photo ? tr("customheadersettings.replacePhoto") : tr("customheadersettings.choosePhoto")} disabled={busy || !presentationReady || !appActive} onPress={() => void choose()} />
        {photo ? <>
          <View style={styles.row}><IconButton label={tr("customheadersettings.movePhotoLeft")} disabled={busy} onPress={() => adjust('x', 0.1)}><Icon color={tokens.textPrimary} name="arrow-back" size={22} /></IconButton><IconButton label={tr("customheadersettings.movePhotoUp")} disabled={busy} onPress={() => adjust('y', 0.1)}><Icon color={tokens.textPrimary} name="arrow-up" size={22} /></IconButton><IconButton label={tr("customheadersettings.movePhotoDown")} disabled={busy} onPress={() => adjust('y', -0.1)}><Icon color={tokens.textPrimary} name="arrow-down" size={22} /></IconButton><IconButton label={tr("customheadersettings.movePhotoRight")} disabled={busy} onPress={() => adjust('x', -0.1)}><Icon color={tokens.textPrimary} name="arrow-forward" size={22} /></IconButton></View>
          <View style={styles.row}><SecondaryButton label={tr("customheadersettings.zoomOut")} disabled={busy || photo.zoom <= 1} onPress={() => adjust('zoom', -0.25)} /><AppText>{Math.round(photo.zoom * 100)}%</AppText><SecondaryButton label={tr("customheadersettings.zoomIn")} disabled={busy || photo.zoom >= 3} onPress={() => adjust('zoom', 0.25)} /></View>
          <AppText style={{ color: tokens.textSecondary }}>{tr("customheadersettings.photoShading")}</AppText>
          <View style={styles.row}><SecondaryButton label={tr("customheadersettings.lighter")} disabled={busy || photo.overlay <= 0.6} onPress={() => adjust('overlay', -0.05)} /><SecondaryButton label={tr("customheadersettings.darker")} disabled={busy || photo.overlay >= 0.8} onPress={() => adjust('overlay', 0.05)} /></View>
          <AppText style={{ color: tokens.textMuted }}>{tr("customheadersettings.yourPhotoFillsTheHeaderOnEachScreen")}</AppText>
        </> : null}
        {error || failed ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error ?? tr("customheadersettings.thisPhotoCouldNotBeLoadedPleaseChoose")}</AppText> : null}
        <PrimaryButton label={busy ? tr("customheadersettings.pleaseWait") : tr("customheadersettings.applyHeader")} disabled={busy || !photo || failed} onPress={() => void apply()} />
        <SecondaryButton label={tr("chat.cancel")} disabled={busy} onPress={onClose} />
      </View>
    </ScrollView>
  </Screen>;
}

export function CustomHeaderSettings() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, styleTokens, customHeader, headerPhotoFailed, setCustomHeader, failHeaderPhoto } = useTheme();
  const [editing, setEditing] = useState(false);
  const [presentationReady, setPresentationReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try { await setCustomHeader(null); } catch { setError(tr("customheadersettings.thePhotoCouldNotBeRemovedPleaseTry")); }
    finally { setBusy(false); }
  };
  if (Platform.OS === 'web') return null;
  return <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle, borderRadius: styleTokens.radius.panel }]}>
    {customHeader && !headerPhotoFailed ? <View style={{ overflow: 'hidden' }}><HeaderPreview photo={customHeader} onError={failHeaderPhoto} /></View> : null}
    <View style={styles.copy}>
      <View style={styles.row}><AppText variant="title">{tr("customheadersettings.customHeader")}</AppText>{customHeader && !headerPhotoFailed ? <AppText style={{ color: tokens.textPrimary }}>{tr("customheadersettings.selected")}</AppText> : null}</View>
      <AppText style={{ color: tokens.textSecondary }}>{tr("customheadersettings.makeChitsFeelMoreLikeYours")}</AppText>
      {!customHeader || headerPhotoFailed ? <View style={[styles.placeholder, { backgroundColor: tokens.surfaceElevated }]}><Icon color={tokens.textMuted} name="image-outline" size={30} /><AppText style={{ color: tokens.textMuted }}>{headerPhotoFailed ? tr("customheadersettings.photoUnavailableYourBuiltInHeaderIsIn") : tr("customheadersettings.aFavoritePlaceAQuietMomentYourPhoto")}</AppText></View> : null}
      <SecondaryButton label={customHeader ? tr("customheadersettings.editOrReplacePhoto") : tr("customheadersettings.choosePhoto")} disabled={busy} onPress={() => { photoDiagnostic('Settings photo button tap received'); setPresentationReady(false); setEditing(true); }} />
      {customHeader ? <SecondaryButton label={tr("customheadersettings.removePhotoUseBuiltInHeader")} disabled={busy} onPress={() => void remove()} /> : null}
      {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
    </View>
    <Modal visible={editing} animationType="none" presentationStyle="fullScreen" onShow={() => { photoDiagnostic('Editor native presentation completed'); setPresentationReady(true); }} onRequestClose={() => { if (!busy) setEditing(false); }}>
      <SafeAreaProvider>{editing ? <HeaderEditor presentationReady={Platform.OS !== 'ios' || presentationReady} onClose={() => { setBusy(false); setEditing(false); }} onBusyChange={setBusy} /> : null}</SafeAreaProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, overflow: 'hidden', marginTop: spacing.lg },
  copy: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  placeholder: { padding: spacing.lg, minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 12 },
});
