import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { GlassSurface } from '@/components/ui/glass-surface';
import { AppHeader, IconButton, Screen } from '@/components/ui/primitives';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';
import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
import { radii, spacing } from '@/constants/theme';
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
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [unorganizedCount, setUnorganizedCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<BoardIconName | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chatButtonHeight, setChatButtonHeight] = useState(56);
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
  };

  // Boards is home; Chat is one tap away via the persistent pill below rather than
  // a header action, per the product split (Boards = workspace, Chat = capture).
  const openChat = () => {
    void Haptics.selectionAsync();
    router.navigate('/chat');
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
    <Screen style={{ backgroundColor: theme.background }}>
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
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: chatButtonHeight + spacing.lg }]}>
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Chat"
        accessibilityHint="Open Chat to capture a new thought."
        onLayout={(event) => setChatButtonHeight(Math.ceil(event.nativeEvent.layout.height))}
        onPress={openChat}
        style={({ pressed }) => [styles.chatButton, { backgroundColor: theme.accent }, pressed && styles.chatButtonPressed]}
      >
        <Ionicons accessible={false} name="chatbubble-outline" size={19} color={theme.accentText} />
        <Text style={[styles.chatButtonText, { color: theme.accentText }]}>Chat to Note</Text>
      </Pressable>

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={closeCreate}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable accessibilityLabel="Close new board" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={closeCreate} />
          <SafeAreaView
            edges={['bottom']}
            accessibilityViewIsModal
            style={[styles.sheetSafeArea, { backgroundColor: theme.surface }]}
          >
            <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
              <ScrollView
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetContent}
              >
                <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
                <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.textPrimary }]}>New board</Text>
                <Text style={[styles.sheetIntro, { color: theme.textSecondary }]}>Give this collection a clear, memorable name.</Text>

                <Text style={[styles.label, { color: theme.textSecondary }]}>Board name</Text>
                <TextInput
                  autoFocus
                  accessibilityLabel="Board name"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError(null);
                  }}
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
              </ScrollView>
            </GlassSurface>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
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
  // Compact floating pill, not a full-width bar or a giant circular FAB — content-
  // driven width, centered, sitting above Screen's own safe-area inset padding.
  chatButton: { position: 'absolute', alignSelf: 'center', bottom: spacing.md, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radii.pill, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  chatButtonPressed: { opacity: 0.86, transform: [{ scale: 0.96 }] },
  chatButtonText: { fontSize: 15, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  sheetSafeArea: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth },
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
