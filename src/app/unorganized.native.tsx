import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useTheme } from '@/components/theme-provider';
import { useVideoThumbnail } from '@/components/chat/message-row';
import { spacing, type ThemeTokens } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Attachment, Board, Message } from '@/db/types';

type BoardSummary = Board & { columnCount: number; cardCount: number };
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Toast = { message: string; onUndo?: () => void } | null;

const BOARD_ICON_NAMES = new Set(['folder-outline', 'briefcase-outline', 'bulb-outline', 'heart-outline', 'home-outline', 'book-outline', 'paw-outline', 'person-outline', 'star-outline', 'checkbox-outline']);
function boardIconName(icon: string | null): IoniconName { return icon && BOARD_ICON_NAMES.has(icon) ? (icon as IoniconName) : 'folder-outline'; }
function pluralize(count: number, singular: string) { return `${count} ${count === 1 ? singular : `${singular}s`}`; }

function preview(message: Message) {
  if (message.text?.trim()) return message.text;
  const attachment = message.attachments[0];
  if (attachment?.type === 'file') return attachment.originalName?.trim() || 'Attachment';
  if (attachment?.type === 'photo') return 'Photo';
  if (attachment?.type === 'video') return 'Video';
  if (attachment?.type === 'audio') return 'Audio note';
  return 'Attachment';
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function VideoThumb({ attachment }: { attachment: Attachment }) {
  const { tokens: theme } = useTheme();
  const thumbnail = useVideoThumbnail(attachment.localUri);
  return <View style={[thumbStyles.thumb, { backgroundColor: theme.surfaceElevated }]}>{thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Ionicons accessible={false} name="videocam-outline" size={20} color={theme.textMuted} />}<View style={thumbStyles.thumbPlay}><Ionicons accessible={false} name="play" size={11} color="#FFFFFF" /></View></View>;
}

function Thumbnail({ message }: { message: Message }) {
  const { tokens: theme } = useTheme();
  const attachment = message.attachments[0];
  if (!attachment) return null;
  if (attachment.type === 'photo') return <Image source={attachment.localUri} contentFit="cover" style={thumbStyles.thumb} />;
  if (attachment.type === 'video') return <VideoThumb attachment={attachment} />;
  const iconName: IoniconName = attachment.type === 'audio' ? 'mic-outline' : 'document-outline';
  return <View style={[thumbStyles.thumb, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name={iconName} size={20} color={theme.textMuted} /></View>;
}

const thumbStyles = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbPlay: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});

function AddToBoardSheet({ visible, boards, recentBoardIds, selectedCount, forCard, busy, onClose, onPick, onCreateAndAdd }: {
  visible: boolean;
  boards: BoardSummary[];
  recentBoardIds: string[];
  selectedCount: number;
  forCard: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (board: BoardSummary) => void;
  onCreateAndAdd: (name: string) => Promise<void>;
}) {
  const { tokens: theme } = useTheme();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [search, setSearch] = useState('');
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) { setMode('list'); setSearch(''); setCreateName(''); setCreateError(null); }
  }

  const close = () => { if (!busy && !creating) onClose(); };
  const query = search.trim();
  const filtered = query ? boards.filter((board) => board.name.toLowerCase().includes(query.toLowerCase())) : boards;
  const recentBoards = query ? [] : recentBoardIds.map((id) => boards.find((board) => board.id === id)).filter((board): board is BoardSummary => Boolean(board));

  const beginCreate = (prefill: string) => { setCreateName(prefill); setCreateError(null); setMode('create'); };
  const submitCreate = async () => {
    const trimmed = createName.trim();
    if (!trimmed || creating) return;
    setCreating(true); setCreateError(null);
    try { await onCreateAndAdd(trimmed); }
    catch (cause) { setCreateError(cause instanceof Error ? cause.message : 'Chits could not create that board.'); }
    finally { setCreating(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={sheetStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
      <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[sheetStyles.sheetSafeArea, { backgroundColor: theme.surface }]}>
        <GlassSurface style={[sheetStyles.sheet, { borderColor: theme.borderSubtle }]}>
          <View style={[sheetStyles.handle, { backgroundColor: theme.borderSubtle }]} />
          {mode === 'create' ? <>
            <View style={sheetStyles.headerRow}>
              <IconButton label="Back" onPress={() => setMode('list')}><Text style={[sheetStyles.backIcon, { color: theme.textPrimary }]}>‹</Text></IconButton>
              <Text accessibilityRole="header" style={[sheetStyles.title, { color: theme.textPrimary }]}>New board</Text>
              <View style={sheetStyles.headerSpacer} />
            </View>
            <View style={sheetStyles.createBody}>
              <Text style={[sheetStyles.label, { color: theme.textSecondary }]}>Board name</Text>
              <TextInput autoFocus value={createName} onChangeText={(value) => { setCreateName(value); setCreateError(null); }} placeholder="e.g. Travel" placeholderTextColor={theme.textMuted} maxLength={80} returnKeyType="done" onSubmitEditing={() => void submitCreate()} style={[sheetStyles.nameInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]} />
              {createError ? <Text accessibilityRole="alert" style={[sheetStyles.error, { color: theme.danger }]}>{createError}</Text> : null}
              <Pressable accessibilityRole="button" disabled={!createName.trim() || creating} onPress={() => void submitCreate()} style={[sheetStyles.primaryButton, { backgroundColor: theme.accent }, (!createName.trim() || creating) && sheetStyles.disabled]}>
                <Text style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{creating ? 'Creating…' : `Create and add ${pluralize(selectedCount, 'note')}`}</Text>
              </Pressable>
            </View>
          </> : <>
            <View style={sheetStyles.headerRow}>
              <View style={sheetStyles.headerCopy}>
                <Text accessibilityRole="header" style={[sheetStyles.title, { color: theme.textPrimary }]}>{forCard ? 'Add to card' : 'Add to board'}</Text>
                <Text style={[sheetStyles.subtitle, { color: theme.textSecondary }]}>Choose where to organize the selected note{selectedCount === 1 ? '' : 's'}.</Text>
              </View>
              <IconButton label="Close" onPress={close}><Ionicons accessible={false} name="close" size={22} color={theme.textPrimary} /></IconButton>
            </View>

            {boards.length === 0 ? (
              <View style={sheetStyles.emptyWrap}>
                <View style={[sheetStyles.emptyMark, { backgroundColor: theme.accentSoft }]}><Ionicons accessible={false} name="folder-outline" size={28} color={theme.accentStrong} /></View>
                <Text style={[sheetStyles.emptyTitle, { color: theme.textPrimary }]}>No boards yet</Text>
                <Text style={[sheetStyles.emptyDescription, { color: theme.textSecondary }]}>Create your first board to start organizing your notes.</Text>
                <Pressable accessibilityRole="button" onPress={() => beginCreate('')} style={[sheetStyles.primaryButton, sheetStyles.emptyPrimary, { backgroundColor: theme.accent }]}>
                  <Text style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>Create a board</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={close} style={sheetStyles.emptyCancel}>
                  <Text style={[sheetStyles.secondaryText, { color: theme.textSecondary }]}>Cancel</Text>
                </Pressable>
              </View>
            ) : <>
              <View style={sheetStyles.searchRow}>
                <Ionicons accessible={false} name="search" size={17} color={theme.textMuted} style={sheetStyles.searchIcon} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search boards…" placeholderTextColor={theme.textMuted} style={[sheetStyles.searchInput, { color: theme.textPrimary }]} returnKeyType="search" />
                {search ? <IconButton label="Clear search" onPress={() => setSearch('')}><Ionicons accessible={false} name="close-circle" size={17} color={theme.textMuted} /></IconButton> : null}
              </View>

              <Pressable accessibilityRole="button" onPress={() => beginCreate(query)} style={[sheetStyles.createRow, { borderColor: theme.borderSubtle }]}>
                <View style={[sheetStyles.createMark, { backgroundColor: theme.accentSoft }]}><Ionicons accessible={false} name="add" size={18} color={theme.accentStrong} /></View>
                <Text style={[sheetStyles.createLabel, { color: theme.textPrimary }]}>Create new board</Text>
              </Pressable>

              <View style={sheetStyles.listWrap}>
                {query && filtered.length === 0 ? (
                  <View style={sheetStyles.noResults}>
                    <Text style={[sheetStyles.noResultsText, { color: theme.textSecondary }]}>No boards found for “{query}”</Text>
                    <Pressable accessibilityRole="button" onPress={() => beginCreate(query)} style={[sheetStyles.primaryButton, { backgroundColor: theme.accent }]}>
                      <Text style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>+ Create “{query}”</Text>
                    </Pressable>
                  </View>
                ) : (
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={sheetStyles.listContent}>
                    {recentBoards.length > 0 ? <>
                      <Text style={[sheetStyles.sectionLabel, { color: theme.textMuted }]}>RECENT</Text>
                      {recentBoards.map((board) => <BoardRow key={`recent-${board.id}`} board={board} disabled={busy} onPress={() => onPick(board)} />)}
                      <Text style={[sheetStyles.sectionLabel, { color: theme.textMuted }]}>ALL BOARDS</Text>
                    </> : null}
                    {filtered.map((board) => <BoardRow key={board.id} board={board} disabled={busy} onPress={() => onPick(board)} />)}
                  </ScrollView>
                )}
              </View>
            </>}
          </>}
        </GlassSurface>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

function BoardRow({ board, disabled, onPress }: { board: BoardSummary; disabled: boolean; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${board.name}. ${pluralize(board.cardCount, 'note')}.`} disabled={disabled} onPress={onPress} style={({ pressed }) => [sheetStyles.boardRow, { borderBottomColor: theme.borderSubtle }, pressed && sheetStyles.pressed]}>
    <View style={[sheetStyles.boardMark, { backgroundColor: board.accent ?? theme.accentSoft }]}><Ionicons accessible={false} name={boardIconName(board.icon)} size={17} color={board.accent ? '#FFFFFF' : theme.accentStrong} /></View>
    <View style={sheetStyles.boardCopy}>
      <Text numberOfLines={1} style={[sheetStyles.boardName, { color: theme.textPrimary }]}>{board.name}</Text>
      <Text style={[sheetStyles.boardDetail, { color: theme.textSecondary }]}>{pluralize(board.cardCount, 'note')}</Text>
    </View>
    <Ionicons accessible={false} name="chevron-forward" size={18} color={theme.textMuted} />
  </Pressable>;
}

export default function UnorganizedScreen() {
  const database = useSQLiteContext();
  const { tokens: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { addToCard, messageId } = useLocalSearchParams<{ addToCard?: string; messageId?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [recentBoardIds, setRecentBoardIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBoard, setMergeBoard] = useState<Board | null>(null);
  const [mergeColumns, setMergeColumns] = useState<{ id: string; name: string }[]>([]);
  const [mergeColumnId, setMergeColumnId] = useState<string | null>(null);
  const [mergeTitle, setMergeTitle] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionMode = selected.length > 0;
  const [ready, setReady] = useState(false);
  const showLoader = useChitsLoading(!ready);

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, onUndo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    const [nextMessages, nextBoards, recentEntries] = await Promise.all([
      createMessageRepository(database).listUnorganized({ limit: 100 }),
      createBoardRepository(database).listActive(),
      createBoardRepository(database).listRecent(),
    ]);
    setMessages(nextMessages); setBoards(nextBoards);
    setRecentBoardIds(recentEntries.filter((entry) => entry.kind === 'board').map((entry) => entry.id).slice(0, 3));
    setSelected((current) => {
      const valid = current.filter((id) => nextMessages.some((message) => message.id === id));
      return messageId && nextMessages.some((message) => message.id === messageId) && !valid.includes(messageId) ? [...valid, messageId] : valid;
    });
    setReady(true);
  }, [database, messageId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleSelectAll = () => setSelected((current) => current.length === messages.length ? [] : messages.map((message) => message.id));

  const archive = async () => {
    const ids = selected;
    setWorking(true); setError(null);
    try {
      await createMessageRepository(database).archiveMany(ids);
      setSelected([]); await load();
      showToast(`Archived ${pluralize(ids.length, 'note')}`, () => void undoArchive(ids));
    } catch { setError('Chits could not archive those thoughts.'); }
    finally { setWorking(false); }
  };
  const undoArchive = async (ids: string[]) => {
    setWorking(true);
    try { for (const id of ids) await createMessageRepository(database).restore(id); await load(); }
    finally { setWorking(false); setToast(null); }
  };

  const undoOrganize = async (cardIds: string[]) => {
    setWorking(true);
    try { for (const cardId of cardIds) await createBoardRepository(database).deleteCard(cardId); await load(); }
    finally { setWorking(false); setToast(null); }
  };
  const organize = async (board: BoardSummary) => {
    setWorking(true); setError(null);
    try {
      const cardIds = await createBoardRepository(database).organizeMessages(board.id, selected);
      await createBoardRepository(database).markOpened('board', board.id);
      setSheetOpen(false); setSelected([]); await load();
      showToast(`Added to ${board.name}`, () => void undoOrganize(cardIds));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not add those thoughts to this board.'); }
    finally { setWorking(false); }
  };
  const createBoardAndOrganize = async (name: string) => {
    const board = await createBoardRepository(database).create({ name });
    const cardIds = await createBoardRepository(database).organizeMessages(board.id, selected);
    setSheetOpen(false); setSelected([]); await load();
    showToast(`Added to ${board.name}`, () => void undoOrganize(cardIds));
  };
  const addToExistingCard = async () => {
    if (!addToCard) return;
    setWorking(true); setError(null);
    try { await createBoardRepository(database).addMessagesToCard(addToCard, selected); await load(); router.replace(`/card/${addToCard}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not add those thoughts to this card.'); }
    finally { setWorking(false); }
  };
  const chooseMergeBoard = async (board: Board) => {
    const columns = await createBoardRepository(database).listColumns(board.id);
    setMergeBoard(board); setMergeColumns(columns); setMergeColumnId(columns[0]?.id ?? null);
  };
  const merge = async () => {
    if (!mergeBoard || !mergeColumnId) return;
    setWorking(true); setError(null);
    try { const cardId = await createBoardRepository(database).mergeMessages({ boardId: mergeBoard.id, columnId: mergeColumnId, messageIds: selected, title: mergeTitle }); setMergeOpen(false); setSelected([]); await load(); router.replace(`/card/${cardId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not merge those thoughts.'); }
    finally { setWorking(false); }
  };

  return <Screen>
    {selectionMode ? (
      <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
        <IconButton label="Exit selection" onPress={() => setSelected([])}><Ionicons accessible={false} name="close" size={22} color={theme.textPrimary} /></IconButton>
        <Text style={styles.selectionTitle}>{selected.length} selected</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={toggleSelectAll} style={styles.selectAllHit}><Text style={styles.selectAllText}>{selected.length === messages.length ? 'Deselect all' : 'Select all'}</Text></Pressable>
      </View>
    ) : (
      <AppHeader title="Unorganized" leading={<IconButton label="Go back" onPress={() => router.back()}><Text style={styles.back}>‹</Text></IconButton>} />
    )}
    {!ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : messages.length ? <>
      <ScrollView contentContainerStyle={styles.list}>
        {!selectionMode ? <Text style={styles.intro}>{addToCard ? 'Select thoughts to attach to this card. Your original chat remains exactly as it is.' : 'Notes that haven’t been added to a board yet.'}</Text> : null}
        {messages.map((message) => {
          const isSelected = selected.includes(message.id);
          const messagePreview = preview(message);
          const dateLabel = formatDateTime(message.createdAt);
          return <Pressable key={message.id} accessibilityRole="checkbox" accessibilityLabel={`${messagePreview}. ${dateLabel}`} accessibilityState={{ checked: isSelected }} onPress={() => toggle(message.id)} style={({ pressed }) => [styles.message, isSelected && styles.messageSelected, pressed && styles.messagePressed]}>
            {isSelected ? <Ionicons accessible={false} name="checkmark-circle" size={22} color={theme.accent} /> : <Ionicons accessible={false} name="ellipse-outline" size={22} color={theme.textMuted} />}
            <Thumbnail message={message} />
            <View style={styles.messageCopy}>
              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.messageText}>{messagePreview}</Text>
              <Text numberOfLines={1} style={styles.messageMeta}>{message.pinned ? 'Pinned · ' : ''}{dateLabel}</Text>
            </View>
          </Pressable>;
        })}
      </ScrollView>
      {selectionMode ? (
        <Animated.View entering={SlideInDown.springify().damping(20).mass(0.6)} exiting={SlideOutDown.duration(160)} style={[styles.actionBar, { borderTopColor: theme.borderSubtle, backgroundColor: theme.surface }]}>
          <Text style={styles.selectedCount}>{selected.length} selected</Text>
          <View style={styles.actionButtons}>
            {!addToCard ? <Pressable disabled={selected.length < 2 || working} accessibilityRole="button" onPress={() => { setMergeBoard(null); setMergeColumnId(null); setMergeTitle(''); setMergeOpen(true); }} style={styles.textAction}><Text style={[styles.mergeText, (selected.length < 2 || working) && styles.disabledText]}>Merge</Text></Pressable> : null}
            <Pressable disabled={working} onPress={() => void archive()} style={styles.textAction}><Text style={[styles.archiveText, working && styles.disabledText]}>Archive</Text></Pressable>
            <Pressable disabled={working} onPress={() => { if (addToCard) void addToExistingCard(); else setSheetOpen(true); }} style={[styles.primaryPill, working && styles.disabled]}>
              <Text style={styles.primaryPillText}>{addToCard ? 'Add to card' : 'Add to board'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </> : <EmptyState title="You’re all organized" description="Notes that haven’t been added to a board will appear here." />}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {toast ? <View pointerEvents="box-none" accessibilityLiveRegion="polite" style={styles.toastWrap}>
      <View style={[styles.toast, { backgroundColor: theme.textPrimary }]}>
        <Text style={[styles.toastText, { color: theme.background }]}>{toast.message}</Text>
        {toast.onUndo ? <Pressable accessibilityRole="button" hitSlop={8} onPress={toast.onUndo}><Text style={[styles.toastUndo, { color: theme.background }]}>Undo</Text></Pressable> : null}
      </View>
    </View> : null}

    <AddToBoardSheet
      visible={sheetOpen}
      boards={boards}
      recentBoardIds={recentBoardIds}
      selectedCount={selected.length}
      forCard={Boolean(addToCard)}
      busy={working}
      onClose={() => setSheetOpen(false)}
      onPick={(board) => void organize(board)}
      onCreateAndAdd={createBoardAndOrganize}
    />

    <Modal visible={mergeOpen} transparent animationType="slide" onRequestClose={() => !working && setMergeOpen(false)}><View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => !working && setMergeOpen(false)} /><View style={styles.modal}><Text style={styles.modalTitle}>Merge {selected.length} related thoughts</Text>{!mergeBoard ? <><Text style={styles.modalCopy}>Choose a board.</Text>{boards.map((board) => <Pressable key={board.id} onPress={() => void chooseMergeBoard(board)} style={styles.board}><View style={[styles.boardDot, { backgroundColor: board.accent ?? theme.accent }]} /><Text style={styles.boardName}>{board.name}</Text><Text style={styles.arrow}>›</Text></Pressable>)}</> : <><Text style={styles.modalCopy}>{mergeBoard.name} · choose a column and an optional title.</Text><View style={styles.columnChoices}>{mergeColumns.map((column) => <Pressable key={column.id} onPress={() => setMergeColumnId(column.id)} style={[styles.columnChoice, mergeColumnId === column.id && styles.columnChoiceSelected]}><Text style={styles.columnChoiceText}>{column.name}</Text></Pressable>)}</View><TextInput value={mergeTitle} onChangeText={setMergeTitle} placeholder="Title (optional)" placeholderTextColor={theme.textMuted} style={styles.titleInput} /><Pressable disabled={!mergeColumnId || working} onPress={() => void merge()} style={[styles.createButton, (!mergeColumnId || working) && styles.disabled]}><Text style={styles.addText}>{working ? 'Merging…' : 'Create merged card'}</Text></Pressable></>}</View></View></Modal>
  </Screen>;
}

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  back: { color: tokens.textPrimary, fontSize: 30, lineHeight: 30 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  selectionTitle: { flex: 1, color: tokens.textPrimary, fontSize: 16, fontWeight: '700' },
  selectAllHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs },
  selectAllText: { color: tokens.accent, fontWeight: '600', fontSize: 14 },
  list: { padding: spacing.md, gap: spacing.xs },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { color: tokens.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  message: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 13, borderWidth: 1, borderColor: 'transparent', borderRadius: 14, backgroundColor: tokens.surface },
  messageSelected: { borderColor: tokens.accentBorder, backgroundColor: tokens.accentSoft },
  messagePressed: { opacity: 0.68 },
  messageCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  messageText: { color: tokens.textPrimary, fontSize: 15, lineHeight: 20 },
  messageMeta: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 3 },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  selectedCount: { flex: 1, color: tokens.textSecondary, fontSize: 13 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.xxs },
  mergeText: { color: tokens.textSecondary, fontWeight: '600', fontSize: 13 },
  archiveText: { color: tokens.danger, fontWeight: '600', fontSize: 13 },
  primaryPill: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, backgroundColor: tokens.accent, borderRadius: 20 },
  primaryPillText: { color: tokens.accentText, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.42 },
  disabledText: { opacity: 0.42 },
  error: { color: '#fff', backgroundColor: tokens.danger, padding: spacing.sm, textAlign: 'center' },
  toastWrap: { position: 'absolute', right: 0, bottom: 96, left: 0, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  toastText: { fontSize: 14, fontWeight: '600' },
  toastUndo: { fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(24,24,23,0.3)' },
  modal: { width: '100%', maxWidth: 420, padding: spacing.lg, borderRadius: 18, backgroundColor: tokens.surface },
  modalTitle: { color: tokens.textPrimary, fontSize: 19, fontWeight: '700', marginBottom: spacing.md },
  modalCopy: { color: tokens.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  board: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle },
  boardDot: { width: 12, height: 12, borderRadius: 6 },
  boardName: { flex: 1, color: tokens.textPrimary, fontSize: 16 },
  arrow: { color: tokens.textMuted, fontSize: 25 },
  createButton: { alignSelf: 'flex-start', backgroundColor: tokens.accent, borderRadius: 9, paddingHorizontal: spacing.md, minHeight: 42, justifyContent: 'center' },
  addText: { color: tokens.accentText, fontWeight: '700', fontSize: 13 },
  columnChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  columnChoice: { paddingHorizontal: spacing.sm, minHeight: 36, justifyContent: 'center', borderRadius: 9, backgroundColor: tokens.surfaceElevated },
  columnChoiceSelected: { backgroundColor: tokens.surfaceElevated, borderWidth: 1, borderColor: tokens.accent },
  columnChoiceText: { color: tokens.textPrimary, fontSize: 13, fontWeight: '600' },
  titleInput: { minHeight: 44, borderWidth: 1, borderColor: tokens.borderSubtle, borderRadius: 9, paddingHorizontal: spacing.sm, color: tokens.textPrimary },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  sheetSafeArea: { flexShrink: 1, maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: spacing.xs, marginBottom: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  headerCopy: { flex: 1 },
  headerSpacer: { width: 44 },
  backIcon: { fontSize: 30, lineHeight: 30 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs, marginBottom: spacing.xxs },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  searchIcon: { marginLeft: spacing.xxs },
  searchInput: { flex: 1, minHeight: 44, fontSize: 16 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, marginTop: spacing.xs, marginBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  createMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  createLabel: { fontSize: 15, fontWeight: '600' },
  listWrap: { flexShrink: 1 },
  listContent: { paddingBottom: spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: spacing.sm, marginBottom: spacing.xxs },
  boardRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  boardMark: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  boardCopy: { flex: 1, minWidth: 0 },
  boardName: { fontSize: 15, fontWeight: '600' },
  boardDetail: { fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.6 },
  noResults: { alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md },
  noResultsText: { fontSize: 14, lineHeight: 20 },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xxs },
  emptyMark: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDescription: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: spacing.sm },
  emptyPrimary: { alignSelf: 'stretch' },
  emptyCancel: { minHeight: 44, justifyContent: 'center', marginTop: spacing.xxs },
  secondaryText: { fontWeight: '600', fontSize: 14 },
  createBody: { paddingVertical: spacing.xs, gap: spacing.xxs },
  nameInput: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 17 },
  error: { fontSize: 13 },
  primaryButton: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  primaryButtonText: { fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.42 },
});
