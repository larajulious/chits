import { countLabel, tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import Animated, { SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';

import { AppHeader, EmptyState, HeaderIcon, HeaderIconButton, IconButton, Screen } from '@/components/ui/primitives';
import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, PaperButton, PaperCard, PaperDesk, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { mix, noteColors } from '@/constants/style-tokens';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useTheme } from '@/components/theme-provider';
import { useStickySheet } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useVideoThumbnail } from '@/components/chat/message-row';
import { spacing, type ThemeTokens } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Attachment, Board, Message } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { markOrganizationAccepted } from '@/services/chits-organization';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';
import { dateFormat } from '@/services/reminder-time';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { SearchField } from '@/components/ui/search-field';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';

type BoardSummary = Board & { columnCount: number; cardCount: number };
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Toast = { message: string; onUndo?: () => void } | null;

const BOARD_ICON_NAMES = new Set(['folder-outline', 'briefcase-outline', 'bulb-outline', 'heart-outline', 'home-outline', 'book-outline', 'paw-outline', 'person-outline', 'star-outline', 'checkbox-outline']);
function boardIconName(icon: string | null): IoniconName { return icon && BOARD_ICON_NAMES.has(icon) ? (icon as IoniconName) : 'folder-outline'; }
function pluralize(count: number, singular: string) { return countLabel(singular, count); }

function preview(message: Message) {
  if (message.isHiddenContent) return tr("index.hiddenChit");
  if (message.text?.trim()) return message.text;
  const attachment = message.attachments[0];
  if (attachment?.type === 'file') return attachment.originalName?.trim() || tr("attachmentexportnaming.attachment");
  if (attachment?.type === 'photo') return tr("id.photo");
  if (attachment?.type === 'video') return tr("addcardattachmentsheet.video");
  if (attachment?.type === 'audio') return tr("messagerow.audioNote");
  return tr("attachmentexportnaming.attachment");
}

function formatDateTime(timestamp: number) {
  return dateFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function VideoThumb({ attachment }: { attachment: Attachment }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const thumbnail = useVideoThumbnail(attachment.storagePath);
  return <View style={[thumbStyles.thumb, { backgroundColor: theme.surfaceElevated }]}>{thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Icon name="videocam-outline" size={20} color={theme.textMuted} />}<View style={thumbStyles.thumbPlay}><Icon name="play" size={11} color="#FFFFFF" /></View></View>;
}

function Thumbnail({ message }: { message: Message }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  if (message.isHiddenContent) return <View accessibilityLabel={tr("unorganized.hiddenContent")} style={[thumbStyles.thumb, { backgroundColor: theme.surfaceElevated }]}><Icon name="eye-off-outline" size={20} color={theme.textMuted} /></View>;
  const attachment = message.attachments[0];
  if (!attachment) return null;
  if (attachment.type === 'photo') return <Image source={resolveAttachmentUri(attachment.storagePath) ?? ''} contentFit="cover" style={thumbStyles.thumb} />;
  if (attachment.type === 'video') return <VideoThumb attachment={attachment} />;
  const iconName: IoniconName = attachment.type === 'audio' ? 'mic-outline' : 'document-outline';
  return <View style={[thumbStyles.thumb, { backgroundColor: theme.surfaceElevated }]}><Icon name={iconName} size={20} color={theme.textMuted} /></View>;
}

const thumbStyles = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbPlay: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});

type ColumnOption = { id: string; name: string };

// `lockedBoard` set (triggered from inside a board, e.g. Board Details) skips board
// selection entirely and opens straight into "Choose a column" for that board — see
// PHASE — CONTEXT-AWARE ADD TO BOARD. `lockedBoard` unset (triggered from
// Unorganized/search/other global actions, where no board is already in scope)
// preserves the original board-first flow, just with a column step appended before
// the item actually lands, so both paths end the same way through `onPickColumn`.
function AddToBoardSheet({ visible, boards, recentBoardIds, selectedCount, forCard, guided, busy, lockedBoard, selectedBoard, columns, columnsLoading, onClose, onSelectBoard, onBackToBoards, onPickColumn, onCreateAndAdd, onCreateColumn }: {
  visible: boolean;
  boards: BoardSummary[];
  recentBoardIds: string[];
  selectedCount: number;
  forCard: boolean;
  guided: boolean;
  busy: boolean;
  lockedBoard: BoardSummary | null;
  selectedBoard: BoardSummary | null;
  columns: ColumnOption[] | null;
  columnsLoading: boolean;
  onClose: () => void;
  onSelectBoard: (board: BoardSummary) => void;
  onBackToBoards: () => void;
  onPickColumn: (columnId: string) => void;
  onCreateAndAdd: (name: string) => Promise<void>;
  onCreateColumn: (name: string) => Promise<void>;
}) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const fonts = useWelcomeFonts();
  const stickySheet = useStickySheet();
  const stickyInner = stickySheet() && { borderWidth: 0, backgroundColor: 'transparent' };
  const [mode, setMode] = useState<'board' | 'board-create' | 'column' | 'column-create'>(lockedBoard ? 'column' : 'board');
  const [search, setSearch] = useState('');
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnError, setColumnError] = useState<string | null>(null);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) { setMode(lockedBoard ? 'column' : 'board'); setSearch(''); setCreateName(''); setCreateError(null); setColumnName(''); setColumnError(null); }
  }

  const close = () => { if (!busy && !creating && !creatingColumn) onClose(); };
  const query = search.trim();
  const filtered = query ? boards.filter((board) => board.name.toLowerCase().includes(query.toLowerCase())) : boards;
  const recentBoards = query ? [] : recentBoardIds.map((id) => boards.find((board) => board.id === id)).filter((board): board is BoardSummary => Boolean(board));

  const beginCreate = (prefill: string) => { setCreateName(prefill); setCreateError(null); setMode('board-create'); };
  const submitCreate = async () => {
    const trimmed = createName.trim();
    if (!trimmed || creating) return;
    setCreating(true); setCreateError(null);
    try { await onCreateAndAdd(trimmed); }
    catch (cause) { setCreateError(cause instanceof Error ? cause.message : tr("unorganized.chitsCouldNotCreateThatBoard")); }
    finally { setCreating(false); }
  };

  const pickBoard = (board: BoardSummary) => { setMode('column'); onSelectBoard(board); };
  const backToBoards = () => { setMode('board'); onBackToBoards(); };
  const beginCreateColumn = () => { setColumnName(''); setColumnError(null); setMode('column-create'); };
  const submitCreateColumn = async () => {
    const trimmed = columnName.trim();
    if (!trimmed || creatingColumn) return;
    setCreatingColumn(true); setColumnError(null);
    try { await onCreateColumn(trimmed); setMode('column'); }
    catch (cause) { setColumnError(cause instanceof Error ? cause.message : tr("unorganized.chitsCouldNotCreateThatColumn")); }
    finally { setCreatingColumn(false); }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={sheetStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("attachments.close")} style={StyleSheet.absoluteFill} onPress={close} />
      <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[sheetStyles.sheetSafeArea, { backgroundColor: theme.surface }, stickySheet()]}>
        <GlassSurface style={[sheetStyles.sheet, { borderColor: theme.borderSubtle }, stickyInner]}>
          <View style={[sheetStyles.handle, { backgroundColor: theme.borderSubtle }]} />
          {guided ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingBottom: 3 }}><OnboardingMascot size={36} accessible={false} /><AppText style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{mode === "column" || mode === 'column-create' ? tr("unorganized.chitsWhichColumn") : tr("unorganized.chitsWhichBoardShouldThisGoTo")}</AppText></View> : null}
          {mode === 'board-create' ? <>
            <View style={sheetStyles.headerRow}>
              <HeaderIconButton label={tr("unorganized.back")} onPress={() => setMode('board')}><HeaderIcon name="chevron-back" size={24} /></HeaderIconButton>
              <AppText accessibilityRole="header" family={fonts.display} style={[sheetStyles.title, { color: theme.textPrimary }]}>{tr("index.newBoard")}</AppText>
              <View style={sheetStyles.headerSpacer} />
            </View>
            <View style={sheetStyles.createBody}>
              <AppText style={[sheetStyles.label, { color: theme.textSecondary }]}>{tr("index.boardName")}</AppText>
              <TextInput autoFocus value={createName} onChangeText={(value) => { setCreateName(value); setCreateError(null); }} placeholder={tr("unorganized.eGTravel")} placeholderTextColor={theme.textMuted} maxLength={80} returnKeyType="done" onSubmitEditing={() => void submitCreate()} style={[sheetStyles.nameInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]} />
              {createError ? <AppText accessibilityRole="alert" style={[sheetStyles.error, { color: theme.danger }]}>{createError}</AppText> : null}
              <Pressable accessibilityRole="button" disabled={!createName.trim() || creating} onPress={() => void submitCreate()} style={[sheetStyles.primaryButton, { backgroundColor: theme.accent }, (!createName.trim() || creating) && sheetStyles.disabled]}>
                <AppText style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{creating ? tr("index.creating") : tr("unorganized.createAndAddValue", { value1: pluralize(selectedCount, 'note') })}</AppText>
              </Pressable>
            </View>
          </> : mode === "column" || mode === 'column-create' ? <>
            <View style={sheetStyles.headerRow}>
              {lockedBoard ? null : <HeaderIconButton label={tr("unorganized.back")} onPress={mode === 'column-create' ? () => setMode('column') : backToBoards}><HeaderIcon name="chevron-back" size={24} /></HeaderIconButton>}
              <View style={sheetStyles.headerCopy}>
                <AppText accessibilityRole="header" family={fonts.display} style={[sheetStyles.title, { color: theme.textPrimary }]}>{mode === 'column-create' ? tr("unorganized.newColumn") : tr("unorganized.chooseAColumn")}</AppText>
                <AppText style={[sheetStyles.subtitle, { color: theme.textSecondary }]}>{mode === 'column-create' ? tr("unorganized.addAColumnToValue", { value1: selectedBoard?.name ?? tr("unorganized.thisBoard2") }) : tr('unorganized.placeSelected', { board: selectedBoard?.name ?? tr('unorganized.thisBoard'), notes: countLabel('note', selectedCount) })}</AppText>
              </View>
              <HeaderIconButton label={tr("attachments.close")} onPress={close}><HeaderIcon name="close" size={22} /></HeaderIconButton>
            </View>

            {mode === 'column-create' ? (
              <View style={sheetStyles.createBody}>
                <AppText style={[sheetStyles.label, { color: theme.textSecondary }]}>{tr("unorganized.columnName")}</AppText>
                <TextInput autoFocus value={columnName} onChangeText={(value) => { setColumnName(value); setColumnError(null); }} placeholder={tr("unorganized.eGToDo")} placeholderTextColor={theme.textMuted} maxLength={60} returnKeyType="done" onSubmitEditing={() => void submitCreateColumn()} style={[sheetStyles.nameInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]} />
                {columnError ? <AppText accessibilityRole="alert" style={[sheetStyles.error, { color: theme.danger }]}>{columnError}</AppText> : null}
                <Pressable accessibilityRole="button" disabled={!columnName.trim() || creatingColumn} onPress={() => void submitCreateColumn()} style={[sheetStyles.primaryButton, { backgroundColor: theme.accent }, (!columnName.trim() || creatingColumn) && sheetStyles.disabled]}>
                  <AppText style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{creatingColumn ? tr("index.creating") : tr("unorganized.createColumn")}</AppText>
                </Pressable>
              </View>
            ) : columnsLoading ? (
              <View style={sheetStyles.emptyWrap}><ChitsLoader size="small" /></View>
            ) : !columns || columns.length === 0 ? (
              <View style={sheetStyles.emptyWrap}>
                <View style={[sheetStyles.emptyMark, { backgroundColor: theme.accentSoft }]}><Icon name="albums-outline" size={28} color={theme.accentStrong} /></View>
                <AppText style={[sheetStyles.emptyTitle, { color: theme.textPrimary }]}>{tr("unorganized.noColumnsYet")}</AppText>
                <AppText style={[sheetStyles.emptyDescription, { color: theme.textSecondary }]}>{selectedBoard?.name ?? tr("unorganized.thisBoard")} {' '}{tr("unorganized.doesnTHaveAColumnYet")}</AppText>
                <Pressable accessibilityRole="button" onPress={beginCreateColumn} style={[sheetStyles.primaryButton, sheetStyles.emptyPrimary, { backgroundColor: theme.accent }]}>
                  <AppText style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{tr("unorganized.createColumn")}</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={close} style={sheetStyles.emptyCancel}>
                  <AppText style={[sheetStyles.secondaryText, { color: theme.textSecondary }]}>{tr("chat.cancel")}</AppText>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={sheetStyles.listContent}>
                {columns.map((column) => <ColumnRow key={column.id} name={column.name} disabled={busy} onPress={() => onPickColumn(column.id)} />)}
              </ScrollView>
            )}
          </> : <>
            <View style={sheetStyles.headerRow}>
              <View style={sheetStyles.headerCopy}>
                <AppText accessibilityRole="header" family={fonts.display} style={[sheetStyles.title, { color: theme.textPrimary }]}>{forCard ? tr("unorganized.addToCard") : tr("index.addToBoard")}</AppText>
                <AppText style={[sheetStyles.subtitle, { color: theme.textSecondary }]}>{tr('unorganized.organizeSelected', { notes: countLabel('note', selectedCount) })}</AppText>
              </View>
              <HeaderIconButton label={tr("attachments.close")} onPress={close}><HeaderIcon name="close" size={22} /></HeaderIconButton>
            </View>

            {boards.length === 0 ? (
              <View style={sheetStyles.emptyWrap}>
                <View style={[sheetStyles.emptyMark, { backgroundColor: theme.accentSoft }]}><Icon name="folder-outline" size={28} color={theme.accentStrong} /></View>
                <AppText style={[sheetStyles.emptyTitle, { color: theme.textPrimary }]}>{tr("unorganized.noBoardsYet")}</AppText>
                <AppText style={[sheetStyles.emptyDescription, { color: theme.textSecondary }]}>{tr("unorganized.createYourFirstBoardToStartOrganizingYour")}</AppText>
                <Pressable accessibilityRole="button" onPress={() => beginCreate('')} style={[sheetStyles.primaryButton, sheetStyles.emptyPrimary, { backgroundColor: theme.accent }]}>
                  <AppText style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{tr("unorganized.createABoard")}</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={close} style={sheetStyles.emptyCancel}>
                  <AppText style={[sheetStyles.secondaryText, { color: theme.textSecondary }]}>{tr("chat.cancel")}</AppText>
                </Pressable>
              </View>
            ) : <>
              <SearchField accessibilityLabel={tr("unorganized.searchBoards")} value={search} onChangeText={setSearch} placeholder={tr("unorganized.searchBoards")} style={sheetStyles.searchRow} />

              <Pressable accessibilityRole="button" onPress={() => beginCreate(query)} style={[sheetStyles.createRow, { borderColor: theme.borderSubtle }]}>
                <View style={[sheetStyles.createMark, { backgroundColor: theme.accentSoft }]}><Icon name="add" size={18} color={theme.accentStrong} /></View>
                <AppText style={[sheetStyles.createLabel, { color: theme.textPrimary }]}>{tr("unorganized.createNewBoard")}</AppText>
              </Pressable>

              <View style={sheetStyles.listWrap}>
                {query && filtered.length === 0 ? (
                  <View style={sheetStyles.noResults}>
                    <AppText style={[sheetStyles.noResultsText, { color: theme.textSecondary }]}>{tr("unorganized.noBoardsFoundFor")}{query}”</AppText>
                    <Pressable accessibilityRole="button" onPress={() => beginCreate(query)} style={[sheetStyles.primaryButton, { backgroundColor: theme.accent }]}>
                      <AppText style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{tr("unorganized.create")}{query}”</AppText>
                    </Pressable>
                  </View>
                ) : (
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={sheetStyles.listContent}>
                    {recentBoards.length > 0 ? <>
                      <AppText style={[sheetStyles.sectionLabel, { color: theme.textMuted }]}>{tr("unorganized.recent")}</AppText>
                      {recentBoards.map((board) => <BoardRow key={`recent-${board.id}`} board={board} disabled={busy} onPress={() => pickBoard(board)} />)}
                      <AppText style={[sheetStyles.sectionLabel, { color: theme.textMuted }]}>{tr("unorganized.allBoards")}</AppText>
                    </> : null}
                    {filtered.map((board) => <BoardRow key={board.id} board={board} disabled={busy} onPress={() => pickBoard(board)} />)}
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

/**
 * Merge — several selected thoughts become one card. Same sheet as Add to
 * board (handle, header with close, board rows), in two steps: pick a board,
 * then its column and an optional title. Back returns to the board list.
 */
function MergeSheet({ visible, boards, recentBoardIds, count, busy, error, onClose, onLoadColumns, onMerge }: {
  visible: boolean;
  boards: BoardSummary[];
  recentBoardIds: string[];
  count: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onLoadColumns: (board: BoardSummary) => Promise<ColumnOption[]>;
  onMerge: (board: BoardSummary, columnId: string, title: string) => void;
}) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const fonts = useWelcomeFonts();
  const stickySheet = useStickySheet();
  const stickyInner = stickySheet() && { borderWidth: 0, backgroundColor: 'transparent' };
  const [board, setBoard] = useState<BoardSummary | null>(null);
  const [columns, setColumns] = useState<ColumnOption[] | null>(null);
  const [columnId, setColumnId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) { setBoard(null); setColumns(null); setColumnId(null); setTitle(''); setSearch(''); }
  }

  const close = () => { if (!busy) onClose(); };
  const heading = tr('common.mergeNotes', { notes: countLabel('thought', count) });
  const query = search.trim();
  const filtered = query ? boards.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) : boards;
  const recentBoards = query ? [] : recentBoardIds.map((id) => boards.find((item) => item.id === id)).filter((item): item is BoardSummary => Boolean(item));
  const pickBoard = (next: BoardSummary) => {
    setBoard(next); setColumns(null); setColumnId(null);
    void onLoadColumns(next).then((loaded) => { setColumns(loaded); setColumnId(loaded[0]?.id ?? null); }, () => setColumns([]));
  };
  const canMerge = Boolean(board && columnId) && !busy;

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={sheetStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("attachments.close")} style={StyleSheet.absoluteFill} onPress={close} />
      <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[sheetStyles.sheetSafeArea, { backgroundColor: theme.surface }, stickySheet()]}>
        <GlassSurface style={[sheetStyles.sheet, { borderColor: theme.borderSubtle }, stickyInner]}>
          <View style={[sheetStyles.handle, { backgroundColor: theme.borderSubtle }]} />
          <View style={sheetStyles.headerRow}>
            {board ? <HeaderIconButton label={tr("unorganized.backToBoards")} onPress={() => setBoard(null)}><HeaderIcon name="chevron-back" size={24} /></HeaderIconButton> : null}
            <View style={sheetStyles.headerCopy}>
              <AppText accessibilityRole="header" family={fonts.display} style={[sheetStyles.title, { color: theme.textPrimary }]}>{heading}</AppText>
              <AppText style={[sheetStyles.subtitle, { color: theme.textSecondary }]}>{board ? tr("unorganized.intoValueChooseAColumnAndATitle", { value1: board.name }) : tr("unorganized.theyLlBecomeOneCardInTheOrder")}</AppText>
            </View>
            <HeaderIconButton label={tr("attachments.close")} onPress={close}><HeaderIcon name="close" size={22} /></HeaderIconButton>
          </View>

          {!board ? (boards.length === 0 ? (
            <View style={sheetStyles.emptyWrap}>
              <View style={[sheetStyles.emptyMark, { backgroundColor: theme.accentSoft }]}><Icon name="folder-outline" size={28} color={theme.accentStrong} /></View>
              <AppText style={[sheetStyles.emptyTitle, { color: theme.textPrimary }]}>{tr("unorganized.noBoardsYet")}</AppText>
              <AppText style={[sheetStyles.emptyDescription, { color: theme.textSecondary }]}>{tr("unorganized.createABoardWithAddToBoardFirst")}</AppText>
              <Pressable accessibilityRole="button" onPress={close} style={sheetStyles.emptyCancel}>
                <AppText style={[sheetStyles.secondaryText, { color: theme.textSecondary }]}>{tr("chat.cancel")}</AppText>
              </Pressable>
            </View>
          ) : <>
            <SearchField accessibilityLabel={tr("unorganized.searchBoards")} value={search} onChangeText={setSearch} placeholder={tr("unorganized.searchBoards")} style={sheetStyles.searchRow} />
            <View style={sheetStyles.listWrap}>
              {query && filtered.length === 0 ? (
                <View style={sheetStyles.noResults}><AppText style={[sheetStyles.noResultsText, { color: theme.textSecondary }]}>{tr("unorganized.noBoardsFoundFor")}{query}”</AppText></View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={sheetStyles.listContent}>
                  {recentBoards.length > 0 ? <>
                    <AppText style={[sheetStyles.sectionLabel, { color: theme.textMuted }]}>{tr("unorganized.recent")}</AppText>
                    {recentBoards.map((item) => <BoardRow key={`recent-${item.id}`} board={item} disabled={busy} onPress={() => pickBoard(item)} />)}
                    <AppText style={[sheetStyles.sectionLabel, { color: theme.textMuted }]}>{tr("unorganized.allBoards")}</AppText>
                  </> : null}
                  {filtered.map((item) => <BoardRow key={item.id} board={item} disabled={busy} onPress={() => pickBoard(item)} />)}
                </ScrollView>
              )}
            </View>
          </>) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={mergeStyles.body}>
              <AppText style={[sheetStyles.label, { color: theme.textSecondary }]}>{tr("id.column")}</AppText>
              {columns === null ? <View style={mergeStyles.loading}><ChitsLoader size="small" /></View>
                : columns.length === 0 ? <AppText style={[mergeStyles.note, { color: theme.textSecondary }]}>{board.name} {' '}{tr("unorganized.doesnTHaveAColumnYetAddOne")}</AppText>
                : <View accessibilityRole="radiogroup" accessibilityLabel={tr("id.column")} style={mergeStyles.chips}>
                  {columns.map((column) => {
                    const selected = column.id === columnId;
                    return <Pressable
                      key={column.id}
                      accessibilityRole="radio"
                      accessibilityLabel={column.name}
                      accessibilityState={{ selected }}
                      onPress={() => setColumnId(column.id)}
                      // Same border width either way, so choosing a column never shifts the row.
                      style={({ pressed }) => [mergeStyles.chip, { borderColor: selected ? theme.accent : theme.borderSubtle, backgroundColor: selected ? theme.accentSoft : 'transparent' }, pressed && sheetStyles.pressed]}>
                      {selected ? <Icon name="checkmark" size={15} color={theme.accentStrong} /> : null}
                      <AppText numberOfLines={1} style={[mergeStyles.chipText, { color: selected ? theme.accentStrong : theme.textPrimary }]}>{column.name}</AppText>
                    </Pressable>;
                  })}
                </View>}

              <AppText style={[sheetStyles.label, mergeStyles.titleLabel, { color: theme.textSecondary }]}>{tr("id.cardTitle")}</AppText>
              <TextInput value={title} onChangeText={setTitle} placeholder={tr("unorganized.optionalEGTripIdeas")} placeholderTextColor={theme.textMuted} selectionColor={theme.accent} maxLength={120} returnKeyType="done" onSubmitEditing={() => { if (canMerge && board && columnId) onMerge(board, columnId, title); }} style={[sheetStyles.nameInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]} />
              {error ? <AppText accessibilityRole="alert" style={[sheetStyles.error, mergeStyles.error, { color: theme.danger }]}>{error}</AppText> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canMerge }} disabled={!canMerge} onPress={() => { if (board && columnId) onMerge(board, columnId, title); }} style={[sheetStyles.primaryButton, mergeStyles.submit, { backgroundColor: theme.accent }, !canMerge && sheetStyles.disabled]}>
                <AppText style={[sheetStyles.primaryButtonText, { color: theme.accentText }]}>{busy ? tr("unorganized.merging") : tr("unorganized.createMergedCard")}</AppText>
              </Pressable>
            </ScrollView>
          )}
        </GlassSurface>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

function BoardRow({ board, disabled, onPress }: { board: BoardSummary; disabled: boolean; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme, styleTokens } = useTheme();
  const { rowStyle, isRTL } = useDirection();
  const fonts = useWelcomeFonts();
  const accent = board.accent ?? theme.accent;
  const { cardTint: paper, cardInkMuted: muted } = noteColors(accent);
  return <PaperCard paper={paper} accessibilityRole="button" accessibilityLabel={`${board.name}. ${pluralize(board.cardCount, 'note')}.`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[sheetStyles.boardRow, rowStyle, { borderRadius: styleTokens.button.radius }, disabled && sheetStyles.disabled]}>
    <View style={[sheetStyles.boardMark, { backgroundColor: mix(paper, PAPER_WHITE, 0.55) }]}><Icon name={boardIconName(board.icon)} size={19} color={mix(accent, PAPER_INK, 0.4)} /></View>
    <View style={sheetStyles.boardCopy}>
      <AppText family={fonts.display} numberOfLines={2} style={[sheetStyles.boardName, { color: PAPER_INK }]}>{board.name}</AppText>
      <AppText family={fonts.text} style={[sheetStyles.boardDetail, { color: muted }]}>{pluralize(board.cardCount, 'note')}</AppText>
    </View>
    <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={19} color={muted} />
  </PaperCard>;
}

function ColumnRow({ name, disabled, onPress }: { name: string; disabled: boolean; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { scheme, styleTokens } = useTheme();
  const desk = useDesk();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const { rowStyle, isRTL } = useDirection();
  const fonts = useWelcomeFonts();
  return <PaperCard paper={surfaces.card} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[sheetStyles.boardRow, rowStyle, { borderRadius: styleTokens.button.radius }, disabled && sheetStyles.disabled]}>
    <View style={[sheetStyles.boardMark, { backgroundColor: surfaces.control }]}><Icon name="albums-outline" size={19} color={surfaces.inkMuted} /></View>
    <View style={sheetStyles.boardCopy}>
      <AppText family={fonts.display} numberOfLines={2} style={[sheetStyles.boardName, { color: surfaces.ink }]}>{name}</AppText>
    </View>
    <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={19} color={surfaces.inkMuted} />
  </PaperCard>;
}

export default function UnorganizedScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { tokens: theme, scheme, styleTokens } = useTheme();
  const desk = useDesk();
  const handwriting = useHandwriting();
  const fonts = useWelcomeFonts();
  const { rowStyle } = useDirection();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { addToCard, messageId, boardId, openBoardPicker, chitsGuided } = useLocalSearchParams<{ addToCard?: string; messageId?: string; boardId?: string; openBoardPicker?: string; chitsGuided?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [recentBoardIds, setRecentBoardIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  // A single thought launched from the Cards menu starts in the existing board
  // picker. The sheet waits until load() has resolved boards and selection.
  const [sheetOpen, setSheetOpen] = useState(() => openBoardPicker === '1' && Boolean(messageId));
  // The board this "Add to board" pass targets: pinned to the triggering board when
  // `boardId` arrives (e.g. from Board Details, which already has board context and
  // should skip straight to column selection), otherwise set once the user picks a
  // board from the generic list — see PHASE — CONTEXT-AWARE ADD TO BOARD.
  const contextBoard = boardId ? boards.find((board) => board.id === boardId) ?? null : null;
  const [sheetBoard, setSheetBoard] = useState<BoardSummary | null>(null);
  const [sheetColumns, setSheetColumns] = useState<ColumnOption[] | null>(null);
  const [sheetColumnsLoading, setSheetColumnsLoading] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionMode = selected.length > 0;
  const [ready, setReady] = useState(false);
  // The loader also covers the moment the handwriting takes, so the list never reflows.
  const showLoader = useChitsLoading(!ready || !handwriting.ready);

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
      showToast(tr('common.archivedNotes', { notes: countLabel('note', ids.length) }), () => void undoArchive(ids));
    } catch { setError(tr("unorganized.chitsCouldNotArchiveThoseThoughts")); }
    finally { setWorking(false); }
  };
  const undoArchive = async (ids: string[]) => {
    setWorking(true);
    try { for (const id of ids) await createMessageRepository(database).restore(id); await load(); }
    finally { setWorking(false); setToast(null); }
  };

  // Redirect straight to the destination board/column once the add is fully
  // persisted (see PHASE — REDIRECT TO BOARD AFTER ADDING UNORGANIZED ITEM) — the
  // board screen picks up highlightColumnId/highlightCardId to activate the right
  // column and briefly highlight the (first, for a batch) newly added card. Back
  // naturally returns to Unorganized since this is a push, not a replace.
  const goToDestination = (boardId: string, columnId: string | null, cardIds: string[]) => {
    const params = new URLSearchParams();
    if (columnId) params.set('highlightColumnId', columnId);
    if (cardIds[0]) params.set('highlightCardId', cardIds[0]);
    const query = params.toString();
    router.push(`/board/${boardId}${query ? `?${query}` : ''}`);
  };
  // Loads the columns for whichever board is now in play for the sheet — either the
  // locked context board (opened immediately) or a board the user just picked from
  // the generic list — so the sheet can move on to "Choose a column" either way.
  const loadColumnsFor = useCallback(async (board: BoardSummary) => {
    setSheetBoard(board); setSheetColumns(null); setSheetColumnsLoading(true);
    try { setSheetColumns(await createBoardRepository(database).listColumns(board.id)); }
    finally { setSheetColumnsLoading(false); }
  }, [database]);
  const openAddToBoardSheet = () => {
    if (contextBoard) void loadColumnsFor(contextBoard);
    else { setSheetBoard(null); setSheetColumns(null); }
    setSheetOpen(true);
  };
  const onBackToBoards = () => { setSheetBoard(null); setSheetColumns(null); };
  const onPickColumn = async (columnId: string) => {
    if (!sheetBoard) return;
    setWorking(true); setError(null);
    try {
      const { cardIds } = await createBoardRepository(database).organizeMessages(sheetBoard.id, selected, columnId);
      await createBoardRepository(database).markOpened('board', sheetBoard.id);
      setSheetOpen(false); setSelected([]);
      if (chitsGuided === '1' && cardIds.length) {
        const first = await markOrganizationAccepted(database, 'board').catch(() => false);
        router.dismissTo({ pathname: '/chat', params: { chitsOrganized: 'board', chitsRelationship: first ? '1' : undefined } });
      } else goToDestination(sheetBoard.id, columnId, cardIds);
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("unorganized.couldnTAddToBoardTryAgain")); }
    finally { setWorking(false); }
  };
  const onCreateColumn = async (name: string) => {
    if (!sheetBoard) return;
    await createBoardRepository(database).addColumn(sheetBoard.id, name);
    await loadColumnsFor(sheetBoard);
  };
  const createBoardAndOrganize = async (name: string) => {
    const board = await createBoardRepository(database).create({ name });
    const { cardIds, columnId } = await createBoardRepository(database).organizeMessages(board.id, selected);
    setSheetOpen(false); setSelected([]);
    if (chitsGuided === '1' && cardIds.length) {
      const first = await markOrganizationAccepted(database, 'board').catch(() => false);
      router.dismissTo({ pathname: '/chat', params: { chitsOrganized: 'board', chitsRelationship: first ? '1' : undefined } });
    } else goToDestination(board.id, columnId, cardIds);
  };
  const addToExistingCard = async () => {
    if (!addToCard) return;
    setWorking(true); setError(null);
    try { await createBoardRepository(database).addMessagesToCard(addToCard, selected); await load(); router.replace(`/card/${addToCard}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("unorganized.chitsCouldNotAddThoseThoughtsToThis")); }
    finally { setWorking(false); }
  };
  const merge = async (board: Board, columnId: string, title: string) => {
    setWorking(true); setError(null);
    try { const cardId = await createBoardRepository(database).mergeMessages({ boardId: board.id, columnId, messageIds: selected, title }); setMergeOpen(false); setSelected([]); await load(); router.replace(`/card/${cardId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("unorganized.chitsCouldNotMergeThoseThoughts")); }
    finally { setWorking(false); }
  };

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader showTitle={false} title={tr("index.unorganized")} leading={<IconButton label={tr("search.goBack")} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <PaperDesk faint>
    <View style={styles.intro}>
      <View style={[styles.introHeading, rowStyle]}>
        <View style={[styles.introMark, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}><Icon name="file-tray-outline" size={20} color={surfaces.ink} /></View>
        <View style={styles.messageCopy}>
          <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, { color: desk.ink }]}>{tr("index.unorganized")}</AppText>
          <AppText family={fonts.text} style={[styles.introCount, { color: desk.inkMuted }]}>{ready ? pluralize(messages.length, 'note') : '\u00a0'}</AppText>
        </View>
      </View>
      <AppText family={fonts.text} style={[styles.introBody, { color: desk.inkMuted }]}>{addToCard ? tr("unorganized.selectThoughtsToAttachToThisCardYour") : tr("unorganized.notesThatHavenTBeenAddedToA")}</AppText>
    </View>
    {selectionMode ? (
      <View style={[styles.header, rowStyle, { borderBottomColor: desk.rule }]}>
        <HeaderIconButton label={tr("unorganized.exitSelection")} onPress={() => setSelected([])}><HeaderIcon name="close" size={22} /></HeaderIconButton>
        <AppText family={fonts.display} style={[styles.selectionTitle, { color: desk.ink }]}>{selected.length} {' '}{tr("unorganized.selected")}</AppText>
        <Pressable accessibilityRole="button" onPress={toggleSelectAll} style={[styles.selectAllHit, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}><AppText family={fonts.textBold} style={[styles.selectAllText, { color: desk.ink }]}>{selected.length === messages.length ? tr("unorganized.deselectAll") : tr("unorganized.selectAll")}</AppText></Pressable>
      </View>
    ) : null}
    {!ready || !handwriting.ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : messages.length ? <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {messages.map((message) => {
          const isSelected = selected.includes(message.id);
          const messagePreview = preview(message);
          const dateLabel = formatDateTime(message.createdAt);
          return <PaperCard key={message.id} paper={isSelected ? surfaces.control : surfaces.card} accessibilityRole="checkbox" accessibilityLabel={`${messagePreview}. ${dateLabel}`} accessibilityState={{ checked: isSelected }} onPress={() => toggle(message.id)} style={[styles.message, rowStyle, { borderRadius: styleTokens.button.radius, borderColor: isSelected ? surfaces.action : 'transparent' }]}>
            <Icon name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={isSelected ? surfaces.ink : surfaces.inkMuted} />
            <Thumbnail message={message} />
            <View style={styles.messageCopy}>
              <AppText family={fonts.text} numberOfLines={2} ellipsizeMode="tail" style={[styles.messageText, { color: surfaces.ink }]}>{messagePreview}</AppText>
              <View style={[styles.metadata, rowStyle]}>
                {message.pinned ? <Icon accessibilityLabel={tr("unorganized.pinned")} name="pin" size={12} color={surfaces.inkMuted} /> : null}
                <AppText family={fonts.text} numberOfLines={1} style={[styles.messageMeta, { color: surfaces.inkMuted }]}>{dateLabel}</AppText>
              </View>
            </View>
          </PaperCard>;
        })}
      </ScrollView>
      {selectionMode ? (
        <Animated.View entering={reduced ? undefined : SlideInDown.springify().damping(20).mass(0.6)} exiting={reduced ? undefined : SlideOutDown.duration(160)} style={[styles.actionBar, { backgroundColor: surfaces.paper, paddingBottom: Math.max(insets.bottom, spacing.sm), borderTopColor: desk.rule, boxShadow: `0px -3px 8px ${desk.shadow}` }]}>
          <View style={[styles.actionButtons, rowStyle]}>
            {!addToCard ? <Pressable disabled={selected.length < 2 || working} accessibilityRole="button" accessibilityState={{ disabled: selected.length < 2 || working }} onPress={() => { setError(null); setMergeOpen(true); }} style={[styles.textAction, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}><AppText family={fonts.textBold} style={[styles.actionText, { color: surfaces.ink }, (selected.length < 2 || working) && styles.disabledText]}>{tr("unorganized.merge")}</AppText></Pressable> : null}
            <Pressable disabled={working} accessibilityRole="button" accessibilityState={{ disabled: working }} onPress={() => void archive()} style={[styles.textAction, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}><AppText family={fonts.textBold} style={[styles.actionText, { color: desk.danger }, working && styles.disabledText]}>{tr("archive.archive")}</AppText></Pressable>
            <PaperButton paper={surfaces.action} accessibilityRole="button" disabled={working} onPress={() => { if (addToCard) void addToExistingCard(); else openAddToBoardSheet(); }} containerStyle={styles.primaryContainer} style={[styles.primaryPill, { borderRadius: styleTokens.button.radius }]}>
              <AppText family={fonts.display} style={[styles.primaryPillText, { color: surfaces.onAction }]}>{addToCard ? tr("unorganized.addToCard") : tr("index.addToBoard")}</AppText>
            </PaperButton>
          </View>
        </Animated.View>
      ) : null}
    </> : <EmptyState title={tr("unorganized.youReAllOrganized")} description={tr("unorganized.notesThatHavenTBeenAddedToA2")} />}
    </PaperDesk>
    {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
    {toast ? <View pointerEvents="box-none" accessibilityLiveRegion="polite" style={styles.toastWrap}>
      <View style={[styles.toast, { backgroundColor: theme.textPrimary }]}>
        <AppText style={[styles.toastText, { color: theme.background }]}>{toast.message}</AppText>
        {toast.onUndo ? <Pressable accessibilityRole="button" hitSlop={8} onPress={toast.onUndo}><AppText style={[styles.toastUndo, { color: theme.background }]}>{tr("unorganized.undo")}</AppText></Pressable> : null}
      </View>
    </View> : null}

    <AddToBoardSheet
      visible={sheetOpen && ready && selected.length > 0}
      boards={boards}
      recentBoardIds={recentBoardIds}
      selectedCount={selected.length}
      forCard={Boolean(addToCard)}
      guided={chitsGuided === '1'}
      busy={working}
      lockedBoard={contextBoard}
      selectedBoard={sheetBoard}
      columns={sheetColumns}
      columnsLoading={sheetColumnsLoading}
      onClose={() => setSheetOpen(false)}
      onSelectBoard={(board) => void loadColumnsFor(board)}
      onBackToBoards={onBackToBoards}
      onPickColumn={(columnId) => void onPickColumn(columnId)}
      onCreateAndAdd={createBoardAndOrganize}
      onCreateColumn={onCreateColumn}
    />

    <MergeSheet
      visible={mergeOpen}
      boards={boards}
      recentBoardIds={recentBoardIds}
      count={selected.length}
      busy={working}
      error={mergeOpen ? error : null}
      onClose={() => setMergeOpen(false)}
      onLoadColumns={(board) => createBoardRepository(database).listColumns(board.id)}
      onMerge={(board, columnId, title) => void merge(board, columnId, title)}
    />
  </Screen>;
}

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  header: { minHeight: 48, alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.xxs, borderBottomWidth: StyleSheet.hairlineWidth },
  selectionTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21 },
  selectAllHit: { minHeight: 44, maxWidth: '50%', flexShrink: 1, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  selectAllText: { fontSize: 14, lineHeight: 19 },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 10 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  introHeading: { alignItems: 'center', gap: spacing.sm },
  introMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 23, lineHeight: 27 },
  introCount: { fontSize: 13, lineHeight: 18 },
  introBody: { fontSize: 14, lineHeight: 20 },
  message: { minHeight: 64, alignItems: 'center', gap: 10, paddingHorizontal: spacing.sm, paddingVertical: 10, borderWidth: 1.5 },
  messageCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  messageText: { fontSize: 16, lineHeight: 22 },
  metadata: { alignItems: 'center', gap: 5, marginTop: 3 },
  messageMeta: { flexShrink: 1, fontSize: 12, lineHeight: 17 },
  // Actions wrap below the notes rather than squeezing translated labels.
  actionBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  actionButtons: { flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  textAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  actionText: { fontSize: 14, lineHeight: 19 },
  primaryContainer: { flexGrow: 1, flexShrink: 1, minWidth: 136, maxWidth: '100%' },
  primaryPill: { minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  primaryPillText: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  disabled: { opacity: 0.42 },
  disabledText: { opacity: 0.42 },
  error: { color: '#fff', backgroundColor: tokens.danger, padding: spacing.sm, textAlign: 'center' },
  toastWrap: { position: 'absolute', right: 0, bottom: 96, left: 0, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  toastText: { fontSize: 14, fontWeight: '600' },
  toastUndo: { fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
});

const mergeStyles = StyleSheet.create({
  body: { paddingTop: spacing.xs, paddingBottom: spacing.md },
  loading: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  note: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: 12, borderWidth: 1.5 },
  chipText: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  titleLabel: { marginTop: spacing.md },
  error: { marginTop: spacing.xs },
  submit: { marginTop: spacing.md },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  sheetSafeArea: { flexShrink: 1, maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: spacing.xs, marginBottom: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  headerCopy: { flex: 1, minWidth: 0 },
  headerSpacer: { width: 44 },
  title: { flexShrink: 1, fontSize: 20, lineHeight: 25, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs, marginBottom: spacing.xxs },
  searchRow: { marginTop: spacing.xs, marginBottom: spacing.xs },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, marginTop: spacing.xs, marginBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  createMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  createLabel: { fontSize: 15, fontWeight: '600' },
  listWrap: { flexShrink: 1 },
  listContent: { paddingTop: spacing.xs, paddingBottom: spacing.md, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: spacing.sm, marginBottom: spacing.xxs },
  boardRow: { minHeight: 64, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  boardMark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  boardCopy: { flex: 1, minWidth: 0 },
  boardName: { fontSize: 17, lineHeight: 22 },
  boardDetail: { fontSize: 13, lineHeight: 17, marginTop: 2 },
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
  primaryButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginTop: spacing.xs },
  primaryButtonText: { fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.42 },
});
