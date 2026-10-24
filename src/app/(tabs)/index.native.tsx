import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { noteChecklistSummary, type NoteBlock } from '@/services/note-content';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { AppHeader, AppText, EmptyState, Icon, IconButton, PressableSurface, Screen, Surface, Toast, HeaderIcon, MenuIcon, useFontStyle } from '@/components/ui/primitives';
import { AddNoteSheet, type NoteSubmission } from '@/components/boards/add-note-sheet';
import { groupRecentNotes } from '@/services/card-grouping';
import { detachConfirmationMessage } from '@/services/detach-card';
import { requestReminderSync, subscribeToReminderChanges } from '@/services/reminders';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';
import { BoardListItem } from '@/components/boards/board-list-item.native';
import { CardsCollection, type CardSection } from '@/components/boards/cards-collection.native';
import { shareNoteHref } from '@/services/share-note-source';
import { type BoardIconName } from '@/constants/board-appearance';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createCardSubtaskRepository, createMessageRepository } from '@/db/repositories';
import { GettingStartedCard } from '@/features/onboarding/components/checklist-card';
import { FocusCardsBanner } from '@/features/focus/focus-cards-banner';
import type { Board, CardListItem, MessageType } from '@/db/types';
import { createRevisitRepository } from '@/db/revisit-repository';
import { removeCardAttachmentFile } from '@/services/card-attachment-storage';
import { spaceNoteAction } from '@/components/spaces/space-note-action';
import { StickyGreeting } from '@/components/mascot/sticky-greeting.native';

type BoardSummary = Board & { columnCount: number; cardCount: number };
type ViewMode = 'boards' | 'cards';

type UnorganizedSummaryRow = { id: string; text: string | null; type: MessageType; createdAt: number; updatedAt: number; pinned: number; isHiddenContent: number; photoCount: number; videoCount: number; fileCount: number; firstAttachmentType: MessageType | null; firstAttachmentName: string | null; previewMediaType: 'photo' | 'video' | 'audio' | null; thumbnailPath: string | null; mediaDuration: number | null; mediaCount: number };

function pluralize(count: number, singular: string) { return countLabel(singular, count); }

function unorganizedDisplayTitle(row: UnorganizedSummaryRow): string {
  if (row.isHiddenContent === 1) return tr("index.hiddenChit");
  const text = row.text?.trim();
  if (text) return text.slice(0, 120);
  if (row.firstAttachmentType === 'file') return row.firstAttachmentName?.trim() || tr("attachmentexportnaming.attachment");
  if (row.firstAttachmentType === 'photo') return tr("id.photo");
  if (row.firstAttachmentType === 'video') return tr("addcardattachmentsheet.video");
  if (row.firstAttachmentType === 'audio') return tr("messagerow.audioNote");
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

export default function BoardsScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const localeVersion = useLocale();
  const database = useSQLiteContext();
  const boardRepository = useMemo(() => createBoardRepository(database), [database]);
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const revisitRepository = useMemo(() => createRevisitRepository(database), [database]);
  const subtaskRepository = useMemo(() => createCardSubtaskRepository(database), [database]);
  const { openDrawer } = useAppDrawer();
  const { actionSheet, confirm } = useAppDialog();
  const { tokens: theme, styleTokens, styleColors } = useTheme();
  const controls = useStickyControls();
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
  // Board metadata can finish before the card queries. Keep empty states hidden
  // until both have loaded and the loader's minimum visible duration has ended.
  const [cardsReady, setCardsReady] = useState(false);
  const isLoading = !ready || !cardsReady;
  const showLoader = useChitsLoading(isLoading);
  const isNameValid = Boolean(name.trim());

  // Land on Cards on each launch; manual view switches remain session-local.
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [headerSection, setHeaderSection] = useState<{ sections: CardSection[]; key: string } | null>(null);
  const { view } = useLocalSearchParams<{ view?: string }>();
  useFocusEffect(useCallback(() => {
    if (view !== 'cards') return;
    setViewMode('cards');
    setHeaderSection(null);
    router.setParams({ view: undefined });
  }, [view]));
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [cards, setCards] = useState<CardListItem[]>([]);
  // Chat thoughts not yet organized into any board/card — the Cards view
  // shows these alongside real cards (pinned ones in Pinned, the rest in All
  // Cards) so nothing captured in Chat is invisible just because it hasn't
  // been filed into a board yet.
  const [unorganizedThoughts, setUnorganizedThoughts] = useState<CardListItem[]>([]);
  // Which chip is active in the Cards view's horizontal filter row — 'all',
  // 'unorganized', or a specific board id. Like viewMode, it's a lightweight,
  // session-local refinement rather than a standing preference.
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [cardToast, setCardToast] = useState<string | null>(null);
  const openingNote = useRef(false);

  const openCardNote = async (item: CardListItem) => {
    if (openingNote.current) return;
    Keyboard.dismiss();
    // Board cards open their details, including their board context and actions.
    // Hidden content keeps its existing reveal flow.
    const openDetails = () => router.push(item.kind === 'thought' ? `/chat?messageId=${item.id}` : `/card/${item.id}`);
    if (item.hidden || (item.kind === 'card' && item.boardId)) { openDetails(); return; }
    openingNote.current = true;
    try {
      const messages = item.kind === 'card' ? await boardRepository.listCardMessages(item.id) : null;
      if (messages && (messages.length !== 1 || messages[0].isHiddenContent)) { openDetails(); return; }
      router.push({ pathname: '/card/edit-content', params: { messageId: messages ? messages[0].id : item.id, autoFocus: '0' } });
    } catch {
      setCardToast(tr("index.thatNoteCouldNotBeOpenedPleaseTry"));
    } finally {
      openingNote.current = false;
    }
  };

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
    const [cardRows, thoughtRows, subtaskRows, checklistRows, connectionRows] = await Promise.all([
      boardRepository.listAllCardSummaries(),
      messageRepository.listUnorganizedSummaries(),
      boardRepository.listCardSubtaskPreviews(),
      messageRepository.listChecklistSummaries(),
      revisitRepository.relationshipCounts(),
    ]);
    const connectionsByKey = new Map<string, number>(connectionRows.map((row) => [row.noteKey, row.count]));
    const contentByCard = new Map<string, NoteBlock[]>();
    const contentByThought = new Map<string, NoteBlock[]>();
    for (const row of checklistRows) {
      contentByThought.set(row.messageId, row.content);
      if (row.cardId) contentByCard.set(row.cardId, [...(contentByCard.get(row.cardId) ?? []), ...row.content]);
    }
    const subtasksByCard = new Map<string, { id: string; title: string; isCompleted: boolean }[]>();
    for (const row of subtaskRows) {
      const preview = subtasksByCard.get(row.cardId) ?? [];
      preview.push({ id: row.id, title: row.title, isCompleted: row.isCompleted === 1 });
      subtasksByCard.set(row.cardId, preview);
    }
    // A card whose thought is hidden in Chat is covered here too, the same as on its board.
    setCards(cardRows.map(({ isHidden, ...row }) => isHidden === 1
      ? { ...row, kind: 'card' as const, title: tr("index.hiddenChit"), preview: null, pinned: row.pinned === 1, hidden: true, previewMediaType: null, thumbnailPath: null, mediaDuration: null, mediaCount: 0 }
      : { ...row, kind: 'card' as const, pinned: row.pinned === 1, hidden: false, connectionCount: connectionsByKey.get(`card:${row.id}`) ?? 0, mediaCount: row.mediaCount ?? 0, subtaskPreview: subtasksByCard.get(row.id) ?? [], checklistSummary: noteChecklistSummary(contentByCard.get(row.id) ?? []) }));
    setUnorganizedThoughts(thoughtRows.map((row) => ({ ...unorganizedToCardListItem(row), connectionCount: row.isHiddenContent ? 0 : connectionsByKey.get(`thought:${row.id}`) ?? 0, checklistSummary: row.isHiddenContent ? null : noteChecklistSummary(contentByThought.get(row.id) ?? []) })));
    setCardsReady(true);
  }, [boardRepository, messageRepository, revisitRepository]);
  // Card deletes/archives/hides go through loadCards afterwards, so reconciling
  // here cancels notifications for removed cards and refreshes hidden text;
  // reminder changes made elsewhere (set, removed, fired) reload the list.
  useEffect(() => subscribeToReminderChanges(() => void loadCards()), [loadCards]);
  useEffect(() => subscribeToNoteChanges(() => void loadCards()), [loadCards]);

  useFocusEffect(useCallback(() => {
    void load();
    void loadCards();
    // Reload runs on every focus (e.g. returning from Card Details) regardless
    // of which tab is active, so a switch back to Cards never shows stale data.
  }, [load, loadCards]));

  const changeViewMode = (next: ViewMode) => {
    if (next !== viewMode) {
      setHeaderSection(null);
      setViewMode(next);
    }
  };

  // A note added from the Cards header isn't tied to a board yet, so it's
  // created like a Chat thought and shows up under Unorganized.
  const addNote = async ({ text, attachment, blocks }: NoteSubmission) => {
    if (blocks) await messageRepository.createNote({ blocks, attachment });
    else if (attachment) await messageRepository.createAttachmentMessage(attachment, text || null);
    else await messageRepository.createText(text);
    await Promise.all([load(), loadCards()]);
    setCardToast(tr("calendar.noteAdded"));
  };

  // Chip counts reflect the loaded cards and unorganized thoughts.
  const cardFilterChips = useMemo<CardFilterChip[]>(() => {
    void localeVersion; // Refresh translated display metadata without reloading the database.

    const perBoardCount = new Map<string, number>();
    for (const card of cards) if (card.boardId) perBoardCount.set(card.boardId, (perBoardCount.get(card.boardId) ?? 0) + 1);
    return [
      { key: 'all', label: tr("attachments.all"), count: cards.length + unorganizedThoughts.length },
      { key: 'unorganized', label: tr("index.unorganized"), count: unorganizedThoughts.length },
      ...boards
        .filter((board) => board.cardCount > 0)
        .map((board) => ({ key: board.id, label: board.name, count: perBoardCount.get(board.id) ?? 0 })),
    ];
  }, [boards, cards, unorganizedThoughts, localeVersion]);

  // Cards and unorganized thoughts are two separately-sorted (both already
  // updated_at DESC from SQL) lists that get interleaved here — a plain
  // concat-then-sort, since even a few thousand combined rows is trivial to
  // re-sort client-side and this only runs when either source list (or the
  // active filter chip) changes.
  const cardSections = useMemo<CardSection[]>(() => {
    void localeVersion; // Refresh translated display metadata without reloading the database.

    const all = cardFilter === 'unorganized' ? unorganizedThoughts
      : cardFilter === 'all' ? [...cards, ...unorganizedThoughts]
      : cards.filter((card) => card.boardId === cardFilter);
    const pinned = all.filter((item) => item.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    const rest = all.filter((item) => !item.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    // Pinned stays on top; recent notes use familiar calendar headings.
    const groups = groupRecentNotes(rest);
    return [
      ...(pinned.length ? [{ key: 'pinned', title: tr("index.pinned"), pinned: true, count: pinned.length, data: pinned }] : []),
      ...groups.map((group) => ({ key: group.key, title: group.title, count: group.items.length, data: group.items })),
    ];
  }, [cards, unorganizedThoughts, cardFilter, localeVersion]);

  const updateHeaderSection = useCallback((section: CardSection | null) => {
    setHeaderSection((previous) => {
      if (!section) return previous === null ? previous : null;
      return previous?.sections === cardSections && previous.key === section.key ? previous : { sections: cardSections, key: section.key };
    });
  }, [cardSections]);
  const activeHeaderSection = viewMode === 'cards' && headerSection?.sections === cardSections
    ? cardSections.find((section) => section.key === headerSection.key)
    : undefined;

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
      setCardToast(tr("index.movedBackToUnorganized"));
    };

    confirm({
      type: 'default',
      icon: 'arrow-undo-outline',
      title: tr("index.moveThisCardBackToUnorganized"),
      message: detachConfirmationMessage({ boardName: item.boardName, messageCount: preview.messageCount, commentCount: preview.commentCount, attachmentCount: preview.attachmentCount }),
      confirmText: tr("index.move"),
      accentColor: item.boardAccent,
      onConfirm: run,
    });
  }, [boardRepository, confirm, loadCards]);

  // Ticking a subtask on a card shows at once and saves in order; a failed
  // save reloads the list so the card shows what was actually stored.
  const subtaskQueue = useRef(Promise.resolve());
  const toggleCardSubtask = useCallback((item: CardListItem, subtaskId: string) => {
    void Haptics.selectionAsync();
    setCards((current) => current.map((card) => {
      if (card.kind !== 'card' || card.id !== item.id) return card;
      const done = card.subtaskPreview?.find((subtask) => subtask.id === subtaskId)?.isCompleted;
      return { ...card, completedSubtaskCount: card.completedSubtaskCount + (done ? -1 : 1), subtaskPreview: card.subtaskPreview?.map((subtask) => subtask.id === subtaskId ? { ...subtask, isCompleted: !done } : subtask) };
    }));
    subtaskQueue.current = subtaskQueue.current
      .then(() => subtaskRepository.toggle(item.id, subtaskId))
      .then(() => {}, () => { setCardToast(tr("cardsubtasks.couldNotUpdateThatSubtask")); void loadCards(); });
  }, [loadCards, subtaskRepository]);

  const openCardActions = useCallback(async (item: CardListItem) => {
    // "Stick to Fridge" / "Remove from Fridge", looked up as the menu opens.
    const space = await spaceNoteAction(database, item.kind, item.id).catch(() => null);
    const spaceOption = space ? [{ label: space.label, icon: space.icon, onPress: () => void space.run().then(setCardToast, () => setCardToast(tr("chat.thatCouldnTBeSavedPleaseTryAgain"))) }] : [];
    if (item.kind === 'thought') {
      actionSheet({
        title: item.title,
        options: [
          { label: tr("index.addToBoard"), icon: 'albums-outline', onPress: () => router.push({ pathname: '/unorganized', params: { messageId: item.id, openBoardPicker: '1' } }) },
          ...(item.hidden ? [] : [{ label: tr('focus.action'), icon: 'timer-outline' as const, onPress: () => router.push({ pathname: '/focus', params: { note: `thought:${item.id}` } }) }]),
          ...(item.hidden ? [] : [{ label: tr('templates.saveAs'), icon: 'copy-outline' as const, onPress: () => router.push({ pathname: '/templates', params: { sourceMessageId: item.id } }) }]),
          ...(item.hidden ? [] : [{ label: tr("index.shareNote"), icon: 'images-outline' as const, onPress: () => router.push(shareNoteHref({ messageId: item.id })) }]),
          { label: item.pinned ? tr("index.unpin") : tr("index.pin"), icon: item.pinned ? 'pin' : 'pin-outline', onPress: () => void messageRepository.setPinned(item.id, !item.pinned).then(() => loadCards()) },
          ...spaceOption,
          {
            label: tr("index.archiveThought"), icon: 'archive-outline', onPress: () => confirm({
              type: 'default', icon: 'archive-outline', title: tr("index.archiveThought2"),
              message: tr("index.youCanRestoreItLaterFromArchive"),
              confirmText: tr("index.archiveThought"),
              onConfirm: () => messageRepository.archive(item.id).then(() => { void requestReminderSync(); return loadCards(); }),
            }),
          },
          {
            label: tr("index.deleteThought"), icon: 'trash-outline', destructive: true, onPress: () => confirm({
              type: 'destructive', icon: 'trash-outline', title: tr("chat.deleteThought"),
              message: tr("index.thisCanTBeUndone"),
              confirmText: tr("index.deleteThought"),
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
        ...(item.hidden ? [] : [{ label: tr('focus.action'), icon: 'timer-outline' as const, onPress: () => router.push({ pathname: '/focus', params: { note: `card:${item.id}` } }) }]),
        ...(item.hidden ? [] : [{ label: tr("index.shareNote"), icon: 'images-outline' as const, onPress: () => router.push(shareNoteHref({ cardId: item.id })) }]),
        { label: item.pinned ? tr("index.unpin") : tr("index.pin"), icon: item.pinned ? 'pin' : 'pin-outline', onPress: () => void boardRepository.setPinned('card', item.id, !item.pinned).then(() => loadCards()) },
        ...spaceOption,
        { label: tr("index.moveBackToUnorganized"), icon: 'arrow-undo-outline', onPress: () => void moveCardBackToUnorganized(item) },
        {
          label: tr("index.archiveCard"), icon: 'archive-outline', onPress: () => confirm({
            type: 'default', icon: 'archive-outline', title: tr("calendar.archiveCard"),
            message: tr("index.youCanRestoreItLaterFromArchiveYour"),
            confirmText: tr("index.archiveCard"), accentColor: item.boardAccent,
            onConfirm: () => boardRepository.archiveCard(item.id).then(() => { void requestReminderSync(); return loadCards(); }),
          }),
        },
        {
          label: tr("index.deleteCard"), icon: 'trash-outline', destructive: true, onPress: () => confirm({
            type: 'destructive', icon: 'trash-outline', title: tr("index.deleteCard2"),
            message: tr("index.thisDeletesTheCardAndItsChitsIncluding"),
            confirmText: tr("index.deleteCard"),
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
      setError(tr("index.couldnTCreateBoardTryAgain"));
    } finally {
      setSaving(false);
    }
  };

  const totalCardCount = boards.reduce((sum, board) => sum + board.cardCount, 0) + unorganizedCount;

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
      <AppHeader
        title={activeHeaderSection?.title ?? appTitle}
        actionWidth={88}
        subtitle={viewMode === 'boards' ? pluralize(boards.length, 'board') : pluralize(activeHeaderSection?.count ?? cards.length + unorganizedThoughts.length, 'card')}
        leading={(
          <View style={[styles.headerActions, styleTokens.header.iconButton.filled && styles.headerActionsTiled]}>
            <IconButton label={tr("archive.openNavigation")} onPress={openDrawer}>
              <MenuIcon />
            </IconButton>
            <IconButton
              label={viewMode === 'boards' ? tr("index.boardsViewSwitchToCards") : tr("index.cardsViewSwitchToBoards")}
              disabled={isLoading || showLoader}
              onPress={() => changeViewMode(viewMode === 'boards' ? 'cards' : 'boards')}
            >
              <HeaderIcon name={viewMode === 'boards' ? 'albums-outline' : 'reader-outline'} size={22} />
            </IconButton>
          </View>
        )}
        trailing={(
          <View style={[styles.headerActions, styleTokens.header.iconButton.filled && styles.headerActionsTiled]}>
            <IconButton label={viewMode === 'cards' && cardFilter !== 'all' && cardFilter !== 'unorganized' ? tr("index.searchInValue", { value1: boards.find((board) => board.id === cardFilter)?.name ?? 'board' }) : tr("search.search")} onPress={() => {
              const selectedBoard = viewMode === 'cards' ? boards.find((board) => board.id === cardFilter) : undefined;
              router.push(selectedBoard
                ? { pathname: '/search', params: { source: 'board', boardId: selectedBoard.id, boardName: selectedBoard.name } }
                : '/search');
            }}>
              <HeaderIcon name="search-outline" size={23} />
            </IconButton>
            <IconButton accent label={viewMode === 'boards' ? tr("index.createBoard") : tr("id.addNote")} onPress={viewMode === 'boards' ? openCreate : () => setAddNoteOpen(true)}>
              <HeaderIcon name="add" size={26} />
            </IconButton>
          </View>
        )}
      />

      <FocusCardsBanner />
      <GettingStartedCard onHome />

      {isLoading || showLoader ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : (
      <View style={styles.flex}>
        {viewMode === "cards" ? (
          totalCardCount === 0 ? (
            <EmptyState
              pose="no-notes"
              title={tr("index.yourThoughtsWillShowUpHere")}
              description={tr("index.sendYourselfSomethingInChatAndItBecomes")}
            />
          ) : (
            <CardsCollection
              sections={cardSections}
              chips={cardFilterChips}
              filter={cardFilter}
              onFilter={setCardFilter}
              onOpen={openCardNote}
              onMore={openCardActions}
              onToggleSubtask={toggleCardSubtask}
              onSectionChange={updateHeaderSection}
              bottomInset={tabBarHeight}
            />
          )
        ) : (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.md }]}>
        <AppText style={[styles.intro, { color: styleTokens.mascotEmptyStates ? styleColors.textSecondary : theme.textSecondary }]}>
          {tr("index.keepRelatedThoughtsTogetherAndEasyToFind")}</AppText>

        <PressableSurface
          accessibilityRole="button"
          accessibilityLabel={tr("index.valueOpenUnorganized", { value1: pluralize(unorganizedCount, 'unorganized thought') })}
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
            <AppText variant="display" weight="700" style={[styles.unorganizedTitle, { color: styleTokens.card.tinted ? styleColors.cardInk : theme.textPrimary }]}>{tr("index.unorganized")}</AppText>
            <AppText style={[styles.rowDetail, { color: styleTokens.card.tinted ? styleColors.cardInkMuted : theme.textSecondary }]}>
              {unorganizedCount === 0 ? tr("index.allCaughtUp") : tr("index.valueWaiting", { value1: pluralize(unorganizedCount, 'thought') })}
            </AppText>
          </View>
          <Icon name="chevron-forward" size={20} color={styleTokens.card.tinted ? styleColors.cardInk : theme.textMuted} />
        </PressableSurface>

        <View style={styles.sectionHeader}>
          <AppText accessibilityRole="header" variant="display" weight="700" style={[styles.sectionTitle, { color: theme.textPrimary }]}>{tr("index.yourBoards")}</AppText>
          {boards.length > 0 ? (
            <View style={[styles.boardCount, { backgroundColor: theme.surfaceElevated }]}><AppText weight="600" style={[styles.sectionCount, { color: theme.textSecondary }]}>{boards.length}</AppText></View>
          ) : null}
        </View>

        {boards.length > 0 ? (
          <View style={styles.boardList}>
            {boards.map((board) => <BoardListItem key={board.id} board={board} onPress={() => router.push(`/board/${board.id}`)} />)}
          </View>
        ) : (
          <EmptyState pose="empty-board" title={tr("index.noBoardsYet")} description={tr("index.organizeYourChitsWhenYouReReady")} action={{ label: tr("index.createBoard"), onPress: openCreate }} />
        )}
      </ScrollView>
        )}
      </View>
      )}

      <FormSheet
        ref={scrollRef}
        visible={createOpen}
        onRequestClose={closeCreate}
        closeAccessibilityLabel={tr("index.closeNewBoard")}
        accessibilityViewIsModal
        onModalShow={() => requestAnimationFrame(() => nameInputRef.current?.focus())}
        contentContainerStyle={styles.sheetContent}
      >
        <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
        <AppText accessibilityRole="header" variant="display" weight="700" style={[styles.sheetTitle, { color: theme.textPrimary }]}>{tr("index.newBoard")}</AppText>
        <AppText variant="paragraph" style={[styles.sheetIntro, { color: theme.textSecondary }]}>{tr("index.giveThisCollectionAClearMemorableName")}</AppText>

        <AppText weight="600" style={[styles.label, { color: theme.textSecondary }]}>{tr("index.boardName")}</AppText>
        <TextInput
          ref={nameInputRef}
          accessibilityLabel={tr("index.boardName")}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          onFocus={() => scrollRef.current?.requestVisible(nameInputRef)}
          placeholder={tr("index.eGTasks")}
          placeholderTextColor={theme.textMuted}
          maxLength={80}
          style={[styles.nameInput, controls.input, inputFont, { borderRadius: styleTokens.radius.control, borderWidth: styleTokens.outline.width || 1, borderColor: styleTokens.outline.width ? styleColors.outline : theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]}
          returnKeyType="done"
          onSubmitEditing={() => void createBoard()}
        />

        <AppText weight="700" style={[styles.optionalLabel, { color: theme.textMuted }]}>{tr("index.optionalPersonalization")}</AppText>
        <BoardAppearanceFields icon={icon} accent={accent} onIconChange={setIcon} onAccentChange={setAccent} />

        {error ? <AppText accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</AppText> : null}

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={closeCreate} disabled={saving} style={styles.secondary}>
            <AppText weight="600" style={{ color: theme.textSecondary }}>{tr("chat.cancel")}</AppText>
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
            <AppText weight={styleTokens.elevation === 'edge' ? '800' : '700'} style={{ color: styleTokens.elevation === 'edge' ? styleColors.onAccent : theme.accentText }}>{saving ? tr("index.creating") : tr("index.createBoard")}</AppText>
          </PressableSurface>
        </View>
      </FormSheet>
      <Toast message={cardToast} />
      <AddNoteSheet visible={addNoteOpen} onClose={() => setAddNoteOpen(false)} onSubmit={addNote} />
      {!createOpen && !addNoteOpen ? <StickyGreeting /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, flexGrow: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerActionsTiled: { gap: spacing.xs },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  unorganized: { minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  unorganizedMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  unorganizedTitle: { fontSize: 16 },
  rowDetail: { marginTop: 3, fontSize: 13, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: spacing.xs, paddingHorizontal: spacing.xxs },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  boardCount: { minWidth: 28, minHeight: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  sectionCount: { fontSize: 12, fontVariant: ['tabular-nums'] },
  boardList: { gap: 8 },
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
