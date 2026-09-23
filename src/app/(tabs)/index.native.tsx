import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { AppHeader, IconButton, Screen } from '@/components/ui/primitives';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';
import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Board } from '@/db/types';

type BoardSummary = Board & { columnCount: number; cardCount: number };

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export default function BoardsScreen() {
  const database = useSQLiteContext();
  const boardRepository = useMemo(() => createBoardRepository(database), [database]);
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { openDrawer } = useAppDrawer();
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

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

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

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
      <AppHeader
        title={appTitle}
        subtitle={pluralize(boards.length, 'board')}
        leading={(
          <IconButton label="Open navigation" onPress={openDrawer}>
            <Ionicons accessible={false} name="reorder-two-outline" size={24} color={theme.textPrimary} />
          </IconButton>
        )}
        trailing={(
          <IconButton label="Create board" onPress={openCreate}>
            <Ionicons accessible={false} name="add" size={26} color={theme.textPrimary} />
          </IconButton>
        )}
      />

      {!ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : (
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, flexGrow: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
