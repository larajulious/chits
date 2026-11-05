import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { CardRim } from '@/components/desk/card-rim';
import { PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { mix } from '@/constants/style-tokens';
import { FocusText as AppText } from './focus-ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const TICKS = Array.from({ length: 60 }, (_, i) => i);
const RING_RADIUS = 133;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** A tick of the clock, not a glide: nothing runs between seconds during a long session. */
const RING_STEP_MS = 360;
const EASE = Easing.out(Easing.cubic);

/** The clock's face: drawn once, and it never redraws while the time changes. */
const DialFace = memo(function DialFace({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 320 320">
    {TICKS.map((i) => {
      const major = i % 5 === 0;
      const a = (i * 6 - 90) * Math.PI / 180;
      const [outer, inner] = [123, major ? 110 : 117];
      return <Line key={i} x1={160 + outer * Math.cos(a)} y1={160 + outer * Math.sin(a)} x2={160 + inner * Math.cos(a)} y2={160 + inner * Math.sin(a)} stroke={PAPER_INK} strokeOpacity={major ? 0.5 : 0.22} strokeWidth={major ? 3 : 1.6} strokeLinecap="round" />;
    })}
  </Svg>;
});

/**
 * A paper kitchen timer, the cousin of Spin's wheel: a card rim, a paper face
 * with minute ticks. The frame is still on purpose, so only the time and ring
 * inside it (`children`) ever change. `finished` counts completions, each
 * answered by one small swell of the whole clock.
 */
export const FocusDial = memo(function FocusDial({ size, entrance = false, finished = 0, children }: { size: number; entrance?: boolean; finished?: number; children: ReactNode }) {
  const desk = useDesk();
  const reduced = useReducedMotion();
  const intro = useSharedValue(entrance && !reduced ? 0 : 1);
  const swell = useSharedValue(0);
  const knob = Math.round(size * 0.13);
  useEffect(() => { if (intro.get() < 1) intro.set(withDelay(120, withTiming(1, { duration: 320, easing: EASE }))); }, [intro]);
  useEffect(() => {
    if (finished && !reduced) swell.set(withSequence(withTiming(1, { duration: 260, easing: EASE }), withTiming(0, { duration: 420, easing: Easing.inOut(Easing.sin) })));
  }, [finished, reduced, swell]);
  const motion = useAnimatedStyle(() => ({ opacity: intro.get(), transform: [{ scale: (0.95 + 0.05 * intro.get()) * (1 + 0.03 * swell.get()) }] }));
  return <Animated.View style={[{ width: size, height: size + knob * 0.4, alignSelf: 'center', paddingTop: knob * 0.4 }, motion]}>
    <View style={[styles.knob, { width: knob, height: knob * 0.7, marginLeft: -knob / 2, backgroundColor: desk.rim }]} />
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, boxShadow: `0px 5px 10px ${desk.shadow}` }]}><CardRim size={size} rim={desk.rim} fill={PAPER_WHITE} /></View>
      <View style={StyleSheet.absoluteFill}><DialFace size={size} /></View>
      {children}
    </View>
  </Animated.View>;
});

/** Time passing, along the edge of the face. Paused or finished, it simply stays put. */
function FocusRing({ size, fraction }: { size: number; fraction: number }) {
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  const value = useSharedValue(fraction);
  useEffect(() => { value.set(reduced ? fraction : withTiming(fraction, { duration: RING_STEP_MS, easing: EASE })); }, [fraction, reduced, value]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: RING_LENGTH * (1 - value.get()) }));
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width={size} height={size} viewBox="0 0 320 320">
      <Circle cx={160} cy={160} r={RING_RADIUS} fill="none" stroke={PAPER_INK} strokeOpacity={0.08} strokeWidth={8} />
      {/* Starts at twelve o'clock and runs clockwise. */}
      <AnimatedCircle cx={160} cy={160} r={RING_RADIUS} fill="none" stroke={dialRingColor(tokens.accent)} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`} rotation={-90} originX={160} originY={160} animatedProps={props} />
    </Svg>
  </View>;
}
/** The accent, deep enough to read on the white face. Pale Chits Yellow alone would vanish. */
export const dialRingColor = (accent: string) => mix(accent, PAPER_INK, 0.55);

/** What's inside the frame. This is the one part that changes each second. */
export function DialReadout({ size, time, status, label, fraction }: { size: number; time: string; status: string; label: string; fraction: number | null }) {
  const { hand, handBold } = useHandwriting();
  return <>
    {fraction !== null ? <FocusRing size={size} fraction={fraction} /> : null}
    <View accessible accessibilityRole="timer" accessibilityLabel={`${label}. ${status}`} style={styles.center}>
      <AppText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[handBold, styles.time, { fontSize: size * 0.2, lineHeight: size * 0.25, maxWidth: size * 0.62 }]}>{time}</AppText>
      <AppText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[hand, styles.status, { fontSize: Math.max(13, size * 0.07), lineHeight: Math.max(18, size * 0.095), maxWidth: size * 0.56 }]}>{status}</AppText>
    </View>
  </>;
}

const styles = StyleSheet.create({
  knob: { position: 'absolute', top: 0, left: '50%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  time: { color: PAPER_INK, textAlign: 'center', fontVariant: ['tabular-nums'] },
  status: { color: PAPER_INK_MUTED, textAlign: 'center' },
});
