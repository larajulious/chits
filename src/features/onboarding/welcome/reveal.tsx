import { useEffect, type PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/** Fades and lifts its content in once `visible` turns true. It stays usable while it does. */
export function Reveal({ visible, animate = true, delay = 0, style, children }: PropsWithChildren<{ visible: boolean; animate?: boolean; delay?: number; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced || !animate ? 1 : 0);
  useEffect(() => {
    if (visible) progress.set(reduced || !animate ? 1 : withDelay(delay, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })));
  }, [animate, delay, progress, reduced, visible]);
  const animated = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: (1 - progress.get()) * 14 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
