import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { AppHeader, EmptyState, IconButton, PrimaryButton, Screen, SecondaryButton, Toast, HeaderIcon, MenuIcon } from '@/components/ui/primitives';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useAttachmentExport } from '@/components/attachments/use-attachment-export';
import { exportActionLabel, shareAttachment } from '@/services/attachment-export';
import { exportFileName } from '@/services/attachment-export-naming';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { SearchField } from '@/components/ui/search-field';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';
import { createAttachmentRepository } from '@/db/repositories';
import type { AttachmentFilterType, AttachmentLike, AttachmentSummary } from '@/db/types';

const PAGE_SIZE = 24;
const GRID_COLUMNS = 3;
const GRID_GAP = spacing.xs;
const SEARCH_DEBOUNCE_MS = 300;

type TypeFilter = 'all' | AttachmentFilterType;
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'photo', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Audio' },
  { key: 'file', label: 'Files' },
];

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

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

function fileTileIcon(item: AttachmentSummary): React.ComponentProps<typeof Ionicons>['name'] {
  if (isPdfAttachment(item)) return 'document-text-outline';
  const value = `${item.mimeType ?? ''} ${item.originalName ?? ''}`.toLowerCase();
  if (value.includes('zip') || value.includes('archive') || value.includes('.rar')) return 'archive-outline';
  if (value.includes('sheet') || value.includes('excel') || value.includes('.csv') || value.includes('.xls')) return 'grid-outline';
  if (value.includes('pdf')) return 'document-text-outline';
  return 'document-outline';
}

function TypeFilterChips({ filter, onChange }: { filter: TypeFilter; onChange: (next: TypeFilter) => void }) {
  const { tokens: theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {TYPE_FILTERS.map((chip) => {
        const selected = chip.key === filter;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Filter by ${chip.label}`}
            onPress={() => onChange(chip.key)}
            style={[styles.chip, { backgroundColor: selected ? theme.accentSoft : 'transparent', borderColor: selected ? theme.accentBorder : 'transparent' }]}
          >
            <Text style={[styles.chipLabel, { color: selected ? theme.accentStrong : theme.textSecondary }]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
  const { tokens: theme } = useTheme();
  const tileStyle = { width: size, height: size };
  let content: React.ReactNode;
  let accessibilityLabel: string;
  if (item.type === 'photo' || item.type === 'video') {
    content = <View pointerEvents="none" style={StyleSheet.absoluteFill}><AttachmentContent attachment={toAttachmentLike(item)} variant="grid" /></View>;
    accessibilityLabel = item.type === 'photo' ? 'Photo' : `Video${item.duration ? `, ${formatDurationSeconds(item.duration)}` : ''}`;
  } else if (item.type === 'audio') {
    content = (
      <View style={[styles.tileFill, { backgroundColor: theme.accentSoft }]}>
        <Ionicons accessible={false} name="mic" size={22} color={theme.accentStrong} />
        {item.duration ? <Text style={[styles.tileMeta, { color: theme.accentStrong }]}>{formatDurationSeconds(item.duration)}</Text> : null}
      </View>
    );
    accessibilityLabel = `Audio note${item.duration ? `, ${formatDurationSeconds(item.duration)}` : ''}`;
  } else {
    const size2 = formatFileSize(item.size);
    content = (
      <View style={[styles.tileFill, styles.filePadding, { backgroundColor: theme.surfaceElevated }]}>
        <Ionicons accessible={false} name={fileTileIcon(item)} size={22} color={theme.textSecondary} />
        <Text numberOfLines={2} style={[styles.tileFileName, { color: theme.textPrimary }]}>{item.originalName ?? 'Document'}</Text>
        <Text numberOfLines={1} style={[styles.tileMeta, { color: theme.textMuted }]}>{[fileExtension(item), size2].filter(Boolean).join(' · ')}</Text>
      </View>
    );
    accessibilityLabel = `${isPdfAttachment(item) ? 'PDF' : 'File'}, ${item.originalName ?? 'document'}`;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={selectingBackground ? 'Opens Chat Background Preview.' : 'Opens details. Hold for more actions.'}
      accessibilityActions={selectingBackground ? [] : [{ name: 'longpress', label: 'More actions' }]}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onLongPress(); }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.tile, tileStyle, { backgroundColor: theme.surfaceElevated }, pressed && styles.tilePressed]}
    >
      {content}
    </Pressable>
  );
}

function AttachmentDetailModal({ item, onClose, onViewCard }: { item: AttachmentSummary; onClose: () => void; onViewCard: (cardId: string) => void }) {
  const { tokens: theme } = useTheme();
  const download = useAttachmentExport();
  const [shareFailed, setShareFailed] = useState(false);
  useEffect(() => { if (!shareFailed) return; const timer = setTimeout(() => setShareFailed(false), 2400); return () => clearTimeout(timer); }, [shareFailed]);
  const attachment = toAttachmentLike(item);
  const contextLine = item.boardName ? `${item.boardName} • ${item.columnName}` : 'Unorganized';
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} navigationBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[styles.detailScreen, { backgroundColor: theme.background }]}>
          <AppHeader
            title={item.cardTitle ?? (item.type === 'photo' ? 'Photo' : item.type === 'video' ? 'Video' : item.type === 'audio' ? 'Audio note' : 'File')}
            leading={<IconButton label="Close" onPress={onClose}><HeaderIcon name="close" size={24} /></IconButton>}
            trailing={<IconButton label={exportActionLabel(attachment)} disabled={download.busy} onPress={() => void download.exportAttachment(attachment)}><HeaderIcon name="download-outline" size={22} /></IconButton>}
          />
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Text style={[styles.detailContext, { color: theme.textMuted }]}>{contextLine}</Text>
            <View style={styles.detailMediaWrap}>
              <AttachmentContent attachment={attachment} variant="detail" />
            </View>
            <Text numberOfLines={2} style={[styles.detailFileName, { color: theme.textSecondary }]}>{exportFileName(attachment)}{item.size ? ` · ${formatFileSize(item.size)}` : ''}</Text>
            <SecondaryButton label="Share" onPress={() => void shareAttachment(attachment).then((shared) => setShareFailed(!shared))} />
            {item.cardId ? <PrimaryButton label="View card" onPress={() => onViewCard(item.cardId!)} /> : null}
          </ScrollView>
          <Toast message={shareFailed ? 'This file could not be shared.' : download.status} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function emptyStateFor(filter: TypeFilter, hasSearch: boolean) {
  if (hasSearch) return { title: 'No attachments found', description: 'Try a different search term.' };
  if (filter === 'all') return { title: 'No attachments yet', description: 'Photos, videos, audio and files you attach to your notes will appear here.' };
  const label = filter === 'photo' ? 'photos' : filter === 'video' ? 'videos' : filter === 'audio' ? 'audio' : 'files';
  return { title: `No ${label} yet`, description: `${label[0].toUpperCase()}${label.slice(1)} you attach to your notes will appear here.` };
}

export default function AttachmentsScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { chooseBackground } = useLocalSearchParams<{ chooseBackground?: string }>();
  const choosingBackground = chooseBackground === '1';
  const { isCurrentBackground } = useChatBackground();
  const deletion = useAttachmentDeletion();
  const { openDrawer } = useAppDrawer();
  const { tokens: theme } = useTheme();
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
  const showLoader = useChitsLoading(!ready);
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
      message: isCurrentBackground(attachment) ? 'Current Chat Background' : undefined,
      options: [
        ...(item.type === 'photo' ? [{ label: 'Set as Chat Background', icon: 'image-outline' as const, onPress: () => selectPhoto(item) }] : []),
        { label: 'Open', icon: 'open-outline', onPress: () => setDetailItem(item) },
        { label: 'Share', icon: 'share-outline', onPress: () => void shareAttachment(attachment).then((shared) => setShareFailed(!shared)) },
        { label: exportActionLabel(attachment), icon: 'download-outline', disabled: download.busy, onPress: () => void download.exportAttachment(attachment) },
        { label: 'Delete Attachment', icon: 'trash-outline', destructive: true, onPress: () => deletion.confirmDelete(attachment, () => setDetailItem(null)) },
        ...(item.cardId ? [{ label: 'View card', icon: 'albums-outline' as const, onPress: () => viewCard(item.cardId!) }] : []),
      ],
    });
  };

  const returnToAppearance = (chatAppearanceSelection: string) => {
    router.setParams({ chooseBackground: undefined });
    router.dismissTo({ pathname: '/settings', params: { chatAppearanceSelection } });
  };
  const selectPhoto = (item: AttachmentSummary) => returnToAppearance(JSON.stringify({ ...attachmentBackgroundImage(item), dim: DEFAULT_BACKGROUND_DIM, blur: false }));
  const empty = emptyStateFor(choosingBackground ? 'photo' : filter, Boolean(searchTerm));

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={choosingBackground ? 'Choose a Background' : 'Attachments'}
        subtitle={ready ? pluralize(totalCount, 'item') : undefined}
        leading={<IconButton label={choosingBackground ? 'Cancel background selection' : 'Open navigation'} onPress={() => { if (choosingBackground) returnToAppearance('current'); else openDrawer(); }}>{choosingBackground ? <HeaderIcon name="close" size={24} /> : <MenuIcon />}</IconButton>}
      />
      <FlatList
        data={items}
        key={`grid-${GRID_COLUMNS}`}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.gridContent, { paddingBottom: tabBarHeight + spacing.md }]}
        renderItem={({ item }) => <AttachmentTile item={item} size={tileSize} selectingBackground={choosingBackground} onPress={() => choosingBackground ? selectPhoto(item) : setDetailItem(item)} onLongPress={() => { if (!choosingBackground) openItemMenu(item); }} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SearchField accessibilityLabel="Search attachments" value={searchInput} onChangeText={setSearchInput} placeholder="Search attachments" />
            {choosingBackground ? <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Photos · Choose a photo to preview</Text> : <TypeFilterChips filter={filter} onChange={setFilter} />}
            {items.length ? <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Recent</Text> : null}
          </View>
        }
        ListEmptyComponent={
          !ready
            ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null)
            : <EmptyState title={empty.title} description={empty.description} />
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footer}>
              {loadingMore ? <ChitsLoader size="small" /> : (
                <Pressable accessibilityRole="button" accessibilityLabel="Load more attachments" onPress={() => void loadMore()} style={styles.loadMoreButton}>
                  <Text style={[styles.loadMoreText, { color: theme.accent }]}>Load more</Text>
                </Pressable>
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
      <Toast message={deletion.status ?? (shareFailed ? 'This file could not be shared.' : download.status)} />
      {detailItem?.type === 'photo' ? <PhotoAttachmentViewer attachment={toAttachmentLike(detailItem)} onDismiss={() => setDetailItem(null)} /> : detailItem ? <AttachmentDetailModal item={detailItem} onClose={() => setDetailItem(null)} onViewCard={viewCard} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The grid content already supplies the field's horizontal inset.
  listHeader: { paddingBottom: spacing.xs },
  // Bleeds to the screen edges so chips scroll edge to edge (like the Cards tab), while resting at the same inset.
  chipScroll: { height: 30, flexGrow: 0, flexShrink: 0, marginTop: 8, marginBottom: 2, marginHorizontal: -spacing.md },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 12, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  gridContent: { paddingHorizontal: spacing.md, flexGrow: 1 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  tile: { borderRadius: radii.compactCard, overflow: 'hidden' },
  tilePressed: { opacity: 0.7 },
  tileFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  filePadding: { paddingHorizontal: 6 },
  tileFileName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  tileMeta: { fontSize: 10, fontWeight: '600' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  footer: { paddingVertical: spacing.md, alignItems: 'center' },
  loadMoreButton: { minHeight: 40, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  loadMoreText: { fontSize: 14, fontWeight: '700' },
  detailScreen: { flex: 1 },
  detailContent: { padding: spacing.md, gap: spacing.md },
  detailContext: { fontSize: 13, fontWeight: '600' },
  detailMediaWrap: { borderRadius: radii.contentCard, overflow: 'hidden' },
  detailFileName: { fontSize: 13, lineHeight: 18 },
});
