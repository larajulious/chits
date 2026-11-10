import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { formatReminderClock } from '@/services/reminder-time';
import type { DailyTask } from './plan-core';

/** The plan’s tick box, shared by the task list and the reuse sheets. */
export function PlanCheck({ checked, surfaces }: { checked: boolean; surfaces: WelcomeSurfaces }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (checked && !reduced) scale.set(withSequence(withTiming(1.16, { duration: 120, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 130 })));
  }, [checked, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={[styles.check, { borderColor: checked ? surfaces.action : surfaces.inkMuted, backgroundColor: checked ? surfaces.action : 'transparent' }, style]}>
    {checked ? <Icon name="checkmark" size={15} color={surfaces.onAction} /> : null}
  </Animated.View>;
}

type Props = { task: DailyTask; surfaces: WelcomeSurfaces; onToggle: () => void; /** Leave it out for a row that can only be ticked. */ onMore?: () => void; /** Shorter, still a full touch target, for a small preview. */ dense?: boolean };

export function PlanTaskRow({ task, surfaces, onToggle, onMore, dense = false }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const done = task.completedAt !== null;
  const linked = Boolean(task.messageId || task.cardId);
  const reminder = task.reminderAt && !done ? formatReminderClock(new Date(task.reminderAt)) : null;
  return <View style={[styles.row, dense && styles.dense, rowStyle, // What's left to do is the card on the page; what's finished lies flat and steps back.
    done ? null : { backgroundColor: surfaces.card, boxShadow: `0px 1px 4px ${desk.shadow}` }, { borderRadius: styleTokens.button.radius }]}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={task.title} accessibilityState={{ checked: done }} onPress={onToggle} style={[styles.checkTarget, dense && styles.dense]}>
      <PlanCheck checked={done} surfaces={surfaces} />
    </Pressable>
    <Pressable accessibilityRole={onMore ? 'button' : undefined} accessibilityLabel={onMore ? tr('plan.task.actions', { title: task.title }) : undefined} accessibilityElementsHidden={!onMore} importantForAccessibility={onMore ? 'auto' : 'no-hide-descendants'} onPress={onMore ?? onToggle} style={[styles.body, dense && styles.dense, rowStyle]}>
      <View style={styles.copy}>
        <AppText family={fonts.text} style={[styles.title, { color: done ? surfaces.inkMuted : surfaces.ink }, done && styles.struck]}>{task.title}</AppText>
        {reminder || linked ? <View style={[styles.meta, rowStyle]}>
          {reminder ? <View style={[styles.metaItem, rowStyle]}><Icon name="notifications-outline" size={13} color={surfaces.inkMuted} /><AppText family={fonts.text} style={[styles.metaText, { color: surfaces.inkMuted }]}>{reminder}</AppText></View> : null}
          {linked ? <View style={[styles.metaItem, rowStyle]}><Icon name="attach" size={13} color={surfaces.inkMuted} /><AppText family={fonts.text} style={[styles.metaText, { color: surfaces.inkMuted }]}>{tr('plan.task.linked')}</AppText></View> : null}
        </View> : null}
      </View>
      {onMore ? <Icon name="ellipsis-horizontal" size={18} color={surfaces.inkMuted} /> : null}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 52, alignItems: 'center', paddingEnd: spacing.sm },
  dense: { minHeight: layout.minimumTouchTarget, paddingVertical: 0 },
  checkTarget: { width: layout.minimumTouchTarget + 4, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minHeight: 52, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 15, lineHeight: 20 },
  struck: { textDecorationLine: 'line-through' },
  meta: { flexWrap: 'wrap', gap: spacing.sm },
  metaItem: { alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, lineHeight: 16 },
});
