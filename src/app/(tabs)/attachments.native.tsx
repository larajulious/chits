import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AttachmentContent } from '@/components/chat/message-row';
import { AppHeader, EmptyState, IconButton, PrimaryButton, Screen } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
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
  return { id: item.id, type: item.type, localUri: item.localUri, originalName: item.originalName, mimeType: item.mimeType, size: item.size, duration: item.duration, width: item.width, height: item.height, createdAt: item.createdAt };
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
  return item.originalName?.split('.').pop()?.toUpperCase() ?? null;
}

function fileTileIcon(item: AttachmentSummary): React.ComponentProps<typeof Ionicons>['name'] {
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
            style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.surfaceElevated, borderColor: selected ? theme.accent : theme.borderSubtle }]}
          >
            <Text style={[styles.chipLabel, { color: selected ? theme.accentText : theme.textSecondary }]}>{chip.label}</Text>
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
function AttachmentTile({ item, size, onPress }: { item: AttachmentSummary; size: number; onPress: () => void }) {
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
    accessibilityLabel = `File, ${item.originalName ?? 'document'}`;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, tileStyle, { backgroundColor: theme.surfaceElevated }, pressed && styles.tilePressed]}
    >
      {content}
    </Pressable>
  );
}

function AttachmentDetailModal({ item, onClose, onViewCard }: { item: AttachmentSummary; onClose: () => void; onViewCard: (cardId: string) => void }) {
  const { tokens: theme } = useTheme();
  const contextLine = item.boardName ? `${item.boardName} • ${item.columnName}` : 'Unorganized';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.detailScreen, { backgroundColor: theme.background }]}>
        <AppHeader
          title={item.cardTitle ?? (item.type === 'photo' ? 'Photo' : item.type === 'video' ? 'Video' : item.type === 'audio' ? 'Audio note' : 'File')}
          leading={<IconButton label="Close" onPress={onClose}><Ionicons accessible={false} name="close" size={24} color={theme.textPrimary} /></IconButton>}
        />
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={[styles.detailContext, { color: theme.textMuted }]}>{contextLine}</Text>
          <View style={styles.detailMediaWrap}>
            <AttachmentContent attachment={toAttachmentLike(item)} variant="detail" />
          </View>
          {item.cardId ? <PrimaryButton label="View card" onPress={() => onViewCard(item.cardId!)} /> : null}
        </ScrollView>
      </SafeAreaView>
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
  const showLoader = useChitsLoading(!ready);
  const requestToken = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryOptions = useMemo(() => ({ type: filter === 'all' ? undefined : filter, searchTerm: searchTerm || undefined }), [filter, searchTerm]);

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

  useFocusEffect(useCallback(() => { void load(); }, [load]));

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

  const empty = emptyStateFor(filter, Boolean(searchTerm));

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="Attachments"
        subtitle={ready ? pluralize(totalCount, 'item') : undefined}
        leading={<IconButton label="Open navigation" onPress={openDrawer}><Ionicons accessible={false} name="reorder-two-outline" size={24} color={theme.textPrimary} /></IconButton>}
      />
      <FlatList
        data={items}
        key={`grid-${GRID_COLUMNS}`}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.gridContent, { paddingBottom: tabBarHeight + spacing.md }]}
        renderItem={({ item }) => <AttachmentTile item={item} size={tileSize} onPress={() => setDetailItem(item)} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={[styles.searchField, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }]}>
              <Ionicons accessible={false} name="search-outline" size={16} color={theme.textMuted} />
              <TextInput
                accessibilityLabel="Search attachments"
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder="Search attachments"
                placeholderTextColor={theme.textMuted}
                selectionColor={theme.accent}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.textPrimary }]}
              />
              {searchInput ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearchInput('')}>
                  <Ionicons accessible={false} name="close-circle" size={16} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <TypeFilterChips filter={filter} onChange={setFilter} />
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
      {detailItem ? <AttachmentDetailModal item={detailItem} onClose={() => setDetailItem(null)} onViewCard={viewCard} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listHeader: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  searchField: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  chipScroll: { height: 30, flexGrow: 0, flexShrink: 0, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
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
});
