import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { AppHeader, EmptyState, IconButton, Screen, Toast } from '@/components/ui/primitives';
import { AddNoteSheet, type NoteSubmission } from '@/components/boards/add-note-sheet';
import { groupByMonth } from '@/services/card-grouping';
import { detachConfirmationMessage } from '@/services/detach-card';
import { requestReminderSync, subscribeToReminderChanges } from '@/services/reminders';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';
import { CardListRow } from '@/components/boards/card-list-row.native';
import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
import { radii, spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Board, CardListItem, MessageType } from '@/db/types';
import { removeCardAttachmentFile } from '@/services/card-attachment-storage';

type BoardSummary = Board & { columnCount: number; cardCount: number };
type ViewMode = 'boards' | 'cards';

// Cards search bar auto-hide: always visible within this distance of the top,
// and toggles only after this much scrolling in one direction.
const SEARCH_ALWAYS_VISIBLE_OFFSET = 24;
const SEARCH_TOGGLE_TRAVEL = 28;
// Height of the soft fade at the bottom of the sticky month headers.
const SECTION_HEADER_FADE = 18;
// Notes render as a two-column grid, so each list row is a pair of notes
// (virtualized per row); `count` keeps the header honest about notes, not rows.
type CardSection = { key: string; title: string; month?: string; year?: string; pinned?: boolean; count: number; data: CardListItem[][] };

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}
type UnorganizedSummaryRow = { id: string; text: string | null; type: MessageType; createdAt: number; updatedAt: number; pinned: number; isHiddenContent: number; photoCount: number; videoCount: number; fileCount: number; firstAttachmentType: MessageType | null; firstAttachmentName: string | null; previewMediaType: 'photo' | 'video' | 'audio' | null; thumbnailPath: string | null; mediaDuration: number | null; mediaCount: number };

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function unorganizedDisplayTitle(row: UnorganizedSummaryRow): string {
  if (row.isHiddenContent === 1) return 'Hidden Chit';
  const text = row.text?.trim();
  if (text) return text.slice(0, 120);
  if (row.firstAttachmentType === 'file') return row.firstAttachmentName?.trim() || 'Attachment';
  if (row.firstAttachmentType === 'photo') return 'Photo';
  if (row.firstAttachmentType === 'video') return 'Video';
  if (row.firstAttachmentType === 'audio') return 'Audio note';
  return `${row.type[0].toUpperCase()}${row.type.slice(1)} attachment`;
}

// A Chat thought that hasn't been organized into any board/card yet — shown
// as its own row in the Cards view (see PHASE: UNORGANIZED THOUGHTS IN CARDS
// VIEW) alongside real cards, pinned or not, so nothing the user captured in
// Chat is invisible there just because it hasn't been filed into a board.
function unorganizedToCardListItem(row: UnorganizedSummaryRow): CardListItem {
  const title = unorganizedDisplayTitle(row);
  const hidden = row.isHiddenContent === 1;
  const trimmedText = hidden ? null : row.text?.trim();
  const preview = trimmedText && trimmedText !== title ? trimmedText : null;
  return {
    id: row.id, kind: 'thought', title, preview,
    boardId: null, boardName: null, boardAccent: null, columnId: null, columnName: null,
    createdAt: row.createdAt, updatedAt: row.updatedAt, pinned: row.pinned === 1, hidden, reminderAt: null,
    photoCount: row.photoCount, videoCount: row.videoCount, fileCount: row.fileCount,
    previewMediaType: hidden ? null : row.previewMediaType, thumbnailPath: hidden ? null : row.thumbnailPath, mediaDuration: hidden ? null : row.mediaDuration, mediaCount: hidden ? 0 : row.mediaCount,
  };
}

// 'all' shows everything, 'unorganized' shows only chat thoughts not yet filed
// into a board, and any other value is a board id (only boards that actually
// have cards get a chip — filtering to an empty board would be a dead end).
type CardFilter = 'all' | 'unorganized' | (string & {});

type CardFilterChip = { key: CardFilter; label: string; count: number; color?: string | null };

function CardFilterChips({ chips, filter, onChange }: { chips: CardFilterChip[]; filter: CardFilter; onChange: (next: CardFilter) => void }) {
  const { tokens: theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {chips.map((chip) => {
        const selected = chip.key === filter;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Filter by ${chip.label}, ${pluralize(chip.count, 'card')}`}
            onPress={() => onChange(chip.key)}
            style={[
              styles.chip,
              { backgroundColor: selected ? theme.accent : theme.surfaceElevated, borderColor: selected ? theme.accent : theme.borderSubtle },
            ]}
          >
            {chip.color ? <View style={[styles.chipDot, { backgroundColor: chip.color }, selected && styles.chipDotSelected]} /> : null}
            <Text numberOfLines={1} style={[styles.chipLabel, { color: selected ? theme.accentText : theme.textSecondary }]}>
              {chip.label} <Text style={[styles.chipCountInline, { color: selected ? theme.accentText : theme.textMuted, opacity: selected ? 0.85 : 0.75 }]}>{chip.count}</Text>
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ViewSwitch({ mode, onChange }: { mode: ViewMode; onChange: (next: ViewMode) => void }) {
  const { tokens: theme } = useTheme();
  return (
    <View style={[styles.switchTrack, { backgroundColor: theme.surfaceElevated }]}>
      {(['cards', 'boards'] as const).map((option) => {
        const selected = option === mode;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option === 'boards' ? 'Boards view' : 'Cards view'}
            onPress={() => onChange(option)}
            style={[styles.switchOption, selected && { backgroundColor: theme.surface }]}
          >
            {/* Filled when selected, outline otherwise. */}
            <Ionicons accessible={false} name={option === 'boards' ? (selected ? 'grid' : 'grid-outline') : (selected ? 'albums' : 'albums-outline')} size={15} color={selected ? theme.textPrimary : theme.textMuted} />
            <Text style={[styles.switchLabel, { color: selected ? theme.textPrimary : theme.textMuted }]}>
              {option === 'boards' ? 'Boards' : 'Cards'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function BoardsScreen() {
  const database = useSQLiteContext();
  const boardRepository = useMemo(() => createBoardRepository(database), [database]);
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { openDrawer } = useAppDrawer();
  const { actionSheet, confirm } = useAppDialog();
  const { tokens: theme } = useTheme();
  // The floating bottom nav is absolutely positioned over this screen (see
  // PHASE: REDESIGN CHITS BOTTOM NAVIGATION) rather than reserving its own flex
  // space, so this screen's own scroll content has to reserve the matching
  // clearance itself — the one place that number comes from.
  const tabBarHeight = useBottomTabBarHeight();
  const nameInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<FormSheetHandle>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [unorganizedCount, setUnorganizedCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<BoardIconName | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Same single source of truth Chat's own header edits (app_settings.chat_title) —
  // Boards is the app's home screen now, so its header must show that title too,
  // not a second hardcoded "Chits" string that would drift the moment it's renamed.
  const [appTitle, setAppTitle] = useState('Chits');
  const [ready, setReady] = useState(false);
  const showLoader = useChitsLoading(!ready);
  const isNameValid = Boolean(name.trim());

  // Boards | Cards. The screen always opens on Cards; switching is session-local.
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [cards, setCards] = useState<CardListItem[]>([]);
  // Chat thoughts not yet organized into any board/card — the Cards view
  // shows these alongside real cards (pinned ones in Pinned, the rest in All
  // Cards) so nothing captured in Chat is invisible just because it hasn't
  // been filed into a board yet.
  const [unorganizedThoughts, setUnorganizedThoughts] = useState<CardListItem[]>([]);
  const [cardSearch, setCardSearch] = useState('');
  // Which chip is active in the Cards view's horizontal filter row — 'all',
  // 'unorganized', or a specific board id. Not persisted like viewMode; it's a
  // lightweight, session-local refinement rather than a standing preference.
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [cardToast, setCardToast] = useState<string | null>(null);
  const cardSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!cardToast) return; const timer = setTimeout(() => setCardToast(null), 1800); return () => clearTimeout(timer); }, [cardToast]);

  // The Cards search bar tucks away while scrolling into the list (more room
  // for notes) and comes back on any scroll back up, like a browser's address
  // bar. It always shows at the top, and never hides while being used (focused
  // or holding a query). The collapse is one native LayoutAnimation per toggle,
  // not a per-frame resize of the list.
  const [searchHidden, setSearchHidden] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchHiddenRef = useRef(false);
  const searchInUseRef = useRef(false);
  useEffect(() => { searchInUseRef.current = searchFocused || Boolean(cardSearch); }, [searchFocused, cardSearch]);
  const scrollState = useRef({ lastY: 0, travel: 0, ignoreUntil: 0 });
  const setSearchVisibility = useCallback((hidden: boolean) => {
    if (hidden === searchHiddenRef.current || (hidden && searchInUseRef.current)) return;
    searchHiddenRef.current = hidden;
    // Collapsing/expanding resizes the list, which can nudge its offset near the
    // end; ignore scroll events briefly so that nudge can't toggle it back.
    scrollState.current.ignoreUntil = Date.now() + 260;
    scrollState.current.travel = 0;
    LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setSearchHidden(hidden);
  }, []);
  const handleCardScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const state = scrollState.current;
    const delta = y - state.lastY;
    state.lastY = y;
    if (y <= SEARCH_ALWAYS_VISIBLE_OFFSET) { setSearchVisibility(false); return; }
    if (Date.now() < state.ignoreUntil) return;
    // Require a little travel in one direction so tiny jitters don't toggle it.
    state.travel = Math.sign(delta) === Math.sign(state.travel) ? state.travel + delta : delta;
    if (state.travel > SEARCH_TOGGLE_TRAVEL) setSearchVisibility(true);
    else if (state.travel < -SEARCH_TOGGLE_TRAVEL) setSearchVisibility(false);
  }, [setSearchVisibility]);

  const load = useCallback(async () => {
    const [nextBoards, nextCount, titleRow] = await Promise.all([
      boardRepository.listActive(),
      messageRepository.countUnorganized(),
      database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
    ]);
    setBoards(nextBoards);
    setUnorganizedCount(nextCount);
    setAppTitle(titleRow?.value.trim() || 'Chits');
    setReady(true);
  }, [boardRepository, database, messageRepository]);

  const loadCards = useCallback(async (searchTerm = '') => {
    const [cardRows, thoughtRows] = await Promise.all([
      boardRepository.listAllCardSummaries({ searchTerm }),
      messageRepository.listUnorganizedSummaries({ searchTerm }),
    ]);
    // A card whose thought is hidden in Chat is covered here too, the same as on its board.
    setCards(cardRows.map(({ isHidden, ...row }) => isHidden === 1
      ? { ...row, kind: 'card' as const, title: 'Hidden Chit', preview: null, pinned: row.pinned === 1, hidden: true, previewMediaType: null, thumbnailPath: null, mediaDuration: null, mediaCount: 0 }
      : { ...row, kind: 'card' as const, pinned: row.pinned === 1, hidden: false, mediaCount: row.mediaCount ?? 0 }));
    setUnorganizedThoughts(thoughtRows.map(unorganizedToCardListItem));
  }, [boardRepository, messageRepository]);
  // Card deletes/archives/hides go through loadCards afterwards, so reconciling
  // here cancels notifications for removed cards and refreshes hidden text;
  // reminder changes made elsewhere (set, removed, fired) reload the list.
  useEffect(() => subscribeToReminderChanges(() => void loadCards(cardSearch)), [cardSearch, loadCards]);

  useFocusEffect(useCallback(() => {
    void load();
    void loadCards(cardSearch);
    // Reload runs on every focus (e.g. returning from Card Details) regardless
    // of which tab is active, so a switch back to Cards never shows stale data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, loadCards]));

  const changeViewMode = (next: ViewMode) => {
    if (next !== viewMode) setViewMode(next);
  };

  // A note added from the Cards header isn't tied to a board yet, so it's
  // created like a Chat thought and shows up under Unorganized.
  const addNote = async ({ text, attachment }: NoteSubmission) => {
    if (attachment) await messageRepository.createAttachmentMessage(attachment, text || null);
    else await messageRepository.createText(text);
    await Promise.all([load(), loadCards(cardSearch)]);
    setCardToast('Note added');
  };

  const queueCardSearch = useCallback((value: string) => {
    if (cardSearchTimer.current) clearTimeout(cardSearchTimer.current);
    cardSearchTimer.current = setTimeout(() => { void loadCards(value); }, 220);
  }, [loadCards]);

  useEffect(() => () => { if (cardSearchTimer.current) clearTimeout(cardSearchTimer.current); }, []);

  // Chip counts reflect the currently search-filtered `cards`/`unorganizedThoughts`
  // lists (not each board's static, unfiltered cardCount) so they stay honest
  // about what a tap on that chip will actually show while a search is active.
  const cardFilterChips = useMemo<CardFilterChip[]>(() => {
    const perBoardCount = new Map<string, number>();
    for (const card of cards) if (card.boardId) perBoardCount.set(card.boardId, (perBoardCount.get(card.boardId) ?? 0) + 1);
    return [
      { key: 'all', label: 'All', count: cards.length + unorganizedThoughts.length },
      { key: 'unorganized', label: 'Unorganized', count: unorganizedThoughts.length },
      ...boards
        .filter((board) => board.cardCount > 0)
        .map((board) => ({ key: board.id, label: board.name, count: perBoardCount.get(board.id) ?? 0, color: board.accent })),
    ];
  }, [boards, cards, unorganizedThoughts]);

  // Cards and unorganized thoughts are two separately-sorted (both already
  // updated_at DESC from SQL) lists that get interleaved here — a plain
  // concat-then-sort, since even a few thousand combined rows is trivial to
  // re-sort client-side and this only runs when either source list (or the
  // active filter chip) changes.
  const cardSections = useMemo<CardSection[]>(() => {
    const all = cardFilter === 'unorganized' ? unorganizedThoughts
      : cardFilter === 'all' ? [...cards, ...unorganizedThoughts]
      : cards.filter((card) => card.boardId === cardFilter);
    const pinned = all.filter((item) => item.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    const rest = all.filter((item) => !item.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    // Pinned stays on top; everything else is grouped by month, newest first.
    const months = groupByMonth(rest);
    return [
      ...(pinned.length ? [{ key: 'pinned', title: 'Pinned', pinned: true, count: pinned.length, data: pairs(pinned) }] : []),
      ...(months.length
        ? months.map((month) => ({ key: month.key, title: month.title, month: month.month, year: month.year, count: month.items.length, data: pairs(month.items) }))
        : [{ key: 'all', title: 'All cards', count: 0, data: [] }]),
    ];
  }, [cards, unorganizedThoughts, cardFilter]);

  // "Move back to Unorganized" — always confirmed first. Fetches a lightweight
  // preview (this row doesn't have message/comment/attachment counts loaded the
  // way Card Details does) so the confirmation can spell out a merged card or
  // card-only data that will be removed. boardRepository.detachCard never
  // touches the source Chat message(s), so they return to Unorganized.
  const moveCardBackToUnorganized = useCallback(async (item: CardListItem) => {
    // The query is a bare `SELECT ... (no FROM)`, so SQLite always returns
    // exactly one row — this fallback only exists to satisfy the type checker.
    const preview = await boardRepository.getCardDetachPreview(item.id) ?? { messageCount: 0, commentCount: 0, attachmentCount: 0 };

    const run = async () => {
      const removableUris = await boardRepository.detachCard(item.id);
      void requestReminderSync();
      await Promise.all(removableUris.map((uri) => removeCardAttachmentFile(uri)));
      await loadCards(cardSearch);
      setCardToast('Moved back to Unorganized');
    };

    confirm({
      type: 'default',
      icon: 'arrow-undo-outline',
      title: 'Move this card back to Unorganized?',
      message: detachConfirmationMessage({ boardName: item.boardName, messageCount: preview.messageCount, commentCount: preview.commentCount, attachmentCount: preview.attachmentCount }),
      confirmText: 'Move',
      accentColor: item.boardAccent,
      onConfirm: run,
    });
  }, [boardRepository, cardSearch, confirm, loadCards]);

  const openCardActions = useCallback((item: CardListItem) => {
    if (item.kind === 'thought') {
      actionSheet({
        title: item.title,
        options: [
          { label: item.pinned ? 'Unpin' : 'Pin', icon: item.pinned ? 'pin' : 'pin-outline', onPress: () => void messageRepository.setPinned(item.id, !item.pinned).then(() => loadCards(cardSearch)) },
          {
            label: 'Archive thought', icon: 'archive-outline', onPress: () => confirm({
              type: 'default', icon: 'archive-outline', title: 'Archive thought?',
              message: 'You can restore it later from Archive.',
              confirmText: 'Archive thought',
              onConfirm: () => messageRepository.archive(item.id).then(() => { void requestReminderSync(); return loadCards(cardSearch); }),
            }),
          },
          {
            label: 'Delete thought', icon: 'trash-outline', destructive: true, onPress: () => confirm({
              type: 'destructive', icon: 'trash-outline', title: 'Delete thought?',
              message: 'This can’t be undone.',
              confirmText: 'Delete thought',
              onConfirm: () => messageRepository.softDelete(item.id).then(() => { void requestReminderSync(); return loadCards(cardSearch); }),
            }),
          },
        ],
      });
      return;
    }
    actionSheet({
      title: item.title,
      options: [
        { label: item.pinned ? 'Unpin' : 'Pin', icon: item.pinned ? 'pin' : 'pin-outline', onPress: () => void boardRepository.setPinned('card', item.id, !item.pinned).then(() => loadCards(cardSearch)) },
        { label: 'Move back to Unorganized', icon: 'arrow-undo-outline', onPress: () => void moveCardBackToUnorganized(item) },
        {
          label: 'Archive card', icon: 'archive-outline', onPress: () => confirm({
            type: 'default', icon: 'archive-outline', title: 'Archive card?',
            message: 'You can restore it later from Archive. Your original messages remain in Chat.',
            confirmText: 'Archive card', accentColor: item.boardAccent,
            onConfirm: () => boardRepository.archiveCard(item.id).then(() => { void requestReminderSync(); return loadCards(cardSearch); }),
          }),
        },
        {
          label: 'Delete card', icon: 'trash-outline', destructive: true, onPress: () => confirm({
            type: 'destructive', icon: 'trash-outline', title: 'Delete card?',
            message: 'Removing this card does not delete your original messages — they remain in Chat.',
            confirmText: 'Delete card',
            onConfirm: async () => {
              const removableUris = await boardRepository.deleteCard(item.id);
      void requestReminderSync();
              await Promise.all(removableUris.map((uri) => removeCardAttachmentFile(uri)));
              await loadCards(cardSearch);
            },
          }),
        },
      ],
    });
  }, [actionSheet, boardRepository, messageRepository, cardSearch, confirm, loadCards, moveCardBackToUnorganized]);

  const openCreate = () => {
    setName('');
    setIcon(null);
    setAccent(null);
    setError(null);
    setCreateOpen(true);
    // See PHASE: FIX BOTTOM SHEET KEYBOARD BEHAVIOR — a freshly opened sheet
    // must never inherit a scroll position left over from the last time it
    // was open.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
    setName('');
    setIcon(null);
    setAccent(null);
    setError(null);
  };

  const createBoard = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    setError(null);
    try {
      await boardRepository.create({ name: trimmedName, icon, accent });
      await load();
      setCreateOpen(false);
      setName('');
      setIcon(null);
      setAccent(null);
    } catch {
      setError('Couldn’t create board. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const totalCardCount = boards.reduce((sum, board) => sum + board.cardCount, 0) + unorganizedCount;

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
      <AppHeader
        title={appTitle}
        subtitle={viewMode === 'boards' ? pluralize(boards.length, 'board') : pluralize(cards.length + unorganizedThoughts.length, 'card')}
        leading={(
          <IconButton label="Open navigation" onPress={openDrawer}>
            <Ionicons accessible={false} name="reorder-two-outline" size={24} color={theme.textPrimary} />
          </IconButton>
        )}
        trailing={viewMode === 'boards' ? (
          <IconButton label="Create board" onPress={openCreate}>
            <Ionicons accessible={false} name="add" size={26} color={theme.textPrimary} />
          </IconButton>
        ) : (
          <IconButton label="Add note" onPress={() => setAddNoteOpen(true)}>
            <Ionicons accessible={false} name="add" size={26} color={theme.textPrimary} />
          </IconButton>
        )}
      />

      {!ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : (
      <View style={styles.flex}>
        <View style={styles.switchWrap}>
          <ViewSwitch mode={viewMode} onChange={changeViewMode} />
        </View>

        {viewMode === 'cards' ? (
          totalCardCount === 0 ? (
            <EmptyState title="No cards yet" description="Notes you organize into your boards will appear here." />
          ) : (
            <>
              <View
                pointerEvents={searchHidden ? 'none' : 'auto'}
                accessibilityElementsHidden={searchHidden}
                importantForAccessibility={searchHidden ? 'no-hide-descendants' : 'auto'}
                style={searchHidden ? styles.searchCollapsed : undefined}
              >
                <View style={[styles.searchBar, { borderColor: theme.borderSubtle, backgroundColor: theme.surface }]}>
                  <Ionicons accessible={false} name="search" size={16} color={theme.textMuted} />
                  <TextInput
                    value={cardSearch}
                    onChangeText={(value) => { setCardSearch(value); queueCardSearch(value); }}
                    onFocus={() => { setSearchFocused(true); setSearchVisibility(false); }}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Search cards"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.searchInput, { color: theme.textPrimary }]}
                  />
                </View>
              </View>
              <CardFilterChips chips={cardFilterChips} filter={cardFilter} onChange={setCardFilter} />
              {cardSections.every((section) => section.data.length === 0) ? (
                <EmptyState title="No matches" description="Try a different word or filter." />
              ) : (
                <SectionList
                  style={styles.cardList}
                  sections={cardSections}
                  keyExtractor={(row) => row.map((item) => item.id).join('|')}
                  renderItem={({ item: row }) => (
                    <View style={styles.noteRow}>
                      {row.map((item) => (
                        <CardListRow
                          key={item.id}
                          item={item}
                          onPress={() => router.push(item.kind === 'thought' ? `/chat?messageId=${item.id}` : `/card/${item.id}`)}
                          onMore={() => openCardActions(item)}
                        />
                      ))}
                      {row.length === 1 ? <View style={styles.noteSpacer} /> : null}
                    </View>
                  )}
                  // Month headers stick while scrolling so it's always clear which
                  // month you're looking at. The header is opaque and spans the
                  // full width (negative margin over the list's side padding) so
                  // notes pass cleanly underneath it.
                  renderSectionHeader={({ section }) => (
                    <View accessibilityRole="header" accessibilityLabel={`${section.title}, ${section.count} ${section.count === 1 ? 'note' : 'notes'}`} style={styles.sectionHeaderRow}>
                      {/* Solid behind the title, then a soft fade in the header's own
                          bottom padding: notes dissolve under a stuck header instead of
                          meeting a hard edge, and an unstuck header fades only empty space. */}
                      <View pointerEvents="none" style={[styles.sectionHeaderSolid, { backgroundColor: theme.background }]} />
                      <LinearGradient pointerEvents="none" colors={[theme.background, `${theme.background}00`]} style={styles.sectionHeaderFade} />
                      <View style={styles.sectionHeaderTitle}>
                        {section.pinned ? <Ionicons accessible={false} name="pin" size={17} color={theme.textPrimary} /> : null}
                        <Text numberOfLines={1} style={[styles.cardSectionMonth, { color: theme.textPrimary }]}>
                          {section.month ?? section.title}
                          {section.year ? <Text style={[styles.cardSectionYear, { color: theme.textMuted }]}>{`  ${section.year}`}</Text> : null}
                        </Text>
                      </View>
                      <View style={[styles.cardSectionCountPill, { backgroundColor: theme.surfaceElevated }]}>
                        <Text style={[styles.cardSectionCount, { color: theme.textSecondary }]}>{section.count} {section.count === 1 ? 'note' : 'notes'}</Text>
                      </View>
                    </View>
                  )}
                  renderSectionFooter={() => <View style={styles.sectionGap} />}
                  stickySectionHeadersEnabled
                  onScroll={handleCardScroll}
                  scrollEventThrottle={16}
                  contentContainerStyle={[styles.cardListContent, { paddingBottom: tabBarHeight + spacing.md }]}
                  initialNumToRender={12}
                  maxToRenderPerBatch={12}
                  windowSize={7}
                  // No removeClippedSubviews: combined with sticky section headers it
                  // blanks the list on Android (React Native bug). windowSize and
                  // maxToRenderPerBatch already bound how much is mounted.
                />
              )}
            </>
          )
        ) : (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.md }]}>
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          Keep related thoughts together and easy to find.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${pluralize(unorganizedCount, 'unorganized thought')}. Open Unorganized.`}
          onPress={() => router.push('/unorganized')}
          style={({ pressed }) => [
            styles.unorganized,
            { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.unorganizedMark, { backgroundColor: theme.surface }]}>
            <Ionicons accessible={false} name="file-tray-outline" size={20} color={theme.accentStrong} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.unorganizedTitle, { color: theme.textPrimary }]}>Unorganized</Text>
            <Text style={[styles.rowDetail, { color: theme.textSecondary }]}>
              {unorganizedCount === 0 ? 'All caught up' : `${pluralize(unorganizedCount, 'thought')} waiting`}
            </Text>
          </View>
          <Ionicons accessible={false} name="chevron-forward" size={20} color={theme.textMuted} />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textMuted }]}>YOUR BOARDS</Text>
          {boards.length > 0 ? (
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{boards.length}</Text>
          ) : null}
        </View>

        {boards.length > 0 ? (
          <View style={[styles.boardList, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
            {boards.map((board, index) => {
              const detail = `${pluralize(board.columnCount, 'column')} · ${pluralize(board.cardCount, 'card')}`;
              return (
                <Pressable
                  key={board.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${board.name}. ${detail}.`}
                  onPress={() => router.push(`/board/${board.id}`)}
                  style={({ pressed }) => [
                    styles.boardRow,
                    index < boards.length - 1 && { borderBottomColor: theme.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.boardMark, { backgroundColor: board.accent ?? theme.accentSoft }]}>
                    <Ionicons
                      accessible={false}
                      name={resolveBoardIcon(board.icon)}
                      size={19}
                      color={board.accent ? '#FFFFFF' : theme.accentStrong}
                    />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={[styles.boardName, { color: theme.textPrimary }]}>{board.name}</Text>
                    <Text style={[styles.rowDetail, { color: theme.textSecondary }]}>{detail}</Text>
                  </View>
                  <Ionicons accessible={false} name="chevron-forward" size={19} color={theme.textMuted} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No boards yet.</Text>
            <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>Organize your Chits when you’re ready.</Text>
            <Pressable accessibilityRole="button" onPress={openCreate} style={({ pressed }) => [styles.emptyCreateButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
              <Text style={[styles.emptyCreateText, { color: theme.accentText }]}>Create board</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
        )}
      </View>
      )}

      <FormSheet
        ref={scrollRef}
        visible={createOpen}
        onRequestClose={closeCreate}
        closeAccessibilityLabel="Close new board"
        accessibilityViewIsModal
        onModalShow={() => requestAnimationFrame(() => nameInputRef.current?.focus())}
        contentContainerStyle={styles.sheetContent}
      >
        <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
        <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.textPrimary }]}>New board</Text>
        <Text style={[styles.sheetIntro, { color: theme.textSecondary }]}>Give this collection a clear, memorable name.</Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Board name</Text>
        <TextInput
          ref={nameInputRef}
          accessibilityLabel="Board name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          onFocus={() => scrollRef.current?.requestVisible(nameInputRef)}
          placeholder="e.g. Tasks"
          placeholderTextColor={theme.textMuted}
          maxLength={80}
          style={[styles.nameInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]}
          returnKeyType="done"
          onSubmitEditing={() => void createBoard()}
        />

        <Text style={[styles.optionalLabel, { color: theme.textMuted }]}>OPTIONAL PERSONALIZATION</Text>
        <BoardAppearanceFields icon={icon} accent={accent} onIconChange={setIcon} onAccentChange={setAccent} />

        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={closeCreate} disabled={saving} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !isNameValid || saving }}
            onPress={() => void createBoard()}
            disabled={!isNameValid || saving}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: theme.accent },
              (!isNameValid || saving) && styles.disabled,
              pressed && isNameValid && styles.pressed,
            ]}
          >
            <Text style={[styles.primaryText, { color: theme.accentText }]}>{saving ? 'Creating…' : 'Create board'}</Text>
          </Pressable>
        </View>
      </FormSheet>
      <Toast message={cardToast} />
      <AddNoteSheet visible={addNoteOpen} onClose={() => setAddNoteOpen(false)} onSubmit={addNote} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, flexGrow: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Header → Tabs: 16 (see the vertical-rhythm table below every other gap
  // in this cluster follows too — Tabs → Search 16, Search → Filters 12,
  // Filters → first section 24).
  switchWrap: { paddingHorizontal: spacing.md, paddingTop: 16, paddingBottom: 0 },
  switchTrack: { flexDirection: 'row', height: 32, borderRadius: radii.control, padding: 3 },
  switchOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.control - 2 },
  switchLabel: { fontSize: 13, fontWeight: '600' },
  // Compact, quiet search control (44px, hairline border) — deliberately NOT
  // the visually dominant element on this screen; the cards are.
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, height: 44, marginHorizontal: spacing.md, marginTop: 16, paddingHorizontal: spacing.sm + spacing.xxs, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, height: '100%', fontSize: 15, padding: 0 },
  searchCollapsed: { height: 0, opacity: 0, overflow: 'hidden' },
  cardList: { flex: 1 },
  // Two equal columns; notes in a row stretch to the taller one so the grid stays tidy.
  noteRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12, marginBottom: 12 },
  noteSpacer: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  cardListContent: { paddingHorizontal: spacing.md, paddingTop: 0, flexGrow: 1 },
  // Section headers (Pinned, then one per month) are real, sticky headings:
  // a large bold month with a lighter year, and the note count as a pill.
  // Spacing between sections comes from `sectionGap` (the section footer),
  // not header padding, so a stuck header stays compact.
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginHorizontal: -spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: SECTION_HEADER_FADE },
  // Overlaps the fade by 1pt so pixel rounding can't leave a hairline seam between them.
  sectionHeaderSolid: { position: 'absolute', top: 0, right: 0, bottom: SECTION_HEADER_FADE - 1, left: 0 },
  sectionHeaderFade: { position: 'absolute', right: 0, bottom: 0, left: 0, height: SECTION_HEADER_FADE },
  sectionHeaderTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardSectionMonth: { flexShrink: 1, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3 },
  cardSectionYear: { fontSize: 22, fontWeight: '500', letterSpacing: -0.3 },
  cardSectionCountPill: { minHeight: 26, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13 },
  cardSectionCount: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sectionGap: { height: spacing.md },
  // Fixed, content-only height — flexGrow/flexShrink pinned to 0 so this
  // horizontal ScrollView can never inherit leftover vertical space from its
  // flex-column parent (the exact bug that was reserving a large empty gap
  // above the card list: an unbounded horizontal scroller in a flex column
  // stretching to fill available height instead of sizing to its chips).
  // Margins here (not flex) carry the search→filters and filters→list gaps.
  // The small bottom margin pairs with the section header's own paddingTop
  // (spacing.xs) for a 12pt chips→heading gap — matching search→chips — and
  // that padding travels with the header, so the gap is the same when stuck.
  chipScroll: { height: 26, flexGrow: 0, flexShrink: 0, marginTop: 12, marginBottom: spacing.xxs },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md },
  // Quiet by default — only the selected chip (theme.accent fill) is meant to
  // stand out; unselected chips stay small and low-contrast so they read as
  // supporting tools, not a dashboard of their own.
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 8, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipDotSelected: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  chipLabel: { fontSize: 11, fontWeight: '600' },
  chipCountInline: { fontSize: 11, fontWeight: '600' },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  unorganized: { minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18 },
  unorganizedMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  unorganizedTitle: { fontSize: 16, fontWeight: '700' },
  rowDetail: { marginTop: 3, fontSize: 13, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.xs, paddingHorizontal: spacing.xxs },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  sectionCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  boardList: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 18 },
  boardRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  boardMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  boardName: { fontSize: 16, fontWeight: '600' },
  emptyWrap: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xs },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  emptyDescription: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: spacing.sm },
  emptyCreateButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: 12 },
  emptyCreateText: { fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.58 },
  sheetContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.xs },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.xs },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetIntro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  nameInput: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 17 },
  optionalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: spacing.sm },
  error: { fontSize: 13, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  secondary: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontWeight: '600' },
  primary: { minHeight: 44, borderRadius: 12, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontWeight: '700' },
  disabled: { opacity: 0.38 },
});
