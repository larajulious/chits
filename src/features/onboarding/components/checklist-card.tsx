import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { subscribeToReminderChanges } from '@/services/reminders';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { CHECKLIST_ITEMS, readChecklist, type ChecklistItem } from '../checklist';
import { ot } from '../strings';
import { ONBOARDING_KEYS, readOnboardingValue, subscribeToOnboardingChanges, writeOnboardingValue } from '../storage';

export function GettingStartedCard({ onHome = false }: { onHome?: boolean }) {
  const database = useSQLiteContext();
  const router = useRouter();
  const { tokens: theme } = useTheme();
  const [done, setDone] = useState<ChecklistItem[]>([]);
  const [visible, setVisible] = useState(!onHome);
  const refresh = useCallback(async () => {
    const [next, home] = await Promise.all([readChecklist(database), readOnboardingValue(database, ONBOARDING_KEYS.checklistHome)]);
    setDone(next);
    setVisible(!onHome || home === 'shown');
  }, [database, onHome]);
  useFocusEffect(useCallback(() => {
    void refresh().catch(() => undefined);
    const changed = () => { void refresh().catch(() => undefined); };
    const stopOnboarding = subscribeToOnboardingChanges(changed);
    const stopSpace = subscribeToSpaceChanges(changed);
    const stopReminder = subscribeToReminderChanges(changed);
    return () => { stopOnboarding(); stopSpace(); stopReminder(); };
  }, [refresh]));
  if (!visible) return null;

  const open = async (item: ChecklistItem) => {
    if (item === 'firstNote') router.push('/chat');
    else if (item === 'firstCard') {
      const note = await database.getFirstAsync<{ id: string }>('SELECT m.id FROM messages m WHERE m.deleted_at IS NULL AND m.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM card_messages cm WHERE cm.message_id = m.id) ORDER BY m.created_at DESC LIMIT 1');
      router.push(note ? { pathname: '/unorganized', params: { messageId: note.id } } : '/chat');
    } else if (item === 'reminder') {
      const card = await database.getFirstAsync<{ id: string }>('SELECT id FROM cards WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 1');
      router.push(card ? { pathname: '/card/[id]', params: { id: card.id } } : '/unorganized');
    } else router.push('/spaces/pick');
  };
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{ot('checklist.title')}</Text>
        <Text style={[styles.progress, { color: theme.textSecondary }]}>{ot('checklist.progress', { done: done.length, total: CHECKLIST_ITEMS.length })}</Text>
      </View>
      {onHome ? <Pressable accessibilityRole="button" accessibilityLabel={ot('checklist.close')} onPress={() => void writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'dismissed')} style={styles.close}>
        <Ionicons accessible={false} name="close" size={20} color={theme.textSecondary} />
      </Pressable> : null}
    </View>
    <ScrollView style={styles.items} nestedScrollEnabled>
      {CHECKLIST_ITEMS.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={ot('checklist.item.' + item as 'checklist.item.firstNote')} accessibilityState={{ checked: done.includes(item) }} onPress={() => void open(item)} style={styles.row}>
        <Ionicons accessible={false} name={done.includes(item) ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={done.includes(item) ? theme.success : theme.textMuted} />
        <Text style={[styles.rowText, { color: theme.textPrimary }]}>{ot('checklist.item.' + item as 'checklist.item.firstNote')}</Text>
        {item === 'space' ? <Text style={[styles.badge, { color: theme.accentStrong, backgroundColor: theme.accentSoft }]}>{ot('checklist.new')}</Text> : null}
        <Ionicons accessible={false} name="chevron-forward" size={17} color={theme.textMuted} />
      </Pressable>)}
      {done.length === CHECKLIST_ITEMS.length ? <Text style={[styles.complete, { color: theme.textSecondary }]}>{ot('checklist.allDone')}</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { flex: 1 }, title: { fontSize: 16, fontWeight: '700' }, progress: { fontSize: 12, marginTop: 2 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  items: { maxHeight: 220 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { fontSize: 14, flex: 1 }, badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  complete: { fontSize: 13, marginTop: spacing.xs },
});
