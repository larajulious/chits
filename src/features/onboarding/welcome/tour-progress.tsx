import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useDirection, useLocale } from '@/localization/provider';
import { ot } from '../strings';
import { FEATURE_STEPS, TOUR_STEP } from './tour-steps';
import type { WelcomeSurfaces } from './welcome-surfaces';

function Segment({ step, progress, track, fill, rtl }: { step: number; progress: SharedValue<number>; track: string; fill: string; rtl: boolean }) {
  const filled = useAnimatedStyle(() => ({ transform: [{ scaleX: interpolate(progress.get(), [step - 1, step], [0, 1], 'clamp') }] }));
  return <View style={[styles.segment, { backgroundColor: track }]}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fill, transformOrigin: [rtl ? '100%' : '0%', '50%', 0] }, filled]} />
  </View>;
}

/** How far through the features someone is. It follows the steps as they slide. */
export function TourProgress({ progress, step, surfaces }: { progress: SharedValue<number>; step: number; surfaces: WelcomeSurfaces }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { isRTL, rowStyle } = useDirection();
  const current = FEATURE_STEPS.findIndex((item) => item === step);
  const visible = current >= 0;
  const label = ot('tour.progress', { step: current + 1, total: FEATURE_STEPS.length });
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [TOUR_STEP.meet, TOUR_STEP.spaces, TOUR_STEP.canvas, TOUR_STEP.finish], [0, 1, 1, 0], 'clamp') }));
  return <Animated.View
    pointerEvents="none"
    accessible={visible}
    accessibilityElementsHidden={!visible}
    importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    accessibilityRole="progressbar"
    accessibilityLabel={label}
    accessibilityValue={{ min: 1, max: FEATURE_STEPS.length, now: current + 1, text: label }}
    style={[styles.row, rowStyle, fade]}
  >
    {FEATURE_STEPS.map((item) => <Segment key={item} step={item} progress={progress} track={surfaces.track} fill={surfaces.action} rtl={isRTL} />)}
  </Animated.View>;
}

const styles = StyleSheet.create({
  // Stops short of the right edge, where Chits' hand rests on the paper.
  row: { width: '58%', height: 6, gap: 5 },
  segment: { flex: 1, borderRadius: 3, overflow: 'hidden' },
});
