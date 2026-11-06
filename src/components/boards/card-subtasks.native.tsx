import type { MascotInteractionHandle } from '@/components/mascot/chits-mascot';
import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import { createCardSubtaskRepository, type CardSubtask } from '@/db/repositories';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { useDesk } from '@/components/desk/paper-desk';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

const SubtaskCheckbox = memo(function SubtaskCheckbox({ item, onToggle }: { item: CardSubtask; onToggle: (item: CardSubtask) => void }) {
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const previous = useRef(item.isCompleted);
  useEffect(() => {
    if (previous.current !== item.isCompleted && !reduced) scale.set(withSequence(withTiming(0.88, { duration: 80 }), withTiming(1, { duration: 140 })));
    previous.current = item.isCompleted;
  }, [item.isCompleted, reduced, scale]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={item.title} accessibilityState={{ checked: item.isCompleted }} onPress={() => onToggle(item)} style={styles.checkboxTarget}>
    <Animated.View style={motion}><Icon name={item.isCompleted ? 'checkbox' : 'square-outline'} size={23} color={item.isCompleted ? tokens.accentStrong : tokens.textMuted} /></Animated.View>
  </Pressable>;
});

export function CardSubtasks({ cardId, scrollRef, showHeading = true, onInputFocus, workspace = false }: { cardId: string; scrollRef?: RefObject<ScrollView | null>; showHeading?: boolean; onInputFocus?: (input: RefObject<TextInput | null>) => void; workspace?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const repository = useMemo(() => createCardSubtaskRepository(database), [database]);
  const { tokens, styleTokens } = useTheme();
  const desk = useDesk();
  const { actionSheet } = useAppDialog();
  const [items, setItems] = useState<CardSubtask[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sectionY = useRef(0);
  const listY = useRef(0);
  const rowY = useRef(new Map<string, number>());
  const addRef = useRef<TextInput>(null);
  const editRef = useRef<TextInput>(null);
  const busyAdd = useRef(false);
  const busyEdit = useRef(false);
  const toggleQueue = useRef(Promise.resolve());
  const mascotRef = useRef<MascotInteractionHandle>(null);

  const reload = useCallback(async () => { setItems(await repository.list(cardId)); }, [repository, cardId]);
  useFocusEffect(useCallback(() => { void reload().catch(() => setError(tr("cardsubtasks.couldNotLoadSubtasks"))); }, [reload]));
  const scrollToRow = (id?: string) => {
    if (onInputFocus) { onInputFocus(id === 'new' ? addRef : editRef); return; }
    setTimeout(() => scrollRef?.current?.scrollTo({ y: Math.max(0, sectionY.current + listY.current + (id ? rowY.current.get(id) ?? 0 : 0) - 100), animated: true }), 90);
  };

  const saveNew = async (keepOpen: boolean) => {
    if (busyAdd.current) return;
    const title = draft.trim();
    if (!title) { if (!keepOpen) setAdding(false); return; }
    busyAdd.current = true;
    try {
      await repository.add(cardId, title);
      setDraft('');
      setError(null);
      await reload();
      if (keepOpen) requestAnimationFrame(() => addRef.current?.focus());
      else setAdding(false);
    } catch { setError(tr("cardsubtasks.couldNotSaveThatSubtaskTryAgain")); }
    finally { busyAdd.current = false; }
  };
  const saveEdit = async () => {
    if (!editingId || busyEdit.current) return;
    const id = editingId;
    const title = editDraft.trim();
    busyEdit.current = true;
    try {
      if (title && title !== items.find((item) => item.id === id)?.title) await repository.rename(cardId, id, title);
      setEditingId(null);
      setError(null);
      await reload();
    } catch { setError(tr("cardsubtasks.couldNotUpdateThatSubtaskTryAgain")); }
    finally { busyEdit.current = false; }
  };
  const toggle = useCallback((item: CardSubtask) => {
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, isCompleted: !row.isCompleted } : row));
    const update = async () => { const saved = await repository.toggle(cardId, item.id); if (saved.isCompleted) mascotRef.current?.play('happy'); };
    toggleQueue.current = toggleQueue.current.then(update, update)
      .catch(() => { setError(tr("cardsubtasks.couldNotUpdateThatSubtask")); void reload(); });
  }, [cardId, reload, repository]);
  const move = async (id: string, delta: -1 | 1) => {
    const from = items.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    setItems(next);
    try { await repository.reorder(cardId, next.map((item) => item.id)); setError(null); }
    catch { setError(tr("cardsubtasks.couldNotReorderSubtasks")); void reload(); }
  };
  const remove = async (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try { await repository.remove(cardId, id); setError(null); }
    catch { setError(tr("cardsubtasks.couldNotDeleteThatSubtask")); void reload(); }
  };
  const openActions = (item: CardSubtask) => {
    const index = items.findIndex((row) => row.id === item.id);
    actionSheet({ title: item.title, options: [
      { label: tr("cardsubtasks.moveUp"), icon: 'arrow-up-outline', disabled: index <= 0, onPress: () => void move(item.id, -1) },
      { label: tr("cardsubtasks.moveDown"), icon: 'arrow-down-outline', disabled: index >= items.length - 1, onPress: () => void move(item.id, 1) },
      { label: tr("cardsubtasks.deleteSubtask"), icon: 'trash-outline', destructive: true, onPress: () => void remove(item.id) },
    ] });
  };
  const completed = items.filter((item) => item.isCompleted).length;

  return <View onLayout={(event) => { sectionY.current = event.nativeEvent.layout.y; }}>
    {showHeading || items.length ? <View style={[styles.header, !showHeading && styles.sheetProgress]}>
      {showHeading ? <AppText accessibilityRole="header" style={[styles.heading, { color: tokens.textMuted }, workspace && [styles.workspaceHeading, { color: desk.ink }]]}>{tr("cardsubtasks.subtasks")}</AppText> : null}
      {!workspace && items.length ? <AppText style={[styles.progress, { color: tokens.textSecondary }]}>{completed} / {items.length}</AppText> : null}
    </View> : null}
    {workspace && items.length ? <View style={styles.progressRow}>
      <AppText accessibilityLiveRegion="polite" style={[styles.progress, { color: workspace ? desk.inkMuted : tokens.textSecondary }]}>{tr('onboarding.hub.progress.count', { done: completed, total: items.length })}</AppText>
      {workspace && completed === items.length ? <OnboardingMascot size={32} accessible={false} interactive={false} controlRef={mascotRef} enableIdleAnimation={false} context="boards" /> : null}
    </View> : null}
    {items.length || adding ? <View onLayout={(event) => { listY.current = event.nativeEvent.layout.y; }} style={[styles.list, { borderColor: tokens.borderSubtle, backgroundColor: tokens.surface }, workspace && { marginTop: spacing.xs, backgroundColor: tokens.cardPaper, borderRadius: styleTokens.button.radius }]}>
      {items.map((item, index) => <View key={item.id} onLayout={(event) => { rowY.current.set(item.id, event.nativeEvent.layout.y); }} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle }]}>
        <SubtaskCheckbox item={item} onToggle={toggle} />
        {editingId === item.id ? <TextInput
          ref={editRef} autoFocus multiline accessibilityLabel={tr("cardsubtasks.editSubtask")} value={editDraft} onChangeText={setEditDraft}
          onFocus={() => scrollToRow(item.id)} onBlur={() => void saveEdit()}
          onSubmitEditing={() => { void saveEdit(); Keyboard.dismiss(); }} returnKeyType="done" submitBehavior="submit"
          selectionColor={tokens.accent} style={[styles.input, { color: tokens.textPrimary }]}
        /> : <Pressable accessibilityRole="button" accessibilityLabel={tr("cardsubtasks.editSubtaskValue", { value1: item.title })} onPress={() => { setEditingId(item.id); setEditDraft(item.title); }} onLongPress={() => openActions(item)} style={styles.titleTarget}>
          <AppText style={[styles.title, { color: item.isCompleted ? tokens.textMuted : tokens.textPrimary }, item.isCompleted && styles.done]}>{item.title}</AppText>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={tr("cardsubtasks.optionsForValue", { value1: item.title })} hitSlop={6} onPress={() => openActions(item)} style={styles.more}>
          <Icon name="ellipsis-horizontal" size={18} color={tokens.textMuted} />
        </Pressable>
      </View>)}
      {adding ? <View onLayout={(event) => { rowY.current.set('new', event.nativeEvent.layout.y); scrollToRow('new'); }} style={[styles.row, items.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle }]}>
        <Icon name="square-outline" size={22} color={tokens.textMuted} style={styles.draftCheckbox} />
        <TextInput ref={addRef} autoFocus multiline accessibilityLabel={tr("cardsubtasks.newSubtask")} placeholder={tr("cardsubtasks.addASubtask")} placeholderTextColor={tokens.textMuted}
          value={draft} onChangeText={setDraft} onFocus={() => scrollToRow('new')} onBlur={() => void saveNew(false)}
          onSubmitEditing={() => void saveNew(true)} returnKeyType="done" submitBehavior="submit" selectionColor={tokens.accent}
          style={[styles.input, { color: tokens.textPrimary }]} />
      </View> : null}
    </View> : null}
    {!adding ? <Pressable accessibilityRole="button" onPress={() => { setAdding(true); setError(null); }} style={styles.add}>
      <Icon name="add" size={18} color={tokens.accentStrong} />
      <AppText style={[styles.addText, { color: tokens.accentStrong }]}>{tr("cardsubtasks.addSubtask")}</AppText>
    </Pressable> : null}
    {error ? <AppText accessibilityRole="alert" style={[styles.error, { color: tokens.danger }]}>{error}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  workspaceHeading: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, gap: spacing.xs },
  sheetProgress: { marginTop: 0, justifyContent: 'flex-end' },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  progress: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  list: { marginTop: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, overflow: 'hidden' },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xxs, paddingRight: spacing.xs },
  checkboxTarget: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  draftCheckbox: { marginHorizontal: 10 },
  titleTarget: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  title: { fontSize: 14, lineHeight: 20 },
  done: { textDecorationLine: 'line-through' },
  input: { flex: 1, minWidth: 0, minHeight: 42, maxHeight: 120, paddingVertical: spacing.xs, fontSize: 14, lineHeight: 20 },
  more: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  add: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.xs, marginTop: spacing.xxs },
  addText: { fontSize: 13, fontWeight: '700' },
  error: { fontSize: 12, lineHeight: 17, marginTop: spacing.xxs },
});
