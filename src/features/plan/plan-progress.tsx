import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** "2 of 5 little things done", with one continuous bar so any number of tasks fits. */
export function PlanProgress({ done, total, surfaces }: { done: number; total: number; surfaces: WelcomeSurfaces }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { isRTL } = useDirection();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const share = total ? done / total : 0;
  const fill = useSharedValue(share);
  useEffect(() => { fill.set(reduced ? share : withTiming(share, { duration: 360, easing: Easing.out(Easing.cubic) })); }, [fill, reduced, share]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  const label = tr('plan.progress', { done, total });
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: total, now: done, text: label }} style={styles.root}>
    <AppText weight="700" family={fonts.textBold} style={[styles.label, { color: surfaces.ink }]}>{label}</AppText>
    <View style={[styles.track, { backgroundColor: surfaces.track }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: surfaces.action, transformOrigin: [isRTL ? '100%' : '0%', '50%', 0] }, style]} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  label: { fontSize: 14, lineHeight: 19 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
