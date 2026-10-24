import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useChatBackground } from '@/components/chat/chat-background-context';
import { attachmentBackgroundImage, DEFAULT_BACKGROUND_DIM } from '@/services/chat-background';
import { useAttachmentDeletion } from '@/components/attachments/use-attachment-deletion';
import { PhotoAttachmentViewer } from '@/components/attachments/photo-attachment-viewer';
import { subscribeToAttachmentChanges } from '@/services/attachment-changes';
import { AttachmentContent } from '@/components/chat/message-row';
import { isPdfAttachment } from '@/services/pdf-attachment';
import { AppHeader, AppText, Chip, ChipRow, EmptyState, Icon, IconButton, PrimaryButton, Screen, SecondaryButton, Toast, HeaderIcon, MenuIcon } from '@/components/ui/primitives';
import { DeskHeading, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PaperCard, PaperDesk, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { stableTilt } from '@/constants/style-tokens';
import type { IconName } from '@/components/ui/icon';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useAttachmentExport } from '@/components/attachments/use-attachment-export';
import { exportActionLabel, shareAttachment } from '@/services/attachment-export';
import { exportFileName } from '@/services/attachment-export-naming';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { SearchField } from '@/components/ui/search-field';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { createAttachmentRepository } from '@/db/repositories';
import type { AttachmentFilterType, AttachmentLike, AttachmentSummary } from '@/db/types';

const PAGE_SIZE = 24;
const GRID_COLUMNS = 3;
// Room between the papers for their tilt, tape and shadow.
const GRID_GAP = 14;
const POLAROID_SIDE = 7;
const POLAROID_BOTTOM = 20;
const SEARCH_DEBOUNCE_MS = 300;

type TypeFilter = 'all' | AttachmentFilterType;
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', get label() { return tr("attachments.all"); } },
  { key: 'photo', get label() { return tr("attachments.photos"); } },
  { key: 'video', get label() { return tr("attachments.videos"); } },
  { key: 'audio', get label() { return tr("attachments.audio"); } },
  { key: 'file', get label() { return tr("attachments.files"); } },
];

function pluralize(count: number, singular: string) { return countLabel(singular, count); }

function toAttachmentLike(item: AttachmentSummary): AttachmentLike {
  return { id: item.id, type: item.type, storagePath: item.storagePath, originalName: item.originalName, mimeType: item.mimeType, size: item.size, duration: item.duration, width: item.width, height: item.height, createdAt: item.createdAt };
}

function formatDurationSeconds(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatFileSize(size: number | null) {
  if (!size) return null;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(item: AttachmentSummary) {
  if (isPdfAttachment(item)) return 'PDF';
  return item.originalName?.split('.').pop()?.toUpperCase() ?? null;
}

function fileTileIcon(item: AttachmentSummary): IconName {
  if (isPdfAttachment(item)) return 'document-text-outline';
  const value = `${item.mimeType ?? ''} ${item.originalName ?? ''}`.toLowerCase();
  if (value.includes('zip') || value.includes('archive') || value.includes('.rar')) return 'archive-outline';
  if (value.includes('sheet') || value.includes('excel') || value.includes('.csv') || value.includes('.xls')) return 'grid-outline';
  if (value.includes('pdf')) return 'document-text-outline';
  return 'document-outline';
}

function TypeFilterChips({ filter, onChange }: { filter: TypeFilter; onChange: (next: TypeFilter) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return (
    <ChipRow style={styles.chipScroll}>
      {TYPE_FILTERS.map((chip) => (
        <Chip key={chip.key} label={chip.label} selected={chip.key === filter} accessibilityLabel={tr("attachments.filterByValue", { value1: chip.label })} onPress={() => onChange(chip.key)} />
      ))}
    </ChipRow>
  );
}

// Photo/video reuse AttachmentContent's own thumbnail rendering (lazy image
// loading, availability checks, all built in) with pointerEvents disabled on
// it — this whole tile's tap target is the outer Pressable, which opens the
// context/"View card" detail sheet below rather than AttachmentContent's own
// internal fullscreen viewer. Audio and file don't have a square-tile mode in
// AttachmentContent (it renders a full inline player / full-width row for
// those), so they get compact custom tiles here instead, matching the same
// pattern card-list-row.native.tsx already uses for its own audio thumbnail.
function AttachmentTile({ item, size, onPress, onLongPress, selectingBackground = false }: { item: AttachmentSummary; size: number; onPress: () => void; onLongPress: () => void; selectingBackground?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { handBold } = useHandwriting();
  const key = `${item.source}-${item.id}`;
  let paper = PAPER_WHITE;
  let content: React.ReactNode;
  let accessibilityLabel: string;
  if (item.type === 'photo' || item.type === 'video') {
    // A polaroid: the picture printed square-cornered with a white border, a deeper one at the bottom.
    content = <View pointerEvents="none" style={[styles.print, { height: size - POLAROID_SIDE - POLAROID_BOTTOM }]}><AttachmentContent attachment={toAttachmentLike(item)} variant="paper" /></View>;
    accessibilityLabel = item.type === 'photo' ? tr("id.photo") : tr('addcardattachmentsheet.video') + (item.duration ? ', ' + formatDurationSeconds(item.duration) : '');
  } else if (item.type === 'audio') {
    paper = PAPER_YELLOW;
    content = (
      <View style={styles.tileFill}>
        <Icon name="mic" size={24} color={PAPER_INK} />
        {item.duration ? <AppText style={[handBold, styles.tileDuration]}>{formatDurationSeconds(item.duration)}</AppText> : null}
      </View>
    );
    accessibilityLabel = tr('messagerow.audioNote') + (item.duration ? ', ' + formatDurationSeconds(item.duration) : '');
  } else {
    const size2 = formatFileSize(item.size);
    content = (
      <View style={[styles.tileFill, styles.filePadding]}>
        <Icon name={fileTileIcon(item)} size={22} color={PAPER_INK} />
        <AppText weight="600" numberOfLines={2} style={styles.tileFileName}>{item.originalName ?? tr("attachments.document")}</AppText>
        <AppText weight="600" numberOfLines={1} style={styles.tileMeta}>{[fileExtension(item), size2].filter(Boolean).join(' · ')}</AppText>
      </View>
    );
    accessibilityLabel = `${isPdfAttachment(item) ? 'PDF' : tr("addcardattachmentsheet.file")}, ${item.originalName ?? 'document'}`;
  }
  return (
    <PaperCard
      paper={paper}
      tilt={stableTilt(`attachment:${key}`, 1.6)}
      tape={item.type !== 'photo' && item.type !== 'video' ? false : stableTilt(`attachment:${key}:tape`, 1) > 0.35}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={selectingBackground ? tr("attachments.opensChatBackgroundPreview") : tr("attachments.opensDetailsHoldForMoreActions")}
      accessibilityActions={selectingBackground ? [] : [{ name: 'longpress', label: tr("attachments.moreActions") }]}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onLongPress(); }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width: size, height: size }}
    >
      {content}
    </PaperCard>
  );
}

function AttachmentDetailModal({ item, onClose, onViewCard }: { item: AttachmentSummary; onClose: () => void; onViewCard: (cardId: string) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme, styleTokens } = useTheme();
  const download = useAttachmentExport();
  const [shareFailed, setShareFailed] = useState(false);
  useEffect(() => { if (!shareFailed) return; const timer = setTimeout(() => setShareFailed(false), 2400); return () => clearTimeout(timer); }, [shareFailed]);
  const attachment = toAttachmentLike(item);
  const contextLine = item.boardName ? `${item.boardName} • ${item.columnName}` : tr("index.unorganized");
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} navigationBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[styles.detailScreen, { backgroundColor: theme.background }]}>
          <AppHeader
            title={item.cardTitle ?? (item.type === 'photo' ? tr("id.photo") : item.type === 'video' ? tr("addcardattachmentsheet.video") : item.type === 'audio' ? tr("messagerow.audioNote") : tr("addcardattachmentsheet.file"))}
            leading={<IconButton label={tr("attachments.close")} onPress={onClose}><HeaderIcon name="close" size={24} /></IconButton>}
            trailing={<IconButton label={exportActionLabel(attachment)} disabled={download.busy} onPress={() => void download.exportAttachment(attachment)}><HeaderIcon name="download-outline" size={22} /></IconButton>}
          />
          <ScrollView contentContainerStyle={styles.detailContent}>
            <AppText weight="600" style={[styles.detailContext, { color: theme.textMuted }]}>{contextLine}</AppText>
            <View style={[styles.detailMediaWrap, { borderRadius: styleTokens.radius.panel }]}>
              <AttachmentContent attachment={attachment} variant="detail" />
            </View>
            <Text numberOfLines={2} style={[styles.detailFileName, { color: theme.textSecondary }]}>{exportFileName(attachment)}{item.size ? ` · ${formatFileSize(item.size)}` : ''}</Text>
            <SecondaryButton label={tr("attachments.share")} onPress={() => void shareAttachment(attachment).then((shared) => setShareFailed(!shared))} />
            {item.cardId ? <PrimaryButton label={tr("attachments.viewCard")} onPress={() => onViewCard(item.cardId!)} /> : null}
          </ScrollView>
          <Toast message={shareFailed ? tr("attachments.thisFileCouldNotBeShared") : download.status} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function emptyStateFor(filter: TypeFilter, hasSearch: boolean, mascot: boolean) {
  if (hasSearch) return { title: tr("attachments.noAttachmentsFound"), description: tr("attachments.tryADifferentSearchTerm") };
  if (filter === 'all' && mascot) return { title: tr("attachments.nothingClippedYet"), description: tr("attachments.photosVideosAudioAndFilesYouAddTo") };
  if (filter === 'all') return { title: tr("attachments.noAttachmentsYet"), description: tr("attachments.photosVideosAudioAndFilesYouAttachTo") };
  const label = filter === 'photo' ? 'photos' : filter === 'video' ? 'videos' : filter === 'audio' ? 'audio' : 'files';
  return { title: tr("attachments.noValueYet", { value1: label }), description: tr("attachments.valueValueYouAttachToYourNotesWill", { value1: label[0].toUpperCase(), value2: label.slice(1) }) };
}

export default function AttachmentsScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const router = useRouter();
  const { chooseBackground } = useLocalSearchParams<{ chooseBackground?: string }>();
  const choosingBackground = chooseBackground === '1';
  const { isCurrentBackground } = useChatBackground();
  const deletion = useAttachmentDeletion();
  const { openDrawer } = useAppDrawer();
  const { styleTokens } = useTheme();
  const desk = useDesk();
  const handwriting = useHandwriting();
  const { width: screenWidth } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const repository = useMemo(() => createAttachmentRepository(database), [database]);

  const [filter, setFilter] = useState<TypeFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState<AttachmentSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailItem, setDetailItem] = useState<AttachmentSummary | null>(null);
  const { actionSheet } = useAppDialog();
  const download = useAttachmentExport();
  const [shareFailed, setShareFailed] = useState(false);
  useEffect(() => { if (!shareFailed) return; const timer = setTimeout(() => setShareFailed(false), 2400); return () => clearTimeout(timer); }, [shareFailed]);
  // The loader also covers the moment the handwriting takes, so nothing reflows.
  const showLoader = useChitsLoading(!ready || !handwriting.ready);
  const requestToken = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryOptions = useMemo(() => ({ type: choosingBackground ? 'photo' as const : filter === 'all' ? undefined : filter, searchTerm: searchTerm || undefined }), [choosingBackground, filter, searchTerm]);

  // Filter/search changes always restart pagination from the first page — a
  // pending "load more" for a since-abandoned filter/search combination must
  // never land, or results duplicate/jump (see spec: reset pagination on
  // filter/search change, never carry over a previous page).
  const load = useCallback(async () => {
    const token = ++requestToken.current;
    setReady(false);
    const [page, count] = await Promise.all([
      repository.list({ ...queryOptions, limit: PAGE_SIZE, offset: 0 }),
      repository.count(queryOptions),
    ]);
    if (requestToken.current !== token) return;
    setItems(page.items);
    setHasMore(page.hasMore);
    setTotalCount(count);
    setReady(true);
  }, [repository, queryOptions]);

  useFocusEffect(useCallback(() => { void load(); return subscribeToAttachmentChanges(() => void load()); }, [load]));

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const token = requestToken.current;
    try {
      const page = await repository.list({ ...queryOptions, limit: PAGE_SIZE, offset: items.length });
      if (requestToken.current !== token) return;
      setItems((current) => {
        const seen = new Set(current.map((entry) => `${entry.source}-${entry.id}`));
        const additions = page.items.filter((entry) => !seen.has(`${entry.source}-${entry.id}`));
        return [...current, ...additions];
      });
      setHasMore(page.hasMore);
    } finally {
      if (requestToken.current === token) setLoadingMore(false);
    }
  }, [repository, queryOptions, items.length, loadingMore, hasMore]);

  const tileSize = Math.floor((screenWidth - spacing.md * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const viewCard = (cardId: string) => {
    setDetailItem(null);
    router.push({ pathname: '/card/[id]', params: { id: cardId } });
  };

  // Long-press menu for a tile. Only actions that apply to this attachment
  // appear ("View card" needs a card); Download/Save to Files and Share are
  // kept separate — Share never stands in for saving a copy.
  const openItemMenu = (item: AttachmentSummary) => {
    const attachment = toAttachmentLike(item);
    actionSheet({
      title: exportFileName(attachment),
      message: isCurrentBackground(attachment) ? tr("photoattachmentviewer.currentChatBackground") : undefined,
      options: [
        ...(item.type === 'photo' ? [{ label: tr("attachments.setAsChatBackground"), icon: 'image-outline' as const, onPress: () => selectPhoto(item) }] : []),
        { label: tr("attachments.open"), icon: 'open-outline', onPress: () => setDetailItem(item) },
        { label: tr("attachments.share"), icon: 'share-outline', onPress: () => void shareAttachment(attachment).then((shared) => setShareFailed(!shared)) },
        { label: exportActionLabel(attachment), icon: 'download-outline', disabled: download.busy, onPress: () => void download.exportAttachment(attachment) },
        { label: tr("attachments.deleteAttachment"), icon: 'trash-outline', destructive: true, onPress: () => deletion.confirmDelete(attachment, () => setDetailItem(null)) },
        ...(item.cardId ? [{ label: tr("attachments.viewCard"), icon: 'albums-outline' as const, onPress: () => viewCard(item.cardId!) }] : []),
      ],
    });
  };

  const returnToAppearance = (chatAppearanceSelection: string) => {
    router.setParams({ chooseBackground: undefined });
    router.dismissTo({ pathname: '/settings', params: { chatAppearanceSelection } });
  };
  const selectPhoto = (item: AttachmentSummary) => returnToAppearance(JSON.stringify({ ...attachmentBackgroundImage(item), dim: DEFAULT_BACKGROUND_DIM, blur: false }));
  const empty = emptyStateFor(choosingBackground ? 'photo' : filter, Boolean(searchTerm), styleTokens.mascotEmptyStates);
  // Sticky's empty Attachments points to where attachments come from.
  const emptyAction = styleTokens.mascotEmptyStates && !choosingBackground && filter === 'all' && !searchTerm
    ? { label: tr("attachments.attachSomethingInChat"), onPress: () => router.navigate({ pathname: '/chat', params: { focusInput: '1' } }) }
    : undefined;

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
      <AppHeader
        title={choosingBackground ? tr("attachments.chooseABackground") : tr("attachments.attachments")}
        subtitle={ready ? pluralize(totalCount, 'item') : undefined}
        leading={<IconButton label={choosingBackground ? tr("attachments.cancelBackgroundSelection") : tr("archive.openNavigation")} onPress={() => { if (choosingBackground) returnToAppearance('current'); else openDrawer(); }}>{choosingBackground ? <HeaderIcon name="close" size={24} /> : <MenuIcon />}</IconButton>}
      />
      <PaperDesk>
      <FlatList
        data={handwriting.ready ? items : []}
        key={`grid-${GRID_COLUMNS}`}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.gridContent, { paddingBottom: tabBarHeight + spacing.md }]}
        renderItem={({ item }) => <AttachmentTile item={item} size={tileSize} selectingBackground={choosingBackground} onPress={() => choosingBackground ? selectPhoto(item) : setDetailItem(item)} onLongPress={() => { if (!choosingBackground) openItemMenu(item); }} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SearchField accessibilityLabel={tr("attachments.searchAttachments")} value={searchInput} onChangeText={setSearchInput} placeholder={tr("attachments.searchAttachments")} />
            {choosingBackground ? <AppText weight="700" style={[styles.sectionLabel, { color: desk.inkMuted }]}>{tr("attachments.photosChooseAPhotoToPreview")}</AppText> : <TypeFilterChips filter={filter} onChange={setFilter} />}
            {items.length && handwriting.ready ? <DeskHeading title={tr("attachments.recent")} style={styles.recent} /> : null}
          </View>
        }
        ListEmptyComponent={
          !ready || !handwriting.ready
            ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null)
            : <EmptyState pose={searchTerm ? 'search' : 'paperclip'} title={empty.title} description={empty.description} action={emptyAction} />
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footer}>
              {loadingMore ? <ChitsLoader size="small" /> : (
                <PaperTab tilt={-1.2} icon="chevron-down" label={tr("attachments.loadMore")} accessibilityRole="button" accessibilityLabel={tr("attachments.loadMoreAttachments")} onPress={() => void loadMore()} />
              )}
            </View>
          ) : null
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (hasMore && !loadingMore) void loadMore(); }}
        removeClippedSubviews
        maxToRenderPerBatch={18}
        windowSize={7}
      />
      </PaperDesk>
      <Toast message={deletion.status ?? (shareFailed ? tr("attachments.thisFileCouldNotBeShared") : download.status)} />
      {detailItem?.type === "photo" ? <PhotoAttachmentViewer attachment={toAttachmentLike(detailItem)} onDismiss={() => setDetailItem(null)} /> : detailItem ? <AttachmentDetailModal item={detailItem} onClose={() => setDetailItem(null)} onViewCard={viewCard} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The grid content already supplies the field's horizontal inset.
  listHeader: { paddingBottom: spacing.xs },
  // Bleeds to the screen edges so chips scroll edge to edge (like the Cards tab), while resting at the same inset.
  chipScroll: { marginTop: 8, marginBottom: 2, marginHorizontal: -spacing.md },
  sectionLabel: { fontSize: 11, letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  gridContent: { paddingHorizontal: spacing.md, flexGrow: 1 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  recent: { marginTop: spacing.sm, marginBottom: 4 },
  print: { marginTop: POLAROID_SIDE, marginHorizontal: POLAROID_SIDE, borderRadius: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(43,38,32,0.16)', overflow: 'hidden' },
  tileFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  filePadding: { paddingHorizontal: 6 },
  tileDuration: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
  tileFileName: { color: PAPER_INK, fontSize: 11, textAlign: 'center' },
  tileMeta: { color: PAPER_INK_MUTED, fontSize: 10 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  footer: { paddingVertical: spacing.md, alignItems: 'center' },
  detailScreen: { flex: 1 },
  detailContent: { padding: spacing.md, gap: spacing.md },
  detailContext: { fontSize: 13 },
  detailMediaWrap: { overflow: 'hidden' },
  detailFileName: { fontSize: 13, lineHeight: 18 },
});
