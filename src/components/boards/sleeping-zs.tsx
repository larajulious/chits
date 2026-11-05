import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

const LETTER = 'z';
const FLOAT_MS = 2100;
const RISE = 38;
const LETTERS = [{ size: 13, delay: 0, left: 0 }, { size: 17, delay: 700, left: 10 }, { size: 22, delay: 1400, left: 22 }];

function FloatingZ({ index, color, family }: { index: number; color: string; family?: string }) {
  const { size, delay, left } = LETTERS[index];
  const reduced = useReducedMotion();
  // Without motion the three letters simply rest in a rising line.
  const rise = useSharedValue(reduced ? (index + 1) / 4 : 0);
  useEffect(() => {
    if (reduced) return;
    rise.set(withDelay(delay, withRepeat(withTiming(1, { duration: FLOAT_MS, easing: Easing.out(Easing.quad) }), -1, false)));
    return () => cancelAnimation(rise);
  }, [delay, reduced, rise]);
  const style = useAnimatedStyle(() => ({ opacity: reduced ? 0.8 : Math.sin(rise.get() * Math.PI), transform: [{ translateX: rise.get() * 10 }, { translateY: -rise.get() * RISE }] }));
  return <Animated.Text style={[styles.letter, { left, fontSize: size, lineHeight: size + 4, color, fontFamily: family }, style]}>{LETTER}</Animated.Text>;
}

/** The little z's over a sleeping Chits. Decoration only, so assistive tech skips them. */
export function SleepingZs({ left, top, color, family }: { left: number; top: number; color: string; family?: string }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.zs, { left, top }]}>
    {LETTERS.map((letter, index) => <FloatingZ key={letter.delay} index={index} color={color} family={family} />)}
  </View>;
}

const styles = StyleSheet.create({
  zs: { position: 'absolute', width: 48, height: 24 },
  letter: { position: 'absolute', bottom: 0 },
});
