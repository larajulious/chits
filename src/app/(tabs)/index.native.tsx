import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { AppHeader, AppText, Chip, ChipRow, EmptyState, Icon, IconButton, PressableSurface, Screen, SegmentedControl, Surface, Toast, HeaderIcon, MenuIcon, useFontStyle } from '@/components/ui/primitives';
import { AddNoteSheet, type NoteSubmission } from '@/components/boards/add-note-sheet';
import { groupRecentNotes } from '@/services/card-grouping';
import { detachConfirmationMessage } from '@/services/detach-card';
import { requestReminderSync, subscribeToReminderChanges } from '@/services/reminders';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';
import { CardListRow } from '@/components/boards/card-list-row.native';
import { shareNoteHref } from '@/services/share-note-source';
import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import { GettingStartedCard } from '@/features/onboarding/components/checklist-card';
import type { Board, CardListItem, MessageType } from '@/db/types';
import { removeCardAttachmentFile } from '@/services/card-attachment-storage';
import { spaceNoteAction } from '@/components/spaces/space-note-action';
import { StickyGreeting } from '@/components/mascot/sticky-greeting.native';

type BoardSummary = Board & { columnCount: number; cardCount: number };
type ViewMode = 'boards' | 'cards';

type CardSection = { key: string; title: string; pinned?: boolean; count: number; data: CardListItem[] };
type CollectionCell = { kind: 'header'; section: CardSection } | { kind: 'note'; item: CardListItem; column: number };
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
    subtaskCount: 0, completedSubtaskCount: 0,
    photoCount: row.photoCount, videoCount: row.videoCount, fileCount: row.fileCount,
    previewMediaType: hidden ? null : row.previewMediaType, thumbnailPath: hidden ? null : row.thumbnailPath, mediaDuration: hidden ? null : row.mediaDuration, mediaCount: hidden ? 0 : row.mediaCount,
  };
}

// 'all' shows everything, 'unorganized' shows only chat thoughts not yet filed
// into a board, and any other value is a board id (only boards that actually
// have cards get a chip — filtering to an empty board would be a dead end).
type CardFilter = 'all' | 'unorganized' | (string & {});

type CardFilterChip = { key: CardFilter; label: string; count: number };

function CardFilterChips({ chips, filter, onChange }: { chips: CardFilterChip[]; filter: CardFilter; onChange: (next: CardFilter) => void }) {
  return (
    <ChipRow style={styles.chipScroll}>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          count={chip.count}
          selected={chip.key === filter}
          accessibilityLabel={`Filter by ${chip.label}, ${pluralize(chip.count, 'card')}`}
          onPress={() => onChange(chip.key)}
        />
      ))}
    </ChipRow>
  );
}

const VIEW_OPTIONS: { key: ViewMode; label: string; accessibilityLabel: string }[] = [
  { key: 'cards', label: 'Cards', accessibilityLabel: 'Cards view' },
  { key: 'boards', label: 'Boards', accessibilityLabel: 'Boards view' },
];

export default function BoardsScreen() {
  const { width, fontScale } = useWindowDimensions();
  const cardColumns = width < 350 || fontScale >= 1.3 ? 1 : 2;
  const database = useSQLiteContext();
  const boardRepository = useMemo(() => createBoardRepository(database), [database]);
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { openDrawer } = useAppDrawer();
  const { actionSheet, confirm } = useAppDialog();
  const { tokens: theme, styleTokens, styleColors } = useTheme();
  const controls = useStickyControls();
  // Sticky balances the masonry columns by height and spaces them evenly;
  // Classic keeps its alternating columns exactly as they were.
  const balanced = styleTokens.card.tinted;
  const { columnGap, rowGap } = styleTokens.noteCard;
  // Half a gap outside each balanced column, so columns sit at the screen inset.
  const listInset = spacing.md - columnGap / 2;
  const inputFont = useFontStyle('body');
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
  // Which chip is active in the Cards view's horizontal filter row — 'all',
  // 'unorganized', or a specific board id. Not persisted like viewMode; it's a
  // lightweight, session-local refinement rather than a standing preference.
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [cardToast, setCardToast] = useState<string | null>(null);

  useEffect(() => { if (!cardToast) return; const timer = setTimeout(() => setCardToast(null), 1800); return () => clearTimeout(timer); }, [cardToast]);

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

  const loadCards = useCallback(async () => {
    const [cardRows, thoughtRows, subtaskRows] = await Promise.all([
      boardRepository.listAllCardSummaries(),
      messageRepository.listUnorganizedSummaries(),
      boardRepository.listCardSubtaskPreviews(),
    ]);
    const subtasksByCard = new Map<string, { id: string; title: string; isCompleted: boolean }[]>();
    for (const row of subtaskRows) {
      const preview = subtasksByCard.get(row.cardId) ?? [];
      preview.push({ id: row.id, title: row.title, isCompleted: row.isCompleted === 1 });
      subtasksByCard.set(row.cardId, preview);
    }
    // A card whose thought is hidden in Chat is covered here too, the same as on its board.
    setCards(cardRows.map(({ isHidden, ...row }) => isHidden === 1
      ? { ...row, kind: 'card' as const, title: 'Hidden Chit', preview: null, pinned: row.pinned === 1, hidden: true, previewMediaType: null, thumbnailPath: null, mediaDuration: null, mediaCount: 0 }
      : { ...row, kind: 'card' as const, pinned: row.pinned === 1, hidden: false, mediaCount: row.mediaCount ?? 0, subtaskPreview: subtasksByCard.get(row.id) ?? [] }));
    setUnorganizedThoughts(thoughtRows.map(unorganizedToCardListItem));
  }, [boardRepository, messageRepository]);
  // Card deletes/archives/hides go through loadCards afterwards, so reconciling
  // here cancels notifications for removed cards and refreshes hidden text;
  // reminder changes made elsewhere (set, removed, fired) reload the list.
  useEffect(() => subscribeToReminderChanges(() => void loadCards()), [loadCards]);

  useFocusEffect(useCallback(() => {
    void load();
    void loadCards();
    // Reload runs on every focus (e.g. returning from Card Details) regardless
    // of which tab is active, so a switch back to Cards never shows stale data.
  }, [load, loadCards]));

  const changeViewMode = (next: ViewMode) => {
    if (next !== viewMode) setViewMode(next);
  };

  // A note added from the Cards header isn't tied to a board yet, so it's
  // created like a Chat thought and shows up under Unorganized.
  const addNote = async ({ text, attachment }: NoteSubmission) => {
    if (attachment) await messageRepository.createAttachmentMessage(attachment, text || null);
    else await messageRepository.createText(text);
    await Promise.all([load(), loadCards()]);
    setCardToast('Note added');
  };

  // Chip counts reflect the loaded cards and unorganized thoughts.
  const cardFilterChips = useMemo<CardFilterChip[]>(() => {
    const perBoardCount = new Map<string, number>();
    for (const card of cards) if (card.boardId) perBoardCount.set(card.boardId, (perBoardCount.get(card.boardId) ?? 0) + 1);
    return [
      { key: 'all', label: 'All', count: cards.length + unorganizedThoughts.length },
      { key: 'unorganized', label: 'Unorganized', count: unorganizedThoughts.length },
      ...boards
        .filter((board) => board.cardCount > 0)
        .map((board) => ({ key: board.id, label: board.name, count: perBoardCount.get(board.id) ?? 0 })),
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
    // Pinned stays on top; recent notes use familiar calendar headings.
    const groups = groupRecentNotes(rest);
    return [
      ...(pinned.length ? [{ key: 'pinned', title: 'Pinned', pinned: true, count: pinned.length, data: pinned }] : []),
      ...groups.map((group) => ({ key: group.key, title: group.title, count: group.items.length, data: group.items })),
    ];
  }, [cards, unorganizedThoughts, cardFilter]);

  const collection = useMemo(() => {
    const cells: CollectionCell[] = [];
    const stickyHeaderIndices: number[] = [];
    for (const section of cardSections) {
      stickyHeaderIndices.push(cells.length);
      cells.push({ kind: 'header', section });
      for (const [index, item] of section.data.entries()) cells.push({ kind: 'note', item, column: index % cardColumns });
    }
    return { cells, stickyHeaderIndices };
  }, [cardSections, cardColumns]);
  const noteCellStyle = (column: number) => balanced
    ? { paddingHorizontal: cardColumns === 1 ? spacing.md : columnGap / 2, paddingBottom: rowGap }
    : [styles.noteCell, cardColumns === 1 ? styles.noteCellSingle : column === 0 ? styles.noteCellStart : styles.noteCellEnd];

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
      await loadCards();
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
  }, [boardRepository, confirm, loadCards]);

  const openCardActions = useCallback(async (item: CardListItem) => {
    // "Stick to Fridge" / "Remove from Fridge", looked up as the menu opens.
    const space = await spaceNoteAction(database, item.kind, item.id).catch(() => null);
    const spaceOption = space ? [{ label: space.label, icon: space.icon, onPress: () => void space.run().then(setCardToast, () => setCardToast('That couldn’t be saved. Please try again.')) }] : [];
    if (item.kind === 'thought') {
      actionSheet({
        title: item.title,
        options: [
          { label: 'Add to board', icon: 'albums-outline', onPress: () => router.push({ pathname: '/unorganized', params: { messageId: item.id, openBoardPicker: '1' } }) },
          ...(item.hidden ? [] : [{ label: 'Share Note', icon: 'images-outline' as const, onPress: () => router.push(shareNoteHref({ messageId: item.id })) }]),
          { label: item.pinned ? 'Unpin' : 'Pin', icon: item.pinned ? 'pin' : 'pin-outline', onPress: () => void messageRepository.setPinned(item.id, !item.pinned).then(() => loadCards()) },
          ...spaceOption,
          {
            label: 'Archive thought', icon: 'archive-outline', onPress: () => confirm({
              type: 'default', icon: 'archive-outline', title: 'Archive thought?',
              message: 'You can restore it later from Archive.',
              confirmText: 'Archive thought',
              onConfirm: () => messageRepository.archive(item.id).then(() => { void requestReminderSync(); return loadCards(); }),
            }),
          },
          {
            label: 'Delete thought', icon: 'trash-outline', destructive: true, onPress: () => confirm({
              type: 'destructive', icon: 'trash-outline', title: 'Delete thought?',
              message: 'This can’t be undone.',
              confirmText: 'Delete thought',
              onConfirm: () => messageRepository.softDelete(item.id).then(() => { void requestReminderSync(); return loadCards(); }),
            }),
          },
        ],
      });
      return;
    }
    actionSheet({
      title: item.title,
      options: [
        ...(item.hidden ? [] : [{ label: 'Share Note', icon: 'images-outline' as const, onPress: () => router.push(shareNoteHref({ cardId: item.id })) }]),
        { label: item.pinned ? 'Unpin' : 'Pin', icon: item.pinned ? 'pin' : 'pin-outline', onPress: () => void boardRepository.setPinned('card', item.id, !item.pinned).then(() => loadCards()) },
        ...spaceOption,
        { label: 'Move back to Unorganized', icon: 'arrow-undo-outline', onPress: () => void moveCardBackToUnorganized(item) },
        {
          label: 'Archive card', icon: 'archive-outline', onPress: () => confirm({
            type: 'default', icon: 'archive-outline', title: 'Archive card?',
            message: 'You can restore it later from Archive. Your original messages remain in Chat.',
            confirmText: 'Archive card', accentColor: item.boardAccent,
            onConfirm: () => boardRepository.archiveCard(item.id).then(() => { void requestReminderSync(); return loadCards(); }),
          }),
        },
        {
          label: 'Delete card', icon: 'trash-outline', destructive: true, onPress: () => confirm({
            type: 'destructive', icon: 'trash-outline', title: 'Delete card?',
            message: 'This deletes the card and its Chits, including from Chat. This can’t be undone.',
            confirmText: 'Delete card',
            onConfirm: async () => {
              const removableUris = await boardRepository.deleteCard(item.id);
      void requestReminderSync();
              await Promise.all(removableUris.map((uri) => removeCardAttachmentFile(uri)));
              await loadCards();
            },
          }),
        },
      ],
    });
  }, [actionSheet, boardRepository, messageRepository, confirm, database, loadCards, moveCardBackToUnorganized]);

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
        actionWidth={88}
        subtitle={viewMode === 'boards' ? pluralize(boards.length, 'board') : pluralize(cards.length + unorganizedThoughts.length, 'card')}
        leading={(
          <IconButton label="Open navigation" onPress={openDrawer}>
            <MenuIcon />
          </IconButton>
        )}
        trailing={(
          <View style={[styles.headerActions, styleTokens.header.iconButton.filled && styles.headerActionsTiled]}>
            <IconButton label={viewMode === 'cards' && cardFilter !== 'all' && cardFilter !== 'unorganized' ? `Search in ${boards.find((board) => board.id === cardFilter)?.name ?? 'board'}` : 'Search'} onPress={() => {
              const selectedBoard = viewMode === 'cards' ? boards.find((board) => board.id === cardFilter) : undefined;
              router.push(selectedBoard
                ? { pathname: '/search', params: { source: 'board', boardId: selectedBoard.id, boardName: selectedBoard.name } }
                : '/search');
            }}>
              <HeaderIcon name="search-outline" size={23} />
            </IconButton>
            <IconButton accent label={viewMode === 'boards' ? 'Create board' : 'Add note'} onPress={viewMode === 'boards' ? openCreate : () => setAddNoteOpen(true)}>
              <HeaderIcon name="add" size={26} />
            </IconButton>
          </View>
        )}
      />

      <GettingStartedCard onHome />

      {!ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : (
      <View style={styles.flex}>
        <View style={styles.switchWrap}>
          <SegmentedControl options={VIEW_OPTIONS} value={viewMode} onChange={changeViewMode} />
        </View>

        {viewMode === 'cards' ? (
          totalCardCount === 0 ? (
            <EmptyState
              pose="no-notes"
              title="Your thoughts will show up here."
              description="Send yourself something in Chat and it becomes a note you can organize later."
              action={{ label: 'Start a Chit', onPress: () => router.push('/chat?focusInput=1') }}
            />
          ) : (
            <>
              <CardFilterChips chips={cardFilterChips} filter={cardFilter} onChange={setCardFilter} />
              {collection.cells.length === 0 ? (
                <EmptyState pose="search" title="No cards in this filter" description="Choose another board or All cards." />
              ) : (
                <FlashList
                  key={`cards-${cardColumns}`}
                  style={styles.cardList}
                  data={collection.cells}
                  masonry
                  numColumns={cardColumns}
                  optimizeItemArrangement={balanced}
                  overrideItemLayout={(layout, cell) => { layout.span = cell.kind === 'header' ? cardColumns : 1; }}
                  keyExtractor={(cell) => cell.kind === 'header' ? `section-${cell.section.key}` : `${cell.item.kind}-${cell.item.id}`}
                  getItemType={(cell) => cell.kind}
                  stickyHeaderIndices={collection.stickyHeaderIndices}
                  extraData={styleTokens}
                  renderItem={({ item: cell }) => cell.kind === 'header' ? (
                    <View accessibilityRole="header" accessibilityLabel={`${cell.section.title}, ${cell.section.count} ${cell.section.count === 1 ? 'note' : 'notes'}`} style={[styles.sectionHeaderRow, { backgroundColor: theme.background }, balanced && cardColumns > 1 && { marginHorizontal: -listInset }]}>
                      <View style={styles.sectionHeaderTitle}>
                        {cell.section.pinned ? <Icon name="pin" size={14} color={theme.textSecondary} /> : null}
                        <AppText variant="display" weight="700" numberOfLines={1} style={[styles.cardSectionMonth, { color: theme.textPrimary }]}>{cell.section.title}</AppText>
                      </View>
                      <AppText weight="500" style={[styles.cardSectionCount, { color: theme.textMuted }]}>{cell.section.count}</AppText>
                    </View>
                  ) : (
                    <View style={noteCellStyle(cell.column)}>
                      <CardListRow
                        item={cell.item}
                        onPress={() => router.push(cell.item.kind === 'thought' ? `/chat?messageId=${cell.item.id}` : `/card/${cell.item.id}`)}
                        onMore={() => void openCardActions(cell.item)}
                      />
                    </View>
                  )}
                  contentContainerStyle={[styles.cardListContent, balanced && cardColumns > 1 && { paddingHorizontal: listInset }, { paddingBottom: tabBarHeight + spacing.md }]}
                />
              )}
            </>
          )
        ) : (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.md }]}>
        <AppText style={[styles.intro, { color: styleTokens.mascotEmptyStates ? styleColors.textSecondary : theme.textSecondary }]}>
          Keep related thoughts together and easy to find.
        </AppText>

        <PressableSurface
          accessibilityRole="button"
          accessibilityLabel={`${pluralize(unorganizedCount, 'unorganized thought')}. Open Unorganized.`}
          onPress={() => router.push('/unorganized')}
          fill={styleTokens.card.tinted ? styleColors.cardTint : theme.accentSoft}
          border={theme.accentBorder}
          radius={styleTokens.radius.panel}
          edge={styleTokens.noteCard.edge || false}
          pressedStyle={styles.pressed}
          style={styles.unorganized}
        >
          <Surface fill={styleTokens.card.tinted ? styleColors.controlFill : theme.surface} radius={styleTokens.radius.control} edge={false} style={styles.unorganizedMark}>
            <Icon name="file-tray-outline" size={20} color={styleTokens.card.tinted ? theme.textPrimary : theme.accentStrong} />
          </Surface>
          <View style={styles.rowCopy}>
            <AppText variant="display" weight="700" style={[styles.unorganizedTitle, { color: styleTokens.card.tinted ? styleColors.cardInk : theme.textPrimary }]}>Unorganized</AppText>
            <AppText style={[styles.rowDetail, { color: styleTokens.card.tinted ? styleColors.cardInkMuted : theme.textSecondary }]}>
              {unorganizedCount === 0 ? 'All caught up' : `${pluralize(unorganizedCount, 'thought')} waiting`}
            </AppText>
          </View>
          <Icon name="chevron-forward" size={20} color={styleTokens.card.tinted ? styleColors.cardInk : theme.textMuted} />
        </PressableSurface>

        <View style={styles.sectionHeader}>
          <AppText accessibilityRole="header" weight={styleTokens.card.tinted ? '800' : '700'} style={[styles.sectionTitle, { color: theme.textMuted }]}>YOUR BOARDS</AppText>
          {boards.length > 0 ? (
            <AppText style={[styles.sectionCount, { color: theme.textMuted }]}>{boards.length}</AppText>
          ) : null}
        </View>

        {boards.length > 0 ? (
          <Surface fill={styleTokens.card.tinted ? styleColors.controlFill : theme.surface} border={theme.borderSubtle} radius={styleTokens.radius.panel} style={styles.boardList}>
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
                    index < boards.length - 1 && { borderBottomColor: styleTokens.outline.width ? styleColors.outline : theme.borderSubtle, borderBottomWidth: styleTokens.outline.width || StyleSheet.hairlineWidth },
                    pressed && styles.pressed,
                  ]}
                >
                  <Surface fill={board.accent ?? theme.accentSoft} radius={styleTokens.radius.control} outline={styleTokens.outline.width ? undefined : false} edge={false} style={styles.boardMark}>
                    <Icon
                      name={resolveBoardIcon(board.icon)}
                      size={19}
                      color={board.accent ? '#FFFFFF' : theme.accentStrong}
                    />
                  </Surface>
                  <View style={styles.rowCopy}>
                    <AppText weight="600" numberOfLines={1} style={[styles.boardName, { color: theme.textPrimary }]}>{board.name}</AppText>
                    <AppText style={[styles.rowDetail, { color: styleTokens.mascotEmptyStates ? styleColors.textSecondary : theme.textSecondary }]}>{detail}</AppText>
                  </View>
                  <Icon name="chevron-forward" size={19} color={theme.textMuted} />
                </Pressable>
              );
            })}
          </Surface>
        ) : (
          <EmptyState pose="empty-board" title="No boards yet." description="Organize your Chits when you’re ready." action={{ label: 'Create board', onPress: openCreate }} />
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
        <AppText accessibilityRole="header" variant="display" weight="700" style={[styles.sheetTitle, { color: theme.textPrimary }]}>New board</AppText>
        <AppText variant="paragraph" style={[styles.sheetIntro, { color: theme.textSecondary }]}>Give this collection a clear, memorable name.</AppText>

        <AppText weight="600" style={[styles.label, { color: theme.textSecondary }]}>Board name</AppText>
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
          style={[styles.nameInput, controls.input, inputFont, { borderRadius: styleTokens.radius.control, borderWidth: styleTokens.outline.width || 1, borderColor: styleTokens.outline.width ? styleColors.outline : theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]}
          returnKeyType="done"
          onSubmitEditing={() => void createBoard()}
        />

        <AppText weight="700" style={[styles.optionalLabel, { color: theme.textMuted }]}>OPTIONAL PERSONALIZATION</AppText>
        <BoardAppearanceFields icon={icon} accent={accent} onIconChange={setIcon} onAccentChange={setAccent} />

        {error ? <AppText accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</AppText> : null}

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={closeCreate} disabled={saving} style={styles.secondary}>
            <AppText weight="600" style={{ color: theme.textSecondary }}>Cancel</AppText>
          </Pressable>
          <PressableSurface
            accessibilityRole="button"
            accessibilityState={{ disabled: !isNameValid || saving }}
            onPress={() => void createBoard()}
            disabled={!isNameValid || saving}
            fill={styleTokens.elevation === 'edge' ? styleColors.accentFill : theme.accent}
            radius={styleTokens.button.radius}
            edge={styleTokens.button.edge || false}
            pressedStyle={styles.pressed}
            style={[styles.primary, (!isNameValid || saving) && styles.disabled]}
          >
            <AppText weight={styleTokens.elevation === 'edge' ? '800' : '700'} style={{ color: styleTokens.elevation === 'edge' ? styleColors.onAccent : theme.accentText }}>{saving ? 'Creating…' : 'Create board'}</AppText>
          </PressableSurface>
        </View>
      </FormSheet>
      <Toast message={cardToast} />
      <AddNoteSheet visible={addNoteOpen} onClose={() => setAddNoteOpen(false)} onSubmit={addNote} />
      {!createOpen && !addNoteOpen ? <StickyGreeting bottom={tabBarHeight + spacing.sm} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, flexGrow: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  switchWrap: { paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerActionsTiled: { gap: spacing.xs },
  cardList: { flex: 1 },
  noteCell: { paddingBottom: 12 },
  noteCellSingle: { paddingHorizontal: spacing.md },
  noteCellStart: { paddingLeft: spacing.md, paddingRight: 6 },
  noteCellEnd: { paddingLeft: 6, paddingRight: spacing.md },
  cardListContent: { paddingTop: 0 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 8 },
  sectionHeaderTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardSectionMonth: { flexShrink: 1, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  cardSectionCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  // A compact gap separates the tabs from filters (ChipRow sizes itself to its chips).
  chipScroll: { marginTop: 8, marginBottom: 2 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  unorganized: { minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  unorganizedMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  unorganizedTitle: { fontSize: 16 },
  rowDetail: { marginTop: 3, fontSize: 13, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.xs, paddingHorizontal: spacing.xxs },
  sectionTitle: { fontSize: 11, letterSpacing: 0.8 },
  sectionCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  boardList: { overflow: 'hidden' },
  boardRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  boardMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  boardName: { fontSize: 16 },
  pressed: { opacity: 0.58 },
  sheetContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.xs },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 4 / 2, marginBottom: spacing.xs },
  sheetTitle: { fontSize: 22 },
  sheetIntro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.xs },
  label: { fontSize: 13, marginTop: spacing.xs },
  nameInput: { minHeight: 48, paddingHorizontal: spacing.sm, fontSize: 17 },
  optionalLabel: { fontSize: 11, letterSpacing: 0.8, marginTop: spacing.sm },
  error: { fontSize: 13, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  secondary: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.38 },
});
