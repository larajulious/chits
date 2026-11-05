import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { PAPER_INK, PAPER_WHITE, PAPERS } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import type { DailyTask } from '@/features/plan/plan-core';
import { PLAN_DUSK } from '@/features/plan/plan-hero';
import { PlanProgress } from '@/features/plan/plan-progress';
import { PlanTaskRow } from '@/features/plan/plan-task-row';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { ot, type OnboardingStringKey } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { DemoReset, type DemoProps } from './demo-kit';
import { DEMO_TASKS, demoPlanLine, toggleDemoTask, type DemoTaskId } from './demo-state';

const DAY_MS = 620;
/** Below this, the planner drops the question and tightens up, so all three tasks stay in view. */
const SHORT_SCREEN = 720;
const TASK_NAMES: Record<DemoTaskId, OnboardingStringKey> = { one: 'tour.plan.task.one', two: 'tour.plan.task.two', three: 'tour.plan.task.three' };

/** A planner row's shape, filled with a sample. The id is never looked up anywhere. */
const sampleTask = (id: DemoTaskId, done: boolean, index: number): DailyTask => ({
  id, planId: 'tour', title: ot(TASK_NAMES[id]), completedAt: done ? 1 : null, position: index, reminderAt: null, messageId: null, cardId: null, carriedFrom: null, carriedTo: null,
});

type DayProps = { evening: boolean; dusk: SharedValue<number>; short: boolean; onChange: (evening: boolean) => void };

/** Morning to evening: the sky darkens, and the marker travels across the day. */
function DayStrip({ evening, dusk, short, onChange }: DayProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { isRTL, rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const [width, setWidth] = useState(0);
  const half = width / 2;
  const sky = useAnimatedStyle(() => ({ opacity: dusk.get() }));
  const marker = useAnimatedStyle(() => ({ transform: [{ translateX: (isRTL ? 1 - dusk.get() : dusk.get()) * half }] }));
  const option = (isEvening: boolean, icon: IconName, label: string) => {
    const selected = evening === isEvening;
    const color = selected || !evening ? PAPER_INK : PAPER_WHITE;
    return <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => onChange(isEvening)} style={[styles.dayOption, rowStyle]}>
      <Icon name={icon} size={17} color={color} />
      <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} weight="700" family={fonts.textBold} style={[styles.dayLabel, { color }]}>{label}</AppText>
    </Pressable>;
  };
  const radius = styleTokens.button.radius;
  return <View accessibilityRole="radiogroup" onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} style={[styles.day, short && styles.shortDay, { backgroundColor: PAPERS[0], borderRadius: radius }]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: PLAN_DUSK }, sky]} />
    {width ? <Animated.View pointerEvents="none" style={[styles.dayMarker, { width: half - 6, backgroundColor: PAPER_WHITE, borderRadius: Math.max(0, radius - 3) }, marker]} /> : null}
    <View style={[styles.dayOptions, rowStyle]}>
      {option(false, 'sunny-outline', ot('tour.plan.morning'))}
      {option(true, 'moon-outline', ot('tour.plan.evening'))}
    </View>
  </View>;
}

/** The planner's own rows and progress bar, over three sample tasks that are never saved. */
export function PlanDemo({ surfaces, active, mascot, evening, onEveningChange }: DemoProps & { evening: boolean; onEveningChange: (evening: boolean) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { isRTL, rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const short = useWindowDimensions().height < SHORT_SCREEN;
  const [done, setDone] = useState<readonly DemoTaskId[]>([]);
  const dusk = useSharedValue(evening ? 1 : 0);
  useEffect(() => {
    const to = evening ? 1 : 0;
    dusk.set(reduced ? to : withTiming(to, { duration: DAY_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [dusk, evening, reduced]);

  const toggle = (id: DemoTaskId) => {
    const next = toggleDemoTask(done, id);
    setDone(next);
    void Haptics.selectionAsync().catch(() => undefined);
    const line = next.length > done.length ? demoPlanLine(next.length) : null;
    if (!line || !active) return;
    if (next.length === DEMO_TASKS.length) mascot.cheer(tr(line));
    else mascot.say(tr(line));
  };
  const changeDay = (next: boolean) => {
    if (next === evening) return;
    onEveningChange(next);
    void Haptics.selectionAsync().catch(() => undefined);
    mascot.say(tr(next ? 'plan.say.evening' : 'plan.say.morning'));
  };
  const reset = () => { setDone([]); onEveningChange(false); mascot.rest(); };
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };

  return <View style={[styles.root, short && styles.shortRoot]}>
    <DayStrip evening={evening} dusk={dusk} short={short} onChange={changeDay} />
    {!short ? <Animated.View key={evening ? 'evening' : 'morning'} entering={reduced ? undefined : FadeIn.duration(300)}>
      <AppText weight="700" family={fonts.display} style={[styles.prompt, align, { color: surfaces.ink }]}>{tr(evening ? 'plan.hero.evening' : 'plan.hero.morning')}</AppText>
    </Animated.View> : null}
    <PlanProgress done={done.length} total={DEMO_TASKS.length} surfaces={surfaces} />
    <View style={styles.tasks}>
      {DEMO_TASKS.map((id, index) => <PlanTaskRow key={id} task={sampleTask(id, done.includes(id), index)} surfaces={surfaces} dense={short} onToggle={() => toggle(id)} />)}
    </View>
    <View style={[styles.below, short && styles.shortBelow, rowStyle]}>
      <Animated.View key={evening ? 'wrap' : 'widget'} entering={reduced ? undefined : FadeIn.duration(300)} style={[styles.note, rowStyle]}>
        <View style={[styles.widget, short && styles.shortWidget, { backgroundColor: surfaces.control, borderRadius: Math.min(10, styleTokens.button.radius) }]}>
          <Icon name={evening ? 'moon-outline' : 'grid-outline'} size={17} color={surfaces.ink} />
        </View>
        <AppText family={fonts.text} style={[styles.noteText, short && styles.shortNote, align, { color: surfaces.inkMuted }]}>{evening ? tr('plan.wrap.question') : ot('tour.plan.widget')}</AppText>
      </Animated.View>
      {done.length || evening ? <DemoReset label={ot('tour.tryAgain')} surfaces={surfaces} onPress={reset} /> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  shortRoot: { gap: spacing.xxs },
  day: { height: 44, overflow: 'hidden' },
  shortDay: { height: 38 },
  dayOptions: { flex: 1 },
  dayOption: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  dayLabel: { fontSize: 14, lineHeight: 19, flexShrink: 1 },
  dayMarker: { position: 'absolute', left: 3, top: 3, bottom: 3 },
  prompt: { fontSize: 17, lineHeight: 23, paddingTop: 2 },
  tasks: { gap: spacing.xxs },
  below: { minHeight: 44, alignItems: 'center', gap: spacing.xs },
  shortBelow: { minHeight: 34 },
  note: { flex: 1, alignItems: 'center', gap: spacing.xs },
  widget: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  shortWidget: { width: 28, height: 28 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18 },
  shortNote: { fontSize: 12, lineHeight: 16 },
});
