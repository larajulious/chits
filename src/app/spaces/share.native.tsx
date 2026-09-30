import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showPermissionSettingsPrompt } from '@/components/permissions/permission-settings-prompt';
import { useSpaceFonts } from '@/components/spaces/space-fonts';
import { SpaceShareCanvas } from '@/components/spaces/space-share-canvas';
import { ChitsLoader } from '@/components/ui/chits-loader';
import { Toast } from '@/components/ui/primitives';
import { resolveSpaceId, SPACES, DEFAULT_SPACE_ID } from '@/constants/spaces';
import { SPACE_UI } from '@/constants/spaces-theme';
import { createSpaceRepository } from '@/db/repositories';
import type { PinnedNote } from '@/db/types';
import { captureShareNote, discardShareNoteImage, saveShareNoteImage, shareNoteExportWidth, shareShareNoteImage, type ShareNoteImageFile } from '@/services/share-note-export';

type Busy = 'generating' | 'saving' | 'sharing' | null;
const BUSY_LABEL: Record<Exclude<Busy, null>, string> = { generating: 'Generating image…', saving: 'Saving image…', sharing: 'Opening share sheet…' };
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Share a space (from the board's share button): a Polaroid of the board to
 * save or share. The file is captured from a second, off-screen copy drawn at
 * exactly 1080×1080 — the same capture, save and share code as Share Note —
 * so it's crisp and never a screenshot of the app.
 */
export default function ShareSpaceScreen() {
  const database = useSQLiteContext();
  const params = useLocalSearchParams<{ space?: string }>();
  const spaceId = resolveSpaceId(params.space) ?? DEFAULT_SPACE_ID;
  const space = SPACES[spaceId];
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const fonts = useSpaceFonts();
  const [notes, setNotes] = useState<PinnedNote[] | null>(null);
  const [hideText, setHideText] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<string | null>(null);
  const exportRef = useRef<View>(null);
  const generated = useRef<{ key: string; file: ShareNoteImageFile } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void createSpaceRepository(database).list(spaceId).then((list) => { if (!cancelled) setNotes(list); }, () => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [database, spaceId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  // The last generated file is only a temporary copy.
  useEffect(() => () => discardShareNoteImage(generated.current?.file ?? null), []);

  // Waits for the bundled faces, so the file never falls back to a system font.
  const canExport = Boolean(notes?.length && fonts.ready);
  const designKey = JSON.stringify([hideText, notes?.map((note) => [note.id, note.x, note.y, note.color, note.zIndex])]);
  const generate = async (): Promise<ShareNoteImageFile> => {
    if (generated.current?.key === designKey) return generated.current.file;
    // Let the off-screen canvas commit its latest props before it's drawn.
    await nextFrame();
    await nextFrame();
    if (!exportRef.current) throw new Error('Space canvas is not ready.');
    const file = await captureShareNote(exportRef.current, 'square', false, 'Chits Space');
    discardShareNoteImage(generated.current?.file ?? null);
    generated.current = { key: designKey, file };
    return file;
  };
  const run = async (action: 'save' | 'share') => {
    if (busyRef.current || !canExport) return;
    busyRef.current = true;
    setToast(null);
    try {
      setBusy('generating');
      const file = await generate();
      if (action === 'save') {
        setBusy('saving');
        const outcome = await saveShareNoteImage(file);
        if (outcome.status === 'saved') { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setToast(outcome.savedTo); }
        else if (outcome.status === 'failed' && outcome.code === 'permission') showPermissionSettingsPrompt('photos');
        else if (outcome.status === 'failed') setToast(outcome.code === 'no_space' ? 'Not enough storage space to save this image.' : 'Couldn’t save the image. Please try again.');
      } else {
        setBusy('sharing');
        if (!await shareShareNoteImage(file)) setToast('Sharing isn’t available right now.');
      }
    } catch (error) {
      console.warn('[spaces] export failed', error);
      setToast('Couldn’t create the image. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/spaces'));
  const previewSize = Math.min(window.width - 24, 440, window.height * 0.5);
  const disabled = !canExport || Boolean(busy);
  return <View style={styles.root}>
    <StatusBar style="light" />
    {/* The export canvas: drawn at 1080×1080 underneath the opaque screen content. */}
    {notes ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.exportStage}>
      <View ref={exportRef} collapsable={false}>
        <SpaceShareCanvas spaceId={spaceId} notes={notes} size={shareNoteExportWidth('square')} hideText={hideText} />
      </View>
    </View> : null}

    <View style={[styles.cover, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <Ionicons accessible={false} name="close" size={22} color={SPACE_UI.paper} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={[fonts.uiHeavy, styles.title]}>Share your {space.name}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {notes === null ? <View style={styles.center}><ChitsLoader label="Preparing preview…" /></View> : <ScrollView contentContainerStyle={styles.content}>
        <View accessible accessibilityRole="image" accessibilityLabel={`Preview: a photo of your ${space.name} with ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${hideText ? ', note text hidden' : ''}`}>
          <SpaceShareCanvas spaceId={spaceId} notes={notes} size={previewSize} hideText={hideText} />
        </View>
        <View style={styles.option}>
          <View style={styles.optionCopy}>
            <Text style={[fonts.uiSemi, styles.optionTitle]}>Hide note text</Text>
            <Text style={[fonts.ui, styles.optionDetail]}>Your notes’ words are left out of the image; the board and notes stay.</Text>
          </View>
          <Switch accessibilityLabel="Hide note text" value={hideText} onValueChange={(value) => { void Haptics.selectionAsync(); setHideText(value); }} trackColor={{ true: SPACE_UI.accent, false: SPACE_UI.switchOff }} thumbColor={Platform.OS === 'android' ? SPACE_UI.paperWhite : undefined} ios_backgroundColor={SPACE_UI.switchOff} />
        </View>
      </ScrollView>}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {busy ? <View accessibilityLiveRegion="polite" style={styles.busyRow}><ChitsLoader size="small" /><Text style={[fonts.ui, styles.busyText]}>{BUSY_LABEL[busy]}</Text></View> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void run('save')} style={({ pressed }) => [styles.action, styles.save, disabled && styles.disabled, pressed && styles.pressed]}>
            <Ionicons accessible={false} name="download-outline" size={19} color={SPACE_UI.paper} />
            <Text style={[fonts.uiSemi, styles.actionText, { color: SPACE_UI.paper }]}>Save image</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void run('share')} style={({ pressed }) => [styles.action, styles.share, disabled && styles.disabled, pressed && styles.pressed]}>
            <Ionicons accessible={false} name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'} size={19} color={SPACE_UI.accentText} />
            <Text style={[fonts.uiSemi, styles.actionText, { color: SPACE_UI.accentText }]}>Share</Text>
          </Pressable>
        </View>
      </View>
    </View>
    <Toast message={toast} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_UI.ink },
  exportStage: { position: 'absolute', top: 0, left: 0 },
  // Opaque and full-screen (status bar included), so the export canvas beneath never shows.
  cover: { flex: 1, backgroundColor: SPACE_UI.ink },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.inkRaised },
  title: { flex: 1, fontSize: 20, textAlign: 'center', color: SPACE_UI.paper },
  headerSpacer: { width: 44 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24 },
  option: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 16, borderRadius: 16, backgroundColor: SPACE_UI.inkRaised },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 16, color: SPACE_UI.paper },
  optionDetail: { marginTop: 2, fontSize: 13, lineHeight: 18, color: SPACE_UI.textMuted },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  busyText: { fontSize: 13, color: SPACE_UI.textMuted },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  save: { borderWidth: 1.5, borderColor: SPACE_UI.paper },
  share: { backgroundColor: SPACE_UI.accent },
  actionText: { fontSize: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
