import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';
import { createCardSubtaskRepository, type CardSubtask } from '@/db/repositories';

export function CardSubtasks({ cardId, scrollRef }: { cardId: string; scrollRef: RefObject<ScrollView | null> }) {
  const database = useSQLiteContext();
  const repository = useMemo(() => createCardSubtaskRepository(database), [database]);
  const { tokens } = useTheme();
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
  const busyAdd = useRef(false);
  const busyEdit = useRef(false);
  const toggleQueue = useRef(Promise.resolve());

  const reload = useCallback(async () => { setItems(await repository.list(cardId)); }, [repository, cardId]);
  useFocusEffect(useCallback(() => { void reload().catch(() => setError('Could not load subtasks.')); }, [reload]));
  const scrollToRow = (id?: string) => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, sectionY.current + listY.current + (id ? rowY.current.get(id) ?? 0 : 0) - 100), animated: true }), 90);

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
    } catch { setError('Could not save that subtask. Try again.'); }
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
    } catch { setError('Could not update that subtask. Try again.'); }
    finally { busyEdit.current = false; }
  };
  const toggle = (item: CardSubtask) => {
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, isCompleted: !row.isCompleted } : row));
    toggleQueue.current = toggleQueue.current.then(async () => { await repository.toggle(cardId, item.id); }, async () => { await repository.toggle(cardId, item.id); })
      .catch(() => { setError('Could not update that subtask.'); void reload(); });
  };
  const move = async (id: string, delta: -1 | 1) => {
    const from = items.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    setItems(next);
    try { await repository.reorder(cardId, next.map((item) => item.id)); setError(null); }
    catch { setError('Could not reorder subtasks.'); void reload(); }
  };
  const remove = async (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try { await repository.remove(cardId, id); setError(null); }
    catch { setError('Could not delete that subtask.'); void reload(); }
  };
  const openActions = (item: CardSubtask) => {
    const index = items.findIndex((row) => row.id === item.id);
    actionSheet({ title: item.title, options: [
      { label: 'Move up', icon: 'arrow-up-outline', disabled: index <= 0, onPress: () => void move(item.id, -1) },
      { label: 'Move down', icon: 'arrow-down-outline', disabled: index >= items.length - 1, onPress: () => void move(item.id, 1) },
      { label: 'Delete subtask', icon: 'trash-outline', destructive: true, onPress: () => void remove(item.id) },
    ] });
  };
  const completed = items.filter((item) => item.isCompleted).length;

  return <View onLayout={(event) => { sectionY.current = event.nativeEvent.layout.y; }}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.heading, { color: tokens.textMuted }]}>SUBTASKS</Text>
      {items.length ? <Text style={[styles.progress, { color: tokens.textSecondary }]}>{completed} / {items.length}</Text> : null}
    </View>
    <View onLayout={(event) => { listY.current = event.nativeEvent.layout.y; }} style={[styles.list, { borderColor: tokens.borderSubtle, backgroundColor: tokens.surface }]}>
      {items.map((item, index) => <View key={item.id} onLayout={(event) => { rowY.current.set(item.id, event.nativeEvent.layout.y); }} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle }]}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={item.title} accessibilityState={{ checked: item.isCompleted }} onPress={() => toggle(item)} style={styles.checkboxTarget}>
          <Ionicons accessible={false} name={item.isCompleted ? 'checkbox' : 'square-outline'} size={22} color={item.isCompleted ? tokens.accentStrong : tokens.textMuted} />
        </Pressable>
        {editingId === item.id ? <TextInput
          autoFocus multiline accessibilityLabel="Edit subtask" value={editDraft} onChangeText={setEditDraft}
          onFocus={() => scrollToRow(item.id)} onBlur={() => void saveEdit()}
          onSubmitEditing={() => { void saveEdit(); Keyboard.dismiss(); }} returnKeyType="done" submitBehavior="submit"
          selectionColor={tokens.accent} style={[styles.input, { color: tokens.textPrimary }]}
        /> : <Pressable accessibilityRole="button" accessibilityLabel={`Edit subtask, ${item.title}`} onPress={() => { setEditingId(item.id); setEditDraft(item.title); }} onLongPress={() => openActions(item)} style={styles.titleTarget}>
          <Text style={[styles.title, { color: item.isCompleted ? tokens.textMuted : tokens.textPrimary }, item.isCompleted && styles.done]}>{item.title}</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${item.title}`} hitSlop={6} onPress={() => openActions(item)} style={styles.more}>
          <Ionicons accessible={false} name="ellipsis-horizontal" size={18} color={tokens.textMuted} />
        </Pressable>
      </View>)}
      {adding ? <View onLayout={(event) => { rowY.current.set('new', event.nativeEvent.layout.y); scrollToRow('new'); }} style={[styles.row, items.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle }]}>
        <Ionicons accessible={false} name="square-outline" size={22} color={tokens.textMuted} style={styles.draftCheckbox} />
        <TextInput ref={addRef} autoFocus multiline accessibilityLabel="New subtask" placeholder="Add a subtask" placeholderTextColor={tokens.textMuted}
          value={draft} onChangeText={setDraft} onFocus={() => scrollToRow('new')} onBlur={() => void saveNew(false)}
          onSubmitEditing={() => void saveNew(true)} returnKeyType="done" submitBehavior="submit" selectionColor={tokens.accent}
          style={[styles.input, { color: tokens.textPrimary }]} />
      </View> : null}
    </View>
    {!adding ? <Pressable accessibilityRole="button" onPress={() => { setAdding(true); setError(null); }} style={styles.add}>
      <Ionicons accessible={false} name="add" size={18} color={tokens.accentStrong} />
      <Text style={[styles.addText, { color: tokens.accentStrong }]}>Add subtask</Text>
    </Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  progress: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  list: { marginTop: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, overflow: 'hidden' },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xxs, paddingRight: spacing.xs },
  checkboxTarget: { width: 42, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  draftCheckbox: { marginHorizontal: 10 },
  titleTarget: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  title: { fontSize: 14, lineHeight: 20 },
  done: { textDecorationLine: 'line-through' },
  input: { flex: 1, minWidth: 0, minHeight: 42, maxHeight: 120, paddingVertical: spacing.xs, fontSize: 14, lineHeight: 20 },
  more: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  add: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.xs, marginTop: spacing.xxs },
  addText: { fontSize: 13, fontWeight: '700' },
  error: { fontSize: 12, lineHeight: 17, marginTop: spacing.xxs },
});
