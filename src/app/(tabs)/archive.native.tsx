import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';

import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';

type Archived = { id: string; title: string; kind: 'message' | 'card' | 'board'; archivedAt: number };

export default function ArchiveScreen() {
  const database = useSQLiteContext();
  const { openDrawer } = useAppDrawer();
  const { tokens: theme } = useTheme();
  const { confirm } = useAppDialog();
  // The floating bottom nav is absolutely positioned over this screen (see
  // PHASE: REDESIGN CHITS BOTTOM NAVIGATION) rather than reserving its own flex
  // space, so this screen's own scroll content has to reserve the matching
  // clearance itself.
  const tabBarHeight = useBottomTabBarHeight();
  const repo = useMemo(() => createBoardRepository(database), [database]);
  const messages = useMemo(() => createMessageRepository(database), [database]);
  const [items, setItems] = useState<Archived[]>([]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const showLoader = useChitsLoading(!ready);

  const load = useCallback(async () => { setItems(await repo.listArchived()); setReady(true); }, [repo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const requestRestore = (item: Archived) => {
    setRestoreError(null);
    confirm({
      type: 'default',
      icon: 'arrow-undo-outline',
      title: `Restore this ${item.kind}?`,
      message: `“${item.title}” will return to its previous location.`,
      confirmText: 'Restore',
      onConfirm: async () => {
        try {
          if (item.kind === 'message') await messages.restore(item.id);
          else if (item.kind === 'card') await repo.restoreCard(item.id);
          else await repo.restoreBoard(item.id);
          await load();
        } catch {
          setRestoreError('This item could not be restored. Please try again.');
        }
      },
    });
  };

  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader title="Archive" leading={<IconButton label="Open navigation" onPress={openDrawer}><Ionicons accessible={false} name="reorder-two-outline" size={24} color={theme.textPrimary} /></IconButton>} />
    {restoreError ? <Text accessibilityRole="alert" style={[styles.errorBanner, { color: theme.danger }]}>{restoreError}</Text> : null}
    {!ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : items.length ? <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.md }]}>
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
  </Screen>;
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.xs },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: { padding: spacing.sm, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  itemPressed: { opacity: 0.7 },
  kind: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 16, marginTop: 3 },
  restore: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  errorBanner: { marginHorizontal: spacing.md, marginTop: spacing.xs, fontSize: 13, lineHeight: 18 },
});
