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
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { GlassSurface } from '@/components/ui/glass-surface';
import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Board } from '@/db/types';

const ICONS = [
  { name: 'folder-outline' as const, label: 'Folder' },
  { name: 'briefcase-outline' as const, label: 'Briefcase' },
  { name: 'bulb-outline' as const, label: 'Lightbulb' },
  { name: 'heart-outline' as const, label: 'Heart' },
  { name: 'home-outline' as const, label: 'Home' },
  { name: 'book-outline' as const, label: 'Book' },
  { name: 'paw-outline' as const, label: 'Paw' },
  { name: 'person-outline' as const, label: 'Person' },
  { name: 'star-outline' as const, label: 'Star' },
  { name: 'checkbox-outline' as const, label: 'Checklist' },
];

const ACCENTS = [
  { value: null, label: 'Neutral', color: null },
  { value: '#3D6E5C', label: 'Green', color: '#3D6E5C' },
  { value: '#4E639B', label: 'Blue', color: '#4E639B' },
  { value: '#9A5E33', label: 'Orange', color: '#9A5E33' },
  { value: '#765A97', label: 'Purple', color: '#765A97' },
  { value: '#A45E6E', label: 'Rose', color: '#A45E6E' },
] as const;

type BoardSummary = Board & { columnCount: number; cardCount: number };

function boardIcon(icon: string | null) {
  return ICONS.some((choice) => choice.name === icon)
    ? (icon as (typeof ICONS)[number]['name'])
    : 'folder-outline';
}

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
  const [icon, setIcon] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNameValid = Boolean(name.trim());

  const load = useCallback(async () => {
    const [nextBoards, nextCount] = await Promise.all([
      boardRepository.listActive(),
      messageRepository.countUnorganized(),
    ]);
    setBoards(nextBoards);
    setUnorganizedCount(nextCount);
  }, [boardRepository, messageRepository]);

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
        title="Boards"
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

      <ScrollView contentContainerStyle={styles.content}>
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
                      name={boardIcon(board.icon)}
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
            <EmptyState title="No boards yet" description="Create one when a thought needs a more lasting home." />
          </View>
        )}
      </ScrollView>

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
                  placeholder="e.g. FitForge"
                  placeholderTextColor={theme.textMuted}
                  maxLength={80}
                  style={[styles.nameInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]}
                  returnKeyType="done"
                  onSubmitEditing={() => void createBoard()}
                />

                <Text style={[styles.optionalLabel, { color: theme.textMuted }]}>OPTIONAL PERSONALIZATION</Text>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconChoices}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel="No icon"
                    accessibilityState={{ selected: icon === null }}
                    onPress={() => setIcon(null)}
                    style={[
                      styles.iconChoice,
                      { backgroundColor: theme.surfaceElevated },
                      icon === null && { borderColor: theme.accentStrong, backgroundColor: theme.accentSoft },
                    ]}
                  >
                    <Ionicons accessible={false} name="remove" size={20} color={theme.textSecondary} />
                  </Pressable>
                  {ICONS.map((choice) => (
                    <Pressable
                      key={choice.name}
                      accessibilityRole="radio"
                      accessibilityLabel={choice.label}
                      accessibilityState={{ selected: icon === choice.name }}
                      onPress={() => setIcon(choice.name)}
                      style={[
                        styles.iconChoice,
                        { backgroundColor: theme.surfaceElevated },
                        icon === choice.name && { borderColor: theme.accentStrong, backgroundColor: theme.accentSoft },
                      ]}
                    >
                      <Ionicons accessible={false} name={choice.name} size={20} color={theme.textPrimary} />
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={[styles.label, { color: theme.textSecondary }]}>Accent</Text>
                <View style={styles.swatches}>
                  {ACCENTS.map((choice) => (
                    <Pressable
                      key={choice.label}
                      accessibilityRole="radio"
                      accessibilityLabel={`${choice.label} accent`}
                      accessibilityState={{ selected: accent === choice.value }}
                      onPress={() => setAccent(choice.value)}
                      style={[
                        styles.swatchHit,
                        accent === choice.value && { borderColor: theme.textPrimary },
                      ]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: choice.color ?? theme.surfaceElevated, borderColor: theme.borderSubtle },
                        ]}
                      >
                        {accent === choice.value ? (
                          <Ionicons accessible={false} name="checkmark" size={16} color={choice.value ? '#FFFFFF' : theme.textPrimary} />
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>

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
  emptyWrap: { flex: 1, minHeight: 220 },
  pressed: { opacity: 0.58 },
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
  iconChoices: { gap: spacing.xs, paddingVertical: spacing.xs },
  iconChoice: { width: 44, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  swatches: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  swatchHit: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  error: { fontSize: 13, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  secondary: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontWeight: '600' },
  primary: { minHeight: 44, borderRadius: 12, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontWeight: '700' },
  disabled: { opacity: 0.38 },
});
