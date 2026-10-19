import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';

import { ChecklistMeasure, measureShareNote, ShareNoteTemplate, type ShareNoteContent } from '@/components/share-note/share-note-template';
import { ControlSection, ImageSelector, InfoLine, SegmentedControl, ThemePicker, ToggleRow } from '@/components/share-note/share-note-controls';
import { showPermissionSettingsPrompt } from '@/components/permissions/permission-settings-prompt';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton, Screen, Toast, HeaderIcon } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { layout as layoutTokens, radii, spacing } from '@/constants/theme';
import { getShareNoteTheme, shareNoteThemeForIdentity } from '@/constants/chits-themes';
import {
  availableShareNoteModes, DEFAULT_SHARE_NOTE_FORMAT, defaultShareNoteMode, initialShareNoteImages, MAX_SHARE_NOTE_IMAGE_HEIGHT, paginateChecklistRows, paginateInlineShare, SHARE_NOTE_COPY, SHARE_NOTE_FORMATS,
  SHARE_NOTE_MODES, shareNoteAvailability, shareNoteLayout, toggleShareNoteImage, type ShareNoteFormat, type ShareNoteMode, type ShareNoteSource,
} from '@/services/share-note';
import { captureShareNote, discardShareNoteImage, saveShareNoteImage, shareNoteExportWidth, shareShareNoteImages, type ShareNoteImageFile } from '@/services/share-note-export';
import { loadShareNoteSource } from '@/services/share-note-source';

type Busy = 'generating' | 'saving' | 'sharing' | null;
const BUSY_LABEL: Record<Exclude<Busy, null>, string> = { get generating() { return tr("sharenote.generatingImage"); }, get saving() { return tr("sharenote.savingImage"); }, get sharing() { return tr("sharenote.openingShareSheet"); } };
const FORMAT_DETAIL: Record<ShareNoteFormat, string> = { portrait: '4:5', square: '1:1', story: '9:16' };
const IMAGE_WAIT_MS = 5000;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Share Note: turns a thought or card into a designed image to save or share.
 * Opened from Chat's thought actions, Card Details and the Cards list with
 * `?messageId=` or `?cardId=`. The live preview and the exported file are the
 * same ShareNoteTemplate — the file is captured from a second, off-screen copy
 * drawn at exactly 1080px wide, so it's crisp and never a screenshot of the app.
 */
export default function ShareNoteScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { messageId, cardId } = useLocalSearchParams<{ messageId?: string; cardId?: string }>();
  const { tokens: theme, identity } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const [source, setSource] = useState<ShareNoteSource | null | undefined>();
  const showLoader = useChitsLoading(source === undefined);
  const [mode, setMode] = useState<ShareNoteMode>('text');
  // Starts on the design matching the app's theme; any other design is one tap away.
  const [themeId, setThemeId] = useState(() => shareNoteThemeForIdentity(identity));
  const [format, setFormat] = useState<ShareNoteFormat>(DEFAULT_SHARE_NOTE_FORMAT);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBranding, setShowBranding] = useState(true);
  const [limitReached, setLimitReached] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const target = messageId ? { messageId } : cardId ? { cardId } : null;
    let cancelled = false;
    void (target ? loadShareNoteSource(database, target) : Promise.resolve(null)).catch(() => null).then((loaded) => {
      if (cancelled) return;
      setSource(loaded);
      if (loaded) { setMode(defaultShareNoteMode(loaded)); setSelectedIds(initialShareNoteImages(loaded)); }
    });
    return () => { cancelled = true; };
  }, [database, messageId, cardId]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!limitReached) return; const timer = setTimeout(() => setLimitReached(false), 2400); return () => clearTimeout(timer); }, [limitReached]);

  const shareTheme = getShareNoteTheme(themeId);
  const hasChecklist = Boolean(source?.subtasks.length);
  const content = useMemo<ShareNoteContent>(() => ({
    title: mode === 'image' && !source?.subtasks.length ? null : source?.title ?? null,
    text: mode === 'image' ? null : source?.text ?? null,
    images: mode === 'text' || !source ? [] : selectedIds.flatMap((id) => source.images.filter((image) => image.id === id)),
    subtasks: source?.subtasks ?? [],
    blocks: mode !== 'image' ? source?.blocks?.filter((block) => block.type === 'text' || (mode === 'text-image' && selectedIds.includes(block.image.id))) : undefined,
  }), [mode, selectedIds, source]);
  const standardMeasurement = hasChecklist || content.blocks?.length ? null : measureShareNote({ content, theme: shareTheme, format, mode, showBranding });

  // Each checklist label is measured at the export width, using the same row
  // renderer as the final image. Page boundaries are chosen only after all
  // rows have laid out, so wrapped lines cannot disappear below a capture.
  const measurementKey = JSON.stringify([themeId, format, source?.subtasks]);
  const [rowMeasurements, setRowMeasurements] = useState<{ key: string; heights: number[] }>({ key: '', heights: [] });
  const measuredRows = useMemo(() => rowMeasurements.key === measurementKey ? rowMeasurements.heights : [], [rowMeasurements, measurementKey]);
  const rowsReady = !hasChecklist || (measuredRows.length === content.subtasks?.length && measuredRows.every((height) => height > 0));
  const onRowHeight = useCallback((index: number, height: number) => {
    const nextHeight = Math.ceil(height + 1);
    setRowMeasurements((current) => {
      const heights = current.key === measurementKey ? [...current.heights] : Array(content.subtasks?.length ?? 0).fill(0);
      if (heights[index] === nextHeight) return current;
      heights[index] = nextHeight;
      return { key: measurementKey, heights };
    });
  }, [content.subtasks?.length, measurementKey]);
  const [pageReserve, setPageReserve] = useState<{ key: string; first: number; later: number }>({ key: '', first: 0, later: 0 });
  const reserve = pageReserve.key === measurementKey ? pageReserve : { first: 0, later: 0 };
  const frame = shareNoteLayout({ format, mode, imageCount: content.images.length, hasTitle: Boolean(content.title), showMark: false, showBranding });
  const maxDesignHeight = MAX_SHARE_NOTE_IMAGE_HEIGHT / 3;
  const firstOverhead = Math.max(frame.canvas.height, frame.card.top * 2 + frame.card.padding * 2 + (content.title ? 90 : 0) + (content.text ? (mode === 'text-image' ? 100 : 155) : 0) + (content.images.length ? (format === 'story' ? 230 : 210) : 0) + (showBranding ? 44 : 0) + 110) + reserve.first;
  const laterOverhead = Math.max(frame.canvas.height, frame.card.top * 2 + frame.card.padding * 2 + (content.title ? 90 : 0) + (showBranding ? 44 : 0) + 110) + reserve.later;
  const ranges = useMemo(() => hasChecklist && rowsReady ? paginateChecklistRows(measuredRows, firstOverhead, laterOverhead, maxDesignHeight) : [], [hasChecklist, rowsReady, measuredRows, firstOverhead, laterOverhead, maxDesignHeight]);
  const pages: { content: ShareNoteContent; mode: ShareNoteMode }[] = hasChecklist
    ? ranges.map((range, index) => ({ content: { ...content, text: index === 0 ? content.text : null, images: index === 0 ? content.images : [], blocks: index === 0 ? content.blocks : undefined, subtasks: content.subtasks?.slice(range.start, range.end) }, mode: index === 0 ? mode : 'text' }))
    : content.blocks?.length ? paginateInlineShare(content.blocks).map((blocks, index) => ({ content: { ...content, title: index === 0 ? content.title : null, blocks, images: blocks.flatMap((block) => block.type === 'image' ? [block.image] : []) }, mode })) : [{ content, mode }];
  const renderKey = JSON.stringify([mode, themeId, format, selectedIds, showBranding, source?.title, source?.text, source?.blocks, source?.subtasks, ranges]);
  const [pageMeasurements, setPageMeasurements] = useState<{ key: string; heights: number[] }>({ key: '', heights: [] });
  const pageHeights = useMemo(() => pageMeasurements.key === renderKey ? pageMeasurements.heights : [], [pageMeasurements, renderKey]);
  const onPageReady = useCallback((index: number, height: number) => {
    setPageMeasurements((current) => {
      const heights = current.key === renderKey ? [...current.heights] : Array(pages.length).fill(0);
      if (heights[index] === height) return current;
      heights[index] = height;
      return { key: renderKey, heights };
    });
    if (height > maxDesignHeight && ranges[index] && ranges[index].end - ranges[index].start > 1) {
      const extra = Math.ceil(height - maxDesignHeight) + 40;
      setPageReserve((current) => ({ key: measurementKey, first: (current.key === measurementKey ? current.first : 0) + (index === 0 ? extra : 0), later: (current.key === measurementKey ? current.later : 0) + (index > 0 ? extra : 0) }));
    }
  }, [maxDesignHeight, measurementKey, pages.length, ranges, renderKey]);
  const flowing = hasChecklist || Boolean(content.blocks?.length);
  const pagesReady = !flowing || ((!hasChecklist || rowsReady) && pages.length > 0 && pageHeights.length === pages.length && pageHeights.every((height) => height > 0 && height <= maxDesignHeight));
  const oversizedPage = flowing && pageHeights.some((height) => height > maxDesignHeight);
  const canExport = Boolean(content.text || content.title || content.images.length || content.subtasks?.length) && pagesReady;

  // ── Export: one cached file per page, so Save then Share reuse the same render.
  const exportRefs = useRef<(View | null)[]>([]);
  const loadedImages = useRef(new Set<string>());
  const generated = useRef<{ key: string; files: ShareNoteImageFile[] } | null>(null);
  const designKey = JSON.stringify([renderKey, pageHeights]);
  useEffect(() => () => { generated.current?.files.forEach(discardShareNoteImage); }, []);
  const markImageLoaded = useCallback((id: string) => { loadedImages.current.add(id); }, []);
  // A photo that leaves the design unmounts; when it comes back it must load again before a capture.
  useEffect(() => {
    const shown = new Set(content.images.map((image) => image.id));
    for (const id of loadedImages.current) if (!shown.has(id)) loadedImages.current.delete(id);
  }, [content.images]);

  const waitForImages = async (ids: string[]) => {
    const started = Date.now();
    while (ids.some((id) => !loadedImages.current.has(id)) && Date.now() - started < IMAGE_WAIT_MS) await new Promise((resolve) => setTimeout(resolve, 50));
  };

  const generate = async (): Promise<ShareNoteImageFile[]> => {
    if (generated.current?.key === designKey) return generated.current.files;
    await waitForImages(content.images.map((image) => image.id));
    // Let the off-screen canvas commit its latest props before it's drawn.
    await nextFrame();
    await nextFrame();
    const files: ShareNoteImageFile[] = [];
    try {
      for (let index = 0; index < pages.length; index++) {
        const view = exportRefs.current[index];
        if (!view) throw new Error(tr("sharenote.shareNoteCanvasIsNotReady"));
        const name = pages.length > 1 ? `Chits Note Page ${index + 1} of ${pages.length}` : undefined;
        const height = flowing ? Math.round(pageHeights[index] * SHARE_NOTE_FORMATS[format].width / 360) : undefined;
        files.push(await captureShareNote(view, format, pages[index].content.images.length > 0, name, height));
      }
    } catch (error) { files.forEach(discardShareNoteImage); throw error; }
    generated.current?.files.forEach(discardShareNoteImage);
    generated.current = { key: designKey, files };
    return files;
  };

  const run = async (action: 'save' | 'share') => {
    if (busyRef.current || !canExport) return;
    busyRef.current = true;
    setToast(null);
    try {
      setBusy('generating');
      const files = await generate();
      if (action === 'save') {
        setBusy('saving');
        let saved = 0;
        let destination = '';
        for (const file of files) {
          const outcome = await saveShareNoteImage(file);
          if (outcome.status === 'saved') { saved++; destination = outcome.savedTo; continue; }
          if (outcome.status === 'failed' && outcome.code === 'permission') showPermissionSettingsPrompt('photos');
          else if (outcome.status === 'failed') setToast(saved ? tr("messages.ofPagesSavedTheRestCouldNotBe", { value1: saved, value2: files.length }) : outcome.code === 'no_space' ? tr("sharenote.notEnoughStorageSpaceToSaveThisImage") : tr("sharenote.couldnTSaveTheImagePleaseTryAgain"));
          else if (saved) setToast(tr("sharenote.valueOfValuePagesSaved", { value1: saved, value2: files.length }));
          break;
        }
        if (saved === files.length) { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setToast(files.length === 1 ? destination : tr("messages.imagesSavedInChecklistOrder", { value1: files.length })); }
      } else {
        setBusy('sharing');
        if (!await shareShareNoteImages(files)) setToast(tr("sharenote.sharingIsnTAvailableRightNow"));
      }
    } catch (error) {
      console.warn('[share-note] export failed', error);
      setToast(tr("sharenote.couldnTCreateTheImagePleaseTryAgain"));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/chat'); };
  const header = <AppHeader title={tr("sharenote.createShareNote")} leading={<IconButton label={tr("attachments.close")} onPress={close}><HeaderIcon name="close" size={24} /></IconButton>} />;

  if (source === undefined) return <Screen>{header}<View style={styles.center}>{showLoader ? <ChitsLoader label={tr("sharenote.preparingPreview")} /> : null}</View></Screen>;

  const availability = source ? shareNoteAvailability(source) : null;
  if (!source || !availability?.ok) {
    return <Screen>{header}
      <View style={styles.center}>
        <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name="image-outline" size={26} color={theme.textMuted} /></View>
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{source ? tr("sharenote.nothingToShareYet") : tr("revisit.noteUnavailable")}</Text>
        <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>{availability && !availability.ok ? availability.message : tr("id.itMayHaveBeenArchivedOrDeleted")}</Text>
        <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.emptyButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}><Text style={[styles.emptyButtonText, { color: theme.textPrimary }]}>{tr("attachments.close")}</Text></Pressable>
      </View>
    </Screen>;
  }

  const modes = availableShareNoteModes(source);
  const modeHint = !modes.image ? tr("sharenote.addAPhotoToThisNoteToUse") : !modes.text ? tr("sharenote.thisNoteHasNoTextSoItS") : null;
  const imageHint = mode === 'image' && !selectedIds.length ? tr("sharenote.chooseAnImageToInclude") : SHARE_NOTE_COPY.imageLimit;

  // The preview is the same template at a smaller width; keep it within the upper part of the screen.
  const ratio = standardMeasurement?.layout.canvas.height ? standardMeasurement.layout.canvas.height / standardMeasurement.layout.canvas.width : SHARE_NOTE_FORMATS[format].height / SHARE_NOTE_FORMATS[format].width;
  const maxPreviewHeight = window.height * (format === 'story' ? 0.44 : 0.38);
  const previewWidth = Math.min(window.width - spacing.lg * 2, 400, hasChecklist ? 400 : maxPreviewHeight / ratio);
  const exportWidth = shareNoteExportWidth(format);
  const exportHeight = Math.max(frame.canvas.height, ...pageHeights, 450) * exportWidth / 360;

  const toggleImage = (id: string) => {
    const next = toggleShareNoteImage(selectedIds, id);
    if (next.limited) { setLimitReached(true); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); return; }
    void Haptics.selectionAsync();
    setSelectedIds(next.selected);
  };

  return <Screen edges={['top', 'left', 'right']}>
    {/* The export canvas: drawn at 1080px, underneath the opaque screen content. */}
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.exportStage, { top: insets.top, width: exportWidth, height: exportHeight }]}>
      {hasChecklist ? <ChecklistMeasure key={measurementKey} subtasks={content.subtasks ?? []} theme={shareTheme} format={format} width={exportWidth} onRowHeight={onRowHeight} /> : null}
      {pages.map((page, index) => <View key={`${renderKey}:${index}`} ref={(view) => { exportRefs.current[index] = view; }} collapsable={false} style={styles.exportPage}>
        <ShareNoteTemplate content={page.content} theme={shareTheme} format={format} mode={page.mode} showBranding={showBranding} width={exportWidth} page={{ index, total: pages.length }} onCanvasReady={(height) => onPageReady(index, height)} onImageLoad={markImageLoaded} />
      </View>)}
    </View>

    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      {header}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={[styles.helper, { color: theme.textMuted }]}>{tr("sharenote.turnThisNoteIntoABeautifulImageYou")}</Text>
        {hasChecklist && !rowsReady ? <Text style={[styles.helper, { color: theme.textMuted }]}>{tr("sharenote.preparingChecklistPreview")}</Text> : pages.map((page, index) => <View key={`preview:${renderKey}:${index}`} accessible accessibilityRole="image" accessibilityLabel={tr("sharenote.previewPageValueOfValueValueTheme", { value1: index + 1, value2: pages.length, value3: shareTheme.name })} style={[styles.preview, { width: previewWidth, backgroundColor: theme.surface }, !hasChecklist && !content.blocks?.length && { height: previewWidth * ratio }, index > 0 && { marginTop: spacing.md }]}>
          <ShareNoteTemplate content={page.content} theme={shareTheme} format={format} mode={page.mode} showBranding={showBranding} width={previewWidth} page={{ index, total: pages.length }} />
        </View>)}
        {oversizedPage ? <InfoLine icon="alert-circle-outline" tone="warning" message={tr("sharenote.aChecklistItemIsTooLongForOne")} /> : null}
        {standardMeasurement?.fit?.truncated ? <InfoLine icon="alert-circle-outline" tone="warning" message={SHARE_NOTE_COPY.tooLong} /> : null}
        {source.unsupportedCount ? <InfoLine icon="information-circle-outline" message={tr("sharenote.valueVideosAudioAndFilesOnThisNote", { value1: SHARE_NOTE_COPY.unsupported })} /> : null}

        <ControlSection title={tr("sharenote.theme")}>
          <ThemePicker value={themeId} onChange={(id) => { void Haptics.selectionAsync(); setThemeId(id); }} />
        </ControlSection>

        <ControlSection title={tr("id.content")} hint={modeHint}>
          <SegmentedControl label={tr("sharenote.content")} value={mode} onChange={setMode} options={SHARE_NOTE_MODES.map((option) => ({ ...option, disabled: !modes[option.key] }))} />
          {source.subtasks.length ? <InfoLine icon="checkbox-outline" message={tr("sharenote.valueChecklistItemsAreIncludedAutomatically", { value1: source.subtasks.length })} /> : null}
        </ControlSection>

        {mode !== 'text' && source.images.length ? <ControlSection title={tr("sharenote.images")} hint={limitReached ? SHARE_NOTE_COPY.imageLimit : imageHint} hintEmphasis={limitReached}>
          <ImageSelector images={source.images} selected={selectedIds} onToggle={toggleImage} />
        </ControlSection> : null}

        <ControlSection title={tr("sharenote.size")}>
          <SegmentedControl label={tr("sharenote.size2")} value={format} onChange={setFormat} options={(Object.keys(SHARE_NOTE_FORMATS) as ShareNoteFormat[]).map((key) => ({ key, label: SHARE_NOTE_FORMATS[key].label, detail: FORMAT_DETAIL[key] }))} />
        </ControlSection>

        <ControlSection title={tr("sharenote.branding")}>
          <ToggleRow label={tr("sharenote.showSharedFromChits")} value={showBranding} onChange={setShowBranding} />
        </ControlSection>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm), borderTopColor: theme.borderSubtle, backgroundColor: theme.background }]}>
        {busy ? <View accessibilityLiveRegion="polite" style={styles.busyRow}><ChitsLoader size="small" /><Text style={[styles.busyText, { color: theme.textSecondary }]}>{BUSY_LABEL[busy]}</Text></View> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canExport || Boolean(busy) }} disabled={!canExport || Boolean(busy)} onPress={() => void run('save')} style={({ pressed }) => [styles.action, { backgroundColor: theme.surfaceElevated }, (!canExport || busy) && styles.disabled, pressed && styles.pressed]}>
            <Ionicons accessible={false} name="download-outline" size={19} color={theme.textPrimary} />
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>{pages.length > 1 ? tr("sharenote.saveImages") : tr("sharenote.saveImage")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canExport || Boolean(busy) }} disabled={!canExport || Boolean(busy)} onPress={() => void run('share')} style={({ pressed }) => [styles.action, { backgroundColor: theme.accent }, (!canExport || busy) && styles.disabled, pressed && styles.pressed]}>
            <Ionicons accessible={false} name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'} size={19} color={theme.accentText} />
            <Text style={[styles.actionText, { color: theme.accentText }]}>{pages.length > 1 ? tr("sharenote.shareImages") : tr("sharenote.shareImage")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
    <Toast message={toast} />
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  exportStage: { position: 'absolute', left: 0 },
  exportPage: { position: 'absolute', left: 0, top: 0 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  helper: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: spacing.md },
  preview: { alignSelf: 'center', overflow: 'hidden', borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xs },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyButton: { marginTop: spacing.md, minHeight: layoutTokens.minimumTouchTarget, paddingHorizontal: spacing.lg, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  emptyButtonText: { fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  busyText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.control },
  actionText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
