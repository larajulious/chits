import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useDirection } from '@/localization/provider';

/** A timed session's progress, as a line that glides from one second to the next. */
export function FocusProgress({ fraction, fill, track }: { fraction: number; fill: string; track: string }) {
  const reduced = useReducedMotion();
  const { isRTL } = useDirection();
  const value = useSharedValue(fraction);
  // Each tick eases to the next second over that second, so the line moves continuously.
  useEffect(() => { value.set(reduced ? fraction : withTiming(fraction, { duration: 1000, easing: Easing.linear })); }, [fraction, reduced, value]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: value.get() }] }));
  return <View accessible={false} style={[styles.track, { backgroundColor: track }]}>
    <Animated.View style={[styles.fill, { backgroundColor: fill, transformOrigin: isRTL ? 'right' : 'left' }, grow]} />
  </View>;
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill, borderRadius: 2 },
});
