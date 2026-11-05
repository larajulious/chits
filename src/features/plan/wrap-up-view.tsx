import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { layout, spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { PlanAction } from './plan-action';
import { progressOf, type DailyTask } from './plan-core';
import { PlanProgress } from './plan-progress';

type Choice = 'keep' | 'carry' | 'done';
const CHOICES: { key: Choice; label: string }[] = [{ key: 'carry', label: 'plan.wrap.moveTomorrow' }, { key: 'keep', label: 'plan.wrap.keep' }, { key: 'done', label: 'plan.wrap.markDone' }];

type Props = {
  tasks: DailyTask[];
  surfaces: WelcomeSurfaces;
  initialReflection: string | null;
  onCancel: () => void;
  onFinish: (choices: { reflection: string; carry: string[]; complete: string[] }) => void;
};

/** Each unfinished task starts as Keep here: nothing moves unless it's chosen. */
export function WrapUpView({ tasks, surfaces, initialReflection, onCancel, onFinish }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [reflection, setReflection] = useState(initialReflection ?? '');
  const { done, total } = progressOf(tasks);
  const open = tasks.filter((task) => task.completedAt === null);
  const radius = styleTokens.button.radius;
  const finish = () => onFinish({
    reflection,
    carry: open.filter((task) => choices[task.id] === 'carry').map((task) => task.id),
    complete: open.filter((task) => choices[task.id] === 'done').map((task) => task.id),
  });
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  return <View style={styles.root}>
    <PlanProgress done={done} total={total} surfaces={surfaces} />
    {open.length ? <View style={styles.group}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.heading, align, { color: surfaces.ink }]}>{tr('plan.wrap.unfinishedTitle')}</AppText>
      {open.map((task) => {
        const selected = choices[task.id] ?? 'keep';
        return <View key={task.id} style={[styles.task, { backgroundColor: surfaces.card, borderRadius: radius }]}>
          <AppText family={fonts.text} style={[styles.title, align, { color: surfaces.ink }]}>{task.title}</AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel={task.title} style={[styles.choices, rowStyle]}>
            {CHOICES.map((choice) => {
              const active = choice.key === selected;
              return <Pressable key={choice.key} accessibilityRole="radio" accessibilityLabel={tr(choice.label)} accessibilityState={{ selected: active }} onPress={() => setChoices((current) => ({ ...current, [task.id]: choice.key }))} style={[styles.choice, { backgroundColor: active ? surfaces.action : surfaces.control, borderRadius: radius }]}>
                <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} family={active ? fonts.textBold : fonts.text} style={[styles.choiceLabel, { color: active ? surfaces.onAction : surfaces.ink }]}>{tr(choice.label)}</AppText>
              </Pressable>;
            })}
          </View>
        </View>;
      })}
    </View> : null}
    <View style={styles.group}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.heading, align, { color: surfaces.ink }]}>{tr('plan.wrap.question')}</AppText>
      <TextInput multiline value={reflection} onChangeText={setReflection} maxLength={500} accessibilityLabel={tr('plan.wrap.question')} placeholder={tr('plan.wrap.placeholder')} placeholderTextColor={surfaces.inkMuted} style={[styles.reflection, align, { color: surfaces.ink, backgroundColor: surfaces.control, borderRadius: radius }]} />
    </View>
    <PlanAction label={tr('plan.wrap.finish')} surfaces={surfaces} onPress={finish} />
    <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}><AppText family={fonts.textBold} style={{ color: surfaces.inkMuted }}>{tr('plan.wrap.back')}</AppText></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  group: { gap: spacing.xs },
  heading: { fontSize: 17, lineHeight: 23 },
  task: { padding: spacing.sm, gap: spacing.xs },
  title: { fontSize: 15, lineHeight: 20 },
  choices: { gap: spacing.xxs },
  choice: { flex: 1, minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxs },
  choiceLabel: { fontSize: 13 },
  reflection: { minHeight: 76, fontSize: 15, lineHeight: 21, padding: spacing.sm, textAlignVertical: 'top' },
  cancel: { minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
