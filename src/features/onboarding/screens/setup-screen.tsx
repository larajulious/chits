import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { PrimaryButton, Screen } from '@/components/ui/primitives';
import { layout, spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';
import { createSelectedBoards } from '../board-setup';
import { ot, type OnboardingStringKey } from '../strings';
import { endTour } from '../tour';

const CHOICES: OnboardingStringKey[] = ['setup.board.personal', 'setup.board.work', 'setup.board.study', 'setup.board.home', 'setup.board.projects'];

export default function OnboardingSetupScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { tokens: theme } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => { void createBoardRepository(database).listActive().then((boards) => setExisting(boards.map((board) => board.name.toLowerCase()))); }, [database]));
  const finish = async () => { await endTour(database); router.navigate('/chat'); };
  const create = async () => {
    if (working) return;
    setWorking(true); setError(false);
    try { await createSelectedBoards(database, selected); await finish(); }
    catch { setError(true); setWorking(false); }
  };
  return <Screen>
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{ot('setup.title')}</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{ot('setup.body')}</Text>
      <View style={styles.chips}>{CHOICES.map((key) => {
        const name = ot(key);
        const chosen = selected.includes(name);
        const already = existing.includes(name.toLowerCase());
        return <Pressable key={key} accessibilityRole="button" accessibilityLabel={name + (already ? '. ' + ot('setup.have') : '')} accessibilityState={{ selected: chosen }} onPress={() => setSelected((current) => chosen ? current.filter((item) => item !== name) : [...current, name])} style={[styles.chip, { backgroundColor: chosen ? theme.accentSoft : theme.surface, borderColor: chosen ? theme.accentBorder : theme.borderSubtle }]}>
          <Text style={[styles.chipText, { color: theme.textPrimary }]}>{name}</Text>
          {already ? <Text style={[styles.hint, { color: theme.textSecondary }]}>{ot('setup.have')}</Text> : null}
        </Pressable>;
      })}</View>
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{ot('setup.error')}</Text> : null}
      <PrimaryButton label={working ? ot('setup.creating') : selected.length ? selected.length === 1 ? ot('setup.createOne') : ot('setup.create', { count: selected.length }) : ot('setup.none')} disabled={working} onPress={() => void create()} />
      <Pressable accessibilityRole="button" accessibilityLabel={ot('setup.skipLabel')} disabled={working} onPress={() => void finish()} style={styles.skip}><Text style={{ color: theme.textSecondary }}>{ot('setup.skip')}</Text></Pressable>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 27, fontWeight: '700' }, body: { fontSize: 16, lineHeight: 23 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md },
  chip: { minHeight: 52, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, justifyContent: 'center' },
  chipText: { fontSize: 16, fontWeight: '600' }, hint: { fontSize: 11 }, skip: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
