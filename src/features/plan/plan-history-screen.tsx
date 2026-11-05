import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { PaperDesk, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { BackHeader, EmptyState, Screen } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { getFormattingLocale, tr } from '@/localization/runtime';
import { navigationIconName } from '@/localization/text-layout';
import { dateFromKey } from './plan-core';
import type { PlanHistoryDay } from './plan-repository';
import { usePlanRepository, usePlanSurfaces } from './use-plan-day';

/** A plain list of days: what was done and what was thought. No scores to keep up. */
export default function PlanHistoryScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const repository = usePlanRepository();
  const surfaces = usePlanSurfaces();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const { styleTokens } = useTheme();
  const { rowStyle, direction } = useDirection();
  const [days, setDays] = useState<PlanHistoryDay[] | null>(null);
  useFocusEffect(useCallback(() => { void repository.history().then(setDays).catch(() => setDays([])); }, [repository]));
  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <BackHeader title={tr('plan.history')} onBack={() => router.canGoBack() ? router.back() : router.replace('/plan')} />
    <PaperDesk faint>
      <FlatList
        data={days ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={days ? <EmptyState title={tr('plan.history.empty')} description={tr('plan.body')} /> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/plan', params: { date: item.date } })} style={({ pressed }) => [styles.day, rowStyle, { backgroundColor: surfaces.card, borderRadius: styleTokens.button.radius }, pressed && styles.pressed]}>
          <View style={styles.copy}>
            <AppText family={fonts.display} style={[styles.date, { color: surfaces.ink }]}>{dateFromKey(item.date).toLocaleDateString(getFormattingLocale(), { weekday: 'short', month: 'short', day: 'numeric' })}</AppText>
            <AppText family={fonts.text} style={[styles.count, { color: surfaces.inkMuted }]}>{tr('plan.progress', { done: item.done, total: item.total })}</AppText>
            {item.reflection ? <AppText numberOfLines={2} family={fonts.text} style={[styles.reflection, { color: surfaces.inkMuted }]}>{item.reflection}</AppText> : null}
          </View>
          <Icon name={navigationIconName('chevron-forward', direction)} size={17} color={surfaces.inkMuted} />
        </Pressable>}
      />
    </PaperDesk>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, padding: spacing.md, gap: spacing.xs },
  day: { alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  date: { fontSize: 16, lineHeight: 21 },
  count: { fontSize: 13, lineHeight: 18 },
  reflection: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  pressed: { opacity: 0.7 },
});
