import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/constants/theme';

const SLIDE = 36;

type Props = PropsWithChildren<{
  index: number;
  /** The current step as a moving number: 1.5 is halfway between steps 1 and 2. */
  progress: SharedValue<number>;
  active: boolean;
  height: number;
  /** Stays on screen when the text is large; the copy above it scrolls instead. */
  footer: ReactNode;
  /** For a demo: the words sit at the top, and the demo takes all the room left. */
  dense?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
}>;

/** One step's content inside the sheet. Steps slide and fade across each other. */
export function StepPanel({ index, progress, active, height, footer, dense = false, scrollRef, children }: Props) {
  const insets = useSafeAreaInsets();
  const animated = useAnimatedStyle(() => {
    const distance = index - progress.get();
    return { opacity: interpolate(Math.abs(distance), [0, 0.7], [1, 0], 'clamp'), transform: [{ translateX: distance * SLIDE }] };
  });
  return <Animated.View
    pointerEvents={active ? 'box-none' : 'none'}
    accessibilityElementsHidden={!active}
    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    style={[styles.panel, { height, paddingBottom: Math.max(insets.bottom, spacing.md) }, animated]}
  >
    <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={dense ? styles.denseContent : styles.scrollContent}>{children}</ScrollView>
    <View style={styles.footer}>{footer}</View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  // The top padding clears the hand resting over the paper's edge.
  panel: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: spacing.lg + spacing.xs, paddingHorizontal: spacing.lg },
  body: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  // Sits a little above the middle of the space, so the words stay with the
  // button without crowding Chits' hand.
  scrollContent: { flexGrow: 1, justifyContent: 'center', gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  denseContent: { flexGrow: 1, gap: spacing.xs, paddingBottom: spacing.xs },
  footer: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: spacing.sm, gap: spacing.xs },
});
