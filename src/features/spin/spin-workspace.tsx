import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { REVEAL_MS, RESULT_GAP, WHEEL_TOP_ROOM } from './spin-layout';

const EASE = Easing.out(Easing.cubic);

type Props = {
  size: number;
  compactSize: number;
  /** A result is on the page; the wheel steps back to make room for it. */
  showResult: boolean;
  /** The wheel and result came from a spin just now, rather than being restored. */
  fresh: boolean;
  /** The first visit this launch: the wheel eases into view. */
  entrance: boolean;
  /** A new spin is running: the old result stays, quietly, until the new one lands. */
  waiting: boolean;
  wheel: ReactNode;
  controls: ReactNode;
  result: ReactNode;
};

/**
 * The wheel, what's under it, and the result. Everything that moves here moves
 * by transform and opacity. The result lies over the space the wheel gives up,
 * and only the page's scroll length changes, which nobody can see happen.
 */
export function SpinWorkspace({ size, compactSize, showResult, fresh, entrance, waiting, wheel, controls, result }: Props) {
  const reduced = useReducedMotion();
  const compact = useSharedValue(showResult ? 1 : 0);
  const intro = useSharedValue(entrance && !reduced ? 0 : 1);
  const dim = useSharedValue(0);
  const [resultHeight, setResultHeight] = useState(0);
  useEffect(() => { if (intro.get() < 1) intro.set(withDelay(120, withTiming(1, { duration: 320, easing: EASE }))); }, [intro]);
  useEffect(() => {
    const to = showResult ? 1 : 0;
    if (reduced || (showResult && !fresh)) compact.set(to);
    // The wheel holds on the winning slice for a moment before stepping back.
    else compact.set(withDelay(showResult ? REVEAL_MS.wheel : 0, withTiming(to, { duration: 420, easing: EASE })));
  }, [compact, fresh, reduced, showResult]);
  useEffect(() => { dim.set(reduced ? (waiting ? 1 : 0) : withTiming(waiting ? 1 : 0, { duration: 180 })); }, [dim, reduced, waiting]);
  const wheelMotion = useAnimatedStyle(() => ({
    opacity: intro.get(),
    transform: [{ translateY: -(size - compactSize) / 2 * compact.get() }, { scale: (1 + (compactSize / size - 1) * compact.get()) * (0.94 + 0.06 * intro.get()) }],
  }));
  const controlsMotion = useAnimatedStyle(() => ({ opacity: (1 - compact.get()) * intro.get(), transform: [{ translateY: 20 * compact.get() }] }));
  const resultMotion = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * dim.get() }));
  const resultTop = WHEEL_TOP_ROOM + compactSize + RESULT_GAP;
  return <View style={showResult && resultHeight ? { height: resultTop + resultHeight } : null}>
    <View style={[styles.wheel, { paddingTop: WHEEL_TOP_ROOM, minHeight: size + WHEEL_TOP_ROOM }]}><Animated.View style={[styles.wheelMotion, wheelMotion]}>{wheel}</Animated.View></View>
    <Animated.View style={[styles.controls, controlsMotion]} pointerEvents={showResult ? 'none' : 'box-none'} accessibilityElementsHidden={showResult} importantForAccessibility={showResult ? 'no-hide-descendants' : 'auto'}>{controls}</Animated.View>
    {showResult ? <Animated.View exiting={reduced ? undefined : FadeOut.duration(180)} pointerEvents={waiting ? 'none' : 'box-none'} onLayout={({ nativeEvent }) => setResultHeight(Math.ceil(nativeEvent.layout.height))} style={[styles.result, { top: resultTop }, resultMotion]}>{result}</Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  wheel: { alignItems: 'center', justifyContent: 'flex-start' },
  wheelMotion: { alignSelf: 'stretch' },
  controls: { paddingTop: 10, gap: 8 },
  result: { position: 'absolute', left: 0, right: 0 },
});
