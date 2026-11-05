import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { useDirection } from '@/localization/provider';
import { CHECKLIST_ITEMS, type ChecklistItem } from '../checklist';
import { ot } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import type { WelcomeSurfaces } from '../welcome/welcome-surfaces';

function Segment({ filled, animate, surfaces, isRTL }: { filled: boolean; animate: boolean; surfaces: WelcomeSurfaces; isRTL: boolean }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    const target = filled ? 1 : 0;
    fill.set(animate && !reduced ? withTiming(target, { duration: 460, easing: Easing.out(Easing.cubic) }) : target);
  }, [animate, fill, filled, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  return <View style={[styles.segment, { backgroundColor: surfaces.track }]}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: surfaces.action, transformOrigin: [isRTL ? '100%' : '0%', '50%', 0] }, style]} />
  </View>;
}

/** Four segments, one per real task, on the slightly deeper progress surface. */
export function ProgressJourney({ done, animate, surfaces }: { done: readonly ChecklistItem[]; animate: boolean; surfaces: WelcomeSurfaces }) {
  const { isRTL, rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const count = ot('hub.progress.count', { done: done.length, total: CHECKLIST_ITEMS.length });
  return <View
    accessible
    accessibilityRole="progressbar"
    accessibilityLabel={ot('hub.checklist.title')}
    accessibilityValue={{ min: 0, max: CHECKLIST_ITEMS.length, now: done.length, text: count }}
    style={[styles.panel, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}
  >
    <View style={[styles.labels, rowStyle]}>
      <AppText weight="700" family={fonts.display} style={[styles.title, { color: surfaces.ink }]}>{ot('hub.checklist.title')}</AppText>
      <AppText weight="700" family={fonts.textBold} style={[styles.count, { color: surfaces.inkMuted }]}>{count}</AppText>
    </View>
    <View style={[styles.segments, rowStyle]}>
      {CHECKLIST_ITEMS.map((item) => <Segment key={item} filled={done.includes(item)} animate={animate} surfaces={surfaces} isRTL={isRTL} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2, gap: spacing.xs },
  labels: { alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs },
  title: { fontSize: 16, lineHeight: 21 },
  count: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  segments: { gap: spacing.xxs },
  segment: { flex: 1, height: 8, borderRadius: 3, overflow: 'hidden' },
});
