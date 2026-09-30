import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { BackHeader, ListRow, Screen } from '@/components/ui/primitives';
import { layout, spacing } from '@/constants/theme';
import { GettingStartedCard } from '../components/checklist-card';
import { ot } from '../strings';
import { ONBOARDING_KEYS, readOnboardingValue, resetOnboarding, writeOnboardingValue } from '../storage';
import { endTour, startTour } from '../tour';

export default function OnboardingHubScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { confirm } = useAppDialog();
  const { tokens: theme } = useTheme();
  const [onHome, setOnHome] = useState(false);
  useFocusEffect(useCallback(() => { void readOnboardingValue(database, ONBOARDING_KEYS.checklistHome).then((value) => setOnHome(value === 'shown')); }, [database]));
  const replay = async () => { await endTour(database); await startTour(database, 'replay'); router.push('/onboarding/welcome'); };
  const showHome = async () => { await writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'shown'); setOnHome(true); };
  const reset = () => confirm({
    title: ot('hub.reset.confirmTitle'), message: ot('hub.reset.confirmMessage'), icon: 'refresh-outline',
    confirmText: ot('hub.reset.confirm'), cancelText: ot('hub.reset.cancel'),
    onConfirm: async () => {
      await resetOnboarding(database);
      // A later ordinary launch must not mistake this deliberate reset for a fresh install.
      await writeOnboardingValue(database, ONBOARDING_KEYS.version, '1');
      await writeOnboardingValue(database, ONBOARDING_KEYS.firstRun, 'existing-user');
      setOnHome(false);
    },
  });
  return <Screen>
    <BackHeader title={ot('hub.title')} onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: theme.textSecondary }]}>{ot('hub.intro')}</Text>
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <ListRow title={ot('hub.replay')} detail={ot('hub.replay.detail')} onPress={() => void replay()} />
      </View>
      <GettingStartedCard />
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <ListRow title={onHome ? ot('hub.shownOnHome') : ot('hub.showOnHome')} detail={ot('hub.showOnHome.detail')} onPress={onHome ? undefined : () => void showHome()} />
        <ListRow title={ot('hub.reset')} detail={ot('hub.reset.detail')} onPress={reset} />
      </View>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  intro: { fontSize: 15, lineHeight: 22 }, group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: spacing.md },
});
