import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';

type Archived = { id: string; title: string; kind: 'message' | 'card' | 'board'; archivedAt: number };

export default function ArchiveScreen() {
  const database = useSQLiteContext();
  const { openDrawer } = useAppDrawer();
  const { tokens: theme } = useTheme();
  const repo = useMemo(() => createBoardRepository(database), [database]);
  const messages = useMemo(() => createMessageRepository(database), [database]);
  const [items, setItems] = useState<Archived[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<Archived | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await repo.listArchived()), [repo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const dismissRestore = () => {
    if (restoring) return;
    setRestoreTarget(null);
    setRestoreError(null);
  };

  const restore = async () => {
    if (!restoreTarget || restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      if (restoreTarget.kind === 'message') await messages.restore(restoreTarget.id);
      else if (restoreTarget.kind === 'card') await repo.restoreCard(restoreTarget.id);
      else await repo.restoreBoard(restoreTarget.id);
      await load();
      setRestoreTarget(null);
    } catch {
      setRestoreError('This item could not be restored. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const requestRestore = (item: Archived) => {
    setRestoreError(null);
    setRestoreTarget(item);
  };

  return <Screen>
    <AppHeader title="Archive" leading={<IconButton label="Open navigation" onPress={openDrawer}><Ionicons accessible={false} name="reorder-two-outline" size={24} color={theme.textPrimary} /></IconButton>} />
    {items.length ? <ScrollView contentContainerStyle={styles.list}>
      {items.map((item) => <Pressable
        key={`${item.kind}-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Restore ${item.kind}, ${item.title}`}
        onPress={() => requestRestore(item)}
        style={({ pressed }) => [styles.item, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.itemPressed]}
      >
        <Text style={[styles.kind, { color: theme.textMuted }]}>{item.kind}</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{item.title}</Text>
        <Text style={[styles.restore, { color: theme.accent }]}>Restore</Text>
      </Pressable>)}
    </ScrollView> : <EmptyState title="Nothing archived" description="Archived messages, cards, and boards remain recoverable here." />}

    <Modal visible={Boolean(restoreTarget)} transparent animationType="fade" onRequestClose={dismissRestore}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel restore" disabled={restoring} onPress={dismissRestore} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
          <View style={[styles.dialogIcon, { backgroundColor: theme.accentSoft }]}>
            <Ionicons accessible={false} name="arrow-undo-outline" size={24} color={theme.accent} />
          </View>
          <Text style={[styles.dialogTitle, { color: theme.textPrimary }]}>Restore this {restoreTarget?.kind}?</Text>
          <Text style={[styles.dialogCopy, { color: theme.textSecondary }]}>
            “{restoreTarget?.title}” will return to its previous location.
          </Text>
          {restoreError ? <Text accessibilityRole="alert" style={[styles.dialogError, { color: theme.danger }]}>{restoreError}</Text> : null}
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" disabled={restoring} onPress={dismissRestore} style={({ pressed }) => [styles.dialogButton, { borderColor: theme.borderSubtle }, pressed && styles.buttonPressed, restoring && styles.disabled]}>
              <Text style={[styles.cancelText, { color: theme.textPrimary }]}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Restore ${restoreTarget?.kind ?? 'item'}`} disabled={restoring} onPress={() => void restore()} style={({ pressed }) => [styles.dialogButton, { backgroundColor: theme.accent, borderColor: theme.accent }, pressed && styles.buttonPressed, restoring && styles.disabled]}>
              <Text style={[styles.confirmText, { color: theme.accentText }]}>{restoring ? 'Restoring…' : 'Restore'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.xs },
  item: { padding: spacing.sm, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  itemPressed: { opacity: 0.7 },
  kind: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 16, marginTop: 3 },
  restore: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.48)' },
  dialog: { width: '100%', maxWidth: 360, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  dialogIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, borderRadius: 24 },
  dialogTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  dialogCopy: { marginTop: spacing.xs, fontSize: 15, lineHeight: 21 },
  dialogError: { marginTop: spacing.sm, fontSize: 13, lineHeight: 18 },
  dialogActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  dialogButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  confirmText: { fontSize: 15, fontWeight: '700' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
});
