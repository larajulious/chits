import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { Icon } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { getFormattingLocale, tr } from '@/localization/runtime';
import { dateFromKey, progressOf, type DailyPlan, type DailyTask } from './plan-core';
import { PlanProgress } from './plan-progress';

export const shortDay = (key: string) => dateFromKey(key).toLocaleDateString(getFormattingLocale(), { weekday: 'short', month: 'short', day: 'numeric' });

type Props = { plan: DailyPlan; tasks: DailyTask[]; surfaces: WelcomeSurfaces; onReopen: () => void; onReflect: (text: string) => void };

/** The day as it was, including what moved on. Nothing here is locked. */
export function RecapView({ plan, tasks, surfaces, onReopen, onReflect }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const [reflection, setReflection] = useState(plan.reflection ?? '');
  const { done, total } = progressOf(tasks);
  const wins = tasks.filter((task) => task.completedAt !== null);
  const open = tasks.filter((task) => task.completedAt === null);
  const radius = styleTokens.button.radius;
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  return <View style={styles.root}>
    <PlanProgress done={done} total={total} surfaces={surfaces} />
    {wins.length ? <View style={styles.group}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.heading, align, { color: surfaces.ink }]}>{tr('plan.recap.wins')}</AppText>
      {wins.map((task) => <View key={task.id} style={[styles.line, rowStyle]}>
        <Icon name="checkmark" size={16} color={surfaces.ink} />
        <AppText family={fonts.text} style={[styles.text, align, { color: surfaces.ink }]}>{task.title}</AppText>
      </View>)}
    </View> : null}
    {open.length ? <View style={styles.group}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.heading, align, { color: surfaces.ink }]}>{tr('plan.recap.open')}</AppText>
      {open.map((task) => <View key={task.id} style={styles.openLine}>
        <AppText family={fonts.text} style={[styles.text, align, { color: surfaces.inkMuted }]}>{task.title}</AppText>
        {task.carriedTo ? <AppText family={fonts.text} style={[styles.note, align, { color: surfaces.inkMuted }]}>{tr('plan.recap.movedTo', { date: shortDay(task.carriedTo) })}</AppText> : null}
      </View>)}
    </View> : null}
    <View style={styles.group}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.heading, align, { color: surfaces.ink }]}>{tr('plan.recap.goodThing')}</AppText>
      <TextInput multiline value={reflection} onChangeText={setReflection} onEndEditing={() => { if (reflection !== (plan.reflection ?? '')) onReflect(reflection); }} maxLength={500} accessibilityLabel={tr('plan.recap.goodThing')} placeholder={tr('plan.wrap.placeholder')} placeholderTextColor={surfaces.inkMuted} style={[styles.reflection, align, { color: surfaces.ink, backgroundColor: surfaces.control, borderRadius: radius }]} />
    </View>
    <Pressable accessibilityRole="button" onPress={onReopen} style={styles.reopen}><AppText family={fonts.textBold} style={{ color: surfaces.inkMuted }}>{tr('plan.recap.reopen')}</AppText></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  group: { gap: spacing.xs },
  heading: { fontSize: 17, lineHeight: 23 },
  line: { alignItems: 'flex-start', gap: spacing.xs },
  openLine: { gap: 1 },
  text: { flexShrink: 1, fontSize: 15, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 16 },
  reflection: { minHeight: 64, fontSize: 15, lineHeight: 21, padding: spacing.sm, textAlignVertical: 'top' },
  reopen: { minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
