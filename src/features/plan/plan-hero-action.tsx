import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { planCta, progressOf, type DayPeriod, type PlanCta } from './plan-core';
import { subscribeToPlanChanges } from './plan-repository';
import { usePlanRepository, usePlanSurfaces, useToday } from './use-plan-day';

const LABELS: Record<PlanCta, string> = { plan: 'plan.cta.plan', view: 'plan.cta.view', wins: 'plan.cta.wins', recap: 'plan.cta.recap' };
const ICONS: Record<PlanCta, IconName> = { plan: 'sunny-outline', view: 'checkbox-outline', wins: 'star-outline', recap: 'moon-outline' };
const HERO_TITLES: Record<DayPeriod, string> = { morning: 'plan.hero.morning', afternoon: 'plan.hero.afternoon', evening: 'plan.hero.evening' };

/** Today's state for the Notes hero: the words, and which action to offer. */
export function usePlanHero() {
  const repository = usePlanRepository();
  const { today, period } = useToday();
  const [state, setState] = useState<{ cta: PlanCta; done: number; total: number }>({ cta: 'plan', done: 0, total: 0 });
  useFocusEffect(useCallback(() => {
    const load = () => {
      void repository.day(today).then((day) => {
        const tasks = day?.tasks ?? [];
        const { done, total } = progressOf(tasks);
        setState({ cta: planCta(day?.plan ?? null, tasks), done, total });
      }).catch(() => undefined);
    };
    load();
    return subscribeToPlanChanges(load);
  }, [repository, today]));
  const body = state.cta === 'recap' ? tr('plan.hero.wrapped') : state.total ? tr('plan.progress', { done: state.done, total: state.total }) : tr('plan.hero.none');
  return { cta: state.cta, title: tr(HERO_TITLES[period]), body };
}

/** The hero's two actions: planning the day, and writing a note straight away. */
export function PlanHeroActions({ cta, onWrite }: { cta: PlanCta; onWrite: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const { rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const surfaces = usePlanSurfaces();
  const fonts = useWelcomeFonts();
  const radius = styleTokens.button.radius;
  return <View style={[styles.row, rowStyle]}>
    <Pressable accessibilityRole="button" accessibilityLabel={tr(LABELS[cta])} onPress={() => router.push('/plan')} style={({ pressed }) => [styles.plan, rowStyle, { backgroundColor: surfaces.action, borderRadius: radius }, pressed && styles.pressed]}>
      <Icon name={ICONS[cta]} size={17} color={surfaces.onAction} />
      <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} family={fonts.display} style={[styles.planLabel, { color: surfaces.onAction }]}>{tr(LABELS[cta])}</AppText>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={tr('workspace.writeNote')} onPress={onWrite} style={({ pressed }) => [styles.write, { backgroundColor: surfaces.card, borderRadius: radius }, pressed && styles.pressed]}>
      <Icon name="create-outline" size={20} color={surfaces.ink} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.xs },
  plan: { flexShrink: 1, minHeight: layout.minimumTouchTarget, alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm },
  planLabel: { flexShrink: 1, fontSize: 14, lineHeight: 18 },
  write: { width: layout.minimumTouchTarget, height: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
