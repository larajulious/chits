import { useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { createSpaceRepository } from '@/db/repositories';
import type { SpaceCandidate } from '@/db/types';
import { useSpaceFonts } from './space-fonts';
import { useSpaceStyles, useSpaceUI, type SpaceUI } from '@/components/spaces/ink-surface';

/**
 * "Stick a note": every card and unorganized thought that isn't on a space
 * yet, newest first, searchable. Hidden notes are listed as Hidden Chit and
 * never found by their words.
 */
export function NotePicker({ visible, spaceName, onClose, onPick }: { visible: boolean; spaceName: string; onClose: () => void; onPick: (candidate: SpaceCandidate) => void }) {
  const ui = useSpaceUI();
  const styles = useSpaceStyles(createStyles);
  const database = useSQLiteContext();
  const fonts = useSpaceFonts();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SpaceCandidate[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // A short pause while typing, so each keystroke doesn't query.
    const timer = setTimeout(() => { void createSpaceRepository(database).listCandidates(query).then((next) => { if (!cancelled) setItems(next); }); }, query ? 150 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [database, query, visible]);
  // Opens fresh next time: no leftover search or list.
  const close = () => { setQuery(''); setItems(null); onClose(); };
  const pick = (candidate: SpaceCandidate) => { setQuery(''); setItems(null); onPick(candidate); };

  return <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={close}>
    <SafeAreaView edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[fonts.uiHeavy, styles.title]}>Stick on your {spaceName}</Text>
        <IconButton label="Close" onPress={close}><Icon name="close" size={24} color={ui.paper} /></IconButton>
      </View>
      <View style={styles.search}>
        <Icon name="search-outline" size={17} color={ui.textMuted} />
        <TextInput accessibilityLabel="Search notes" value={query} onChangeText={setQuery} placeholder="Search notes…" placeholderTextColor={ui.textMuted} selectionColor={ui.accent} cursorColor={ui.accent} returnKeyType="search" autoCorrect={false} style={[fonts.ui, styles.input]} />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setQuery('')}><Icon name="close-circle" size={16} color={ui.textMuted} /></Pressable> : null}
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={items ? <Text style={[fonts.ui, styles.empty]}>{query ? 'No notes match that search.' : 'Every note is already on a space.'}</Text> : null}
        renderItem={({ item }) => <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.context ? `, ${item.context}` : ''}. Stick on your ${spaceName}.`}
          onPress={() => pick(item)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.icon}><Icon name={item.hidden ? 'eye-off-outline' : item.kind === 'card' ? 'albums-outline' : 'chatbubble-outline'} size={17} color={ui.paper} /></View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={[fonts.uiSemi, styles.rowTitle]}>{item.title}</Text>
            <Text numberOfLines={1} style={[fonts.ui, styles.rowContext]}>{item.context ?? 'Thought in Chat'}</Text>
          </View>
          <Icon name="add-circle" size={24} color={ui.magnetRed} />
        </Pressable>}
      />
    </SafeAreaView>
  </Modal>;
}

const createStyles = (ui: SpaceUI) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.ink },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.lg, paddingRight: spacing.sm },
  title: { flex: 1, fontSize: 20, color: ui.paper },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginHorizontal: spacing.lg, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 22, backgroundColor: ui.inkRaised },
  input: { flex: 1, fontSize: 16, paddingVertical: 0, color: ui.paper },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  empty: { textAlign: 'center', marginTop: spacing.xl, fontSize: 14, color: ui.textMuted },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ui.inkBorder },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.inkRaised },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, color: ui.paper },
  rowContext: { fontSize: 12, marginTop: 2, color: ui.textMuted },
  pressed: { opacity: 0.6 },
});
