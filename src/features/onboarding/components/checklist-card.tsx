import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { headingFontFamily, radii, spacing } from '@/constants/theme';
import { subscribeToReminderChanges } from '@/services/reminders';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { CHECKLIST_ITEMS, readChecklist, type ChecklistItem } from '../checklist';
import { ot } from '../strings';
import { ONBOARDING_KEYS, readOnboardingValue, subscribeToOnboardingChanges, writeOnboardingValue } from '../storage';

export function GettingStartedCard({ onHome = false }: { onHome?: boolean }) {
  const database = useSQLiteContext();
  const router = useRouter();
  const { tokens: theme, look } = useTheme();
  const [done, setDone] = useState<ChecklistItem[]>([]);
  const [visible, setVisible] = useState(!onHome);
  const [homeShown, setHomeShown] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const refresh = useCallback(async () => {
    const [next, home] = await Promise.all([readChecklist(database), readOnboardingValue(database, ONBOARDING_KEYS.checklistHome)]);
    setDone(next);
    setVisible(!onHome || home === 'shown');
    setHomeShown(home === 'shown');
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
  const showOnNotes = async () => {
    setSaving(true); setSaveError(false);
    try { await writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'shown'); setHomeShown(true); }
    catch { setSaveError(true); }
    finally { setSaving(false); }
  };
  const rows = CHECKLIST_ITEMS.map((item, index) => {
    const title = ot(`checklist.item.${item}`);
    const hint = ot(`checklist.item.${item}.hint`);
    const completed = done.includes(item);
    return <Pressable key={item} accessibilityRole="button" accessibilityLabel={title + (completed ? '. ' + ot('checklist.done') : '')} accessibilityHint={hint} onPress={() => void open(item)} style={({ pressed }) => [styles.row, !onHome && styles.hubRow, !onHome && index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle }, pressed && styles.pressed]}>
      <Ionicons accessible={false} name={completed ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={completed ? theme.success : theme.textMuted} />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowText, !onHome && styles.hubRowTitle, { color: theme.textPrimary }]}>{title}</Text>
        {!onHome ? <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{hint}</Text> : null}
      </View>
      {onHome && item === 'space' ? <Text style={[styles.badge, { color: theme.accentStrong, backgroundColor: theme.accentSoft }]}>{ot('checklist.new')}</Text> : null}
      <Ionicons accessible={false} name="chevron-forward" size={17} color={theme.textMuted} />
    </Pressable>;
  });
  const complete = done.length === CHECKLIST_ITEMS.length ? <Text style={[styles.complete, { color: theme.textSecondary }]}>{ot('checklist.allDone')}</Text> : null;
  return <View style={onHome ? [styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }] : styles.hubSection}>
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.title, !onHome && { fontSize: 18, fontWeight: look.headingWeight, fontFamily: headingFontFamily(look.headingFont) }, { color: theme.textPrimary }]}>{ot(onHome ? 'checklist.title' : 'hub.checklist.title')}</Text>
        <Text style={[styles.progress, { color: theme.textSecondary }]}>{ot('checklist.progress', { done: done.length, total: CHECKLIST_ITEMS.length })}</Text>
      </View>
      {onHome ? <Pressable accessibilityRole="button" accessibilityLabel={ot('checklist.close')} onPress={() => void writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'dismissed')} style={styles.close}>
        <Ionicons accessible={false} name="close" size={20} color={theme.textSecondary} />
      </Pressable> : null}
    </View>
    {onHome ? <ScrollView style={styles.items} nestedScrollEnabled>{rows}{complete}</ScrollView> : <>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={ot('hub.checklist.title')} accessibilityValue={{ min: 0, max: CHECKLIST_ITEMS.length, now: done.length, text: ot('checklist.progress', { done: done.length, total: CHECKLIST_ITEMS.length }) }} style={styles.progressTrack}>
        {CHECKLIST_ITEMS.map((item) => <View key={item} style={[styles.progressSegment, { backgroundColor: done.includes(item) ? theme.accent : theme.borderSubtle }]} />)}
      </View>
      <View style={[styles.hubItems, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>{rows}</View>
      {complete}
      {homeShown !== null ? <View style={styles.homeVisibility}>
        {homeShown ? <View style={styles.homeStatus}>
          <Ionicons accessible={false} name="checkmark-outline" size={18} color={theme.textMuted} />
          <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{ot('hub.checklist.visibleOnNotes')}</Text>
        </View> : <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void showOnNotes()} style={({ pressed }) => [styles.homeAction, pressed && styles.pressed]}>
          <Ionicons accessible={false} name="add-circle-outline" size={20} color={theme.accentStrong} />
          <Text style={[styles.homeActionText, { color: theme.accentStrong }]}>{ot('hub.checklist.showOnNotes')}</Text>
        </Pressable>}
        {saveError ? <Text accessibilityRole="alert" style={[styles.rowHint, { color: theme.danger }]}>{ot('hub.checklist.saveError')}</Text> : null}
      </View> : null}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { flex: 1 }, title: { fontSize: 16, fontWeight: '700' }, progress: { fontSize: 12, marginTop: 2 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  items: { maxHeight: 220 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { fontSize: 14 }, rowCopy: { flex: 1, minWidth: 0 }, badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  complete: { fontSize: 13, marginTop: spacing.xs },
  hubSection: { gap: spacing.sm }, hubItems: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.compactCard, paddingHorizontal: spacing.md },
  hubRow: { minHeight: 76, paddingVertical: spacing.sm }, hubRowTitle: { fontSize: 15, fontWeight: '600' }, rowHint: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  progressTrack: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs }, progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  homeVisibility: { gap: spacing.xxs }, homeStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  homeAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, homeActionText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.65 },
});
