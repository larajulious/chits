import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/controls';
import { Icon } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import { listNoteCandidates } from '@/db/repositories';
import type { SpaceCandidate } from '@/db/types';

/**
 * "Existing note": every card and Chat note that isn't on the calendar yet
 * (no day, no pending reminder), newest first and searchable, to plan on a
 * day or give a reminder.
 */
export function CalendarNotePicker({ visible, dayLabel, onClose, onPick }: { visible: boolean; dayLabel: string; onClose: () => void; onPick: (candidate: SpaceCandidate) => void }) {
  const database = useSQLiteContext();
  const { tokens: theme } = useTheme();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SpaceCandidate[] | null>(null);
  const [picked, setPicked] = useState<SpaceCandidate | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // A short pause while typing, so each keystroke doesn't query.
    const timer = setTimeout(() => { void listNoteCandidates(database, 'calendar', query).then((next) => { if (!cancelled) setItems(next); }, () => { if (!cancelled) setItems([]); }); }, query ? 150 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [database, query, visible]);

  const reset = () => { setQuery(''); setItems(null); };
  const close = () => { reset(); onClose(); };
  // iOS presents the schedule sheet only after this one has gone (onDismiss); Android right away.
  const pick = (candidate: SpaceCandidate) => {
    reset();
    if (Platform.OS === 'ios') { setPicked(candidate); onClose(); } else { onClose(); onPick(candidate); }
  };
  const dismissed = () => { if (picked) onPick(picked); setPicked(null); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={close} onDismiss={dismissed}>
      <SafeAreaView edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']} style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Add an existing note</AppText>
            <AppText style={[styles.subtitle, { color: theme.textSecondary }]}>To {dayLabel}</AppText>
          </View>
          <IconButton label="Close" onPress={close}><Icon name="close" size={24} color={theme.textPrimary} /></IconButton>
        </View>
        <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
          <Icon name="search-outline" size={17} color={theme.textMuted} />
          <TextInput accessibilityLabel="Search notes" value={query} onChangeText={setQuery} placeholder="Search notes and cards…" placeholderTextColor={theme.textMuted} returnKeyType="search" autoCorrect={false} style={[styles.input, { color: theme.textPrimary }]} />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setQuery('')}><Icon name="close-circle" size={16} color={theme.textMuted} /></Pressable> : null}
        </View>
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={items ? <AppText style={[styles.empty, { color: theme.textSecondary }]}>{query ? 'No notes match that search.' : 'Every note is already on your calendar.'}</AppText> : null}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.context ? `, ${item.context}` : ', Chat'}. Add to ${dayLabel}.`}
              onPress={() => pick(item)}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}
            >
              <View style={[styles.icon, { backgroundColor: theme.surfaceElevated }]}>
                <Icon name={item.hidden ? 'eye-off-outline' : item.kind === 'card' ? 'albums-outline' : 'chatbubble-outline'} size={17} color={theme.textSecondary} />
              </View>
              <View style={styles.flex}>
                <AppText numberOfLines={2} style={[styles.rowTitle, { color: theme.textPrimary }]}>{item.title}</AppText>
                <AppText numberOfLines={1} style={[styles.rowContext, { color: theme.textSecondary }]}>{item.context ?? 'Chat'}</AppText>
              </View>
              <Icon name="calendar-outline" size={18} color={theme.accentStrong} />
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.sm },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 1 },
  search: { minHeight: 44, marginHorizontal: spacing.md, marginBottom: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  input: { flex: 1, fontSize: 15, minHeight: 42 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.xs },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.compactCard },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  rowContext: { fontSize: 12, marginTop: 1 },
  empty: { textAlign: 'center', paddingVertical: spacing.xl, fontSize: 14 },
  pressed: { opacity: 0.64 },
});
