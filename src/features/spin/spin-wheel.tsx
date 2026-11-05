import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedProps, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText, TSpan } from 'react-native-svg';
import { AppText } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { CardRim } from '@/components/desk/card-rim';
import { tr } from '@/localization/runtime';
import { PAPER_INK, PAPER_WHITE, PaperButton, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { SPIN_DURATION, SPIN_SETTLE_MS, fitWheelLabel, spinOvershoot } from './spin-layout';

// A short wind-up, a long slow-down, then a small drift back onto the slice.
const SPIN_EASING = Easing.bezier(0.3, 0.04, 0.1, 1);
const SETTLE_EASING = Easing.inOut(Easing.sin);

/** One spin onto `target`, on the native driver so it never waits for JS. `target` is where it ends. */
export function spinTo(rotation: Animated.Value, target: number, count: number) {
  return Animated.sequence([
    Animated.timing(rotation, { toValue: target + spinOvershoot(count), duration: SPIN_DURATION - SPIN_SETTLE_MS, easing: SPIN_EASING, useNativeDriver: true }),
    Animated.timing(rotation, { toValue: target, duration: SPIN_SETTLE_MS, easing: SETTLE_EASING, useNativeDriver: true }),
  ]);
}

const AnimatedG = Reanimated.createAnimatedComponent(G);

/** The pointer: a dark tab held by the pin, reading clearly on every slice. */
function WheelPointer({ size }: { size: number }) {
  return <Svg pointerEvents="none" width={size} height={size * 1.3} viewBox="0 0 40 52">
    <Path d="M7 15C7 7 13 3 20 3s13 4 13 12c0 3-1 5-2 8L22.4 47c-.8 2-4 2-4.8 0L9 23c-1-3-2-5-2-8z" fill={PAPER_INK} stroke={PAPER_WHITE} strokeWidth={2.5} strokeLinejoin="round" />
    <Circle cx={20} cy={15} r={7.5} fill="#E2483D" />
    <Circle cx={17.6} cy={12.6} r={2.4} fill="#F28B83" />
  </Svg>;
}

/**
 * The wheel: paper slices with their names written on them, in a card rim,
 * under a pointer that flicks as each slice edge passes. The button in the
 * middle spins it. `highlight` fades every slice but the one it landed on.
 * Memoized: it redraws only when its own props change, and the turning itself
 * happens on one layer, off the JS thread.
 */
export const SpinWheel = memo(function SpinWheel({ size, rotation, labels, papers, spinning, highlight = null, onSpin, spinDisabled, labelSize }: {
  size: number; rotation: Animated.Value; labels: string[]; papers: string[]; spinning: boolean;
  highlight?: number | null; onSpin: () => void; spinDisabled: boolean;
  /** Overrides the type size, in wheel units, for a small wheel with few slices. */
  labelSize?: number;
}) {
  const desk = useDesk();
  const { tokens } = useTheme();
  const { handBold } = useHandwriting();
  const count = labels.length;
  const hub = Math.max(44, Math.round(size * 0.27));
  const washer = hub + Math.round(size * 0.035);
  const pin = Math.max(24, Math.round(size * 0.1));
  const fontSize = labelSize ?? (count > 16 ? 10 : count > 12 ? 11 : count > 8 ? 13 : 16);
  const maxLines = count > 12 ? 1 : count > 6 ? 2 : 3;
  const dim = useSharedValue(0);
  useEffect(() => { dim.set(withTiming(highlight === null ? 0 : 1, { duration: 420 })); }, [dim, highlight]);
  const turn = useMemo(() => rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }), [rotation]);
  // The pin's needle catches each slice edge as it passes and snaps back. A
  // landing always rests well inside a slice, so the pin stands straight at rest.
  const flick = useMemo(() => {
    if (count < 2) return null;
    const slice = 360 / count;
    return Animated.modulo(Animated.add(rotation, slice / 2), slice).interpolate({ inputRange: [0, slice * 0.07, slice * 0.2, slice], outputRange: ['0deg', '-20deg', '0deg', '0deg'] });
  }, [count, rotation]);
  const slices = useMemo(() => labels.map((label, i) => {
    const point = (angle: number, radius: number) => { const a = (angle - 90) * Math.PI / 180; return [160 + radius * Math.cos(a), 160 + radius * Math.sin(a)]; };
    const half = 180 / count;
    const center = i * 360 / count;
    const [a, b] = [point(center - half, 146), point(center + half, 146)];
    const [x, y] = point(center, 100);
    const { lines, size: textSize } = fitWheelLabel(label, fontSize, maxLines);
    // Text runs along each slice's radius, flipped on the left half so it never reads upside down.
    return { path: count > 1 ? `M160,160 L${a[0]},${a[1]} A146,146 0 0,1 ${b[0]},${b[1]} Z` : null, x, y, lines, textSize, turn: count === 1 ? 0 : center > 180 ? center + 90 : center - 90 };
  }), [count, fontSize, labels, maxLines]);
  const described = `${tr(spinning ? 'spin.spinning' : 'spin.title')}${count ? `: ${labels.join(', ')}` : ''}`;
  return <View style={{ width: size, height: size, alignSelf: 'center' }}>
    <View accessible accessibilityRole="image" accessibilityLabel={described} style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, boxShadow: `0px 8px 14px ${desk.shadow}` }]}><CardRim size={size} rim={desk.rim} /></View>
      <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS={spinning} style={[StyleSheet.absoluteFill, { transform: [{ rotate: turn }] }]}>
        <Svg width={size} height={size} viewBox="0 0 320 320">
          {count <= 1 ? <Circle cx={160} cy={160} r={146} fill={count ? papers[0] : PAPER_WHITE} /> : null}
          {slices.map((slice, i) => <Slice key={i} dim={dim} faded={highlight !== null && highlight !== i}>
            {slice.path ? <Path d={slice.path} fill={papers[i]} stroke={PAPER_WHITE} strokeWidth={2.5} /> : null}
            <G transform={`rotate(${slice.turn} ${slice.x} ${slice.y})`}>
              <SvgText x={slice.x} y={slice.y - (slice.lines.length - 1) * (slice.textSize + 3) / 2 + slice.textSize * 0.35} textAnchor="middle" fill={PAPER_INK} fontSize={slice.textSize} fontFamily={handBold.fontFamily} fontWeight={handBold.fontWeight}>
                {slice.lines.map((line, index) => <TSpan key={index} x={slice.x} dy={index === 0 ? 0 : slice.textSize + 3}>{line}</TSpan>)}
              </SvgText>
            </G>
          </Slice>)}
        </Svg>
      </Animated.View>
    </View>
    <Animated.View pointerEvents="none" style={[styles.pointer, { top: -pin * 0.62, marginLeft: -pin / 2, transform: flick ? [{ rotate: flick }] : [] }]}><WheelPointer size={pin} /></Animated.View>
    <View pointerEvents="none" style={[styles.hub, { width: washer, height: washer, marginLeft: -washer / 2, marginTop: -washer / 2, borderRadius: washer / 2, backgroundColor: PAPER_WHITE, boxShadow: `0px 2px 5px ${desk.shadow}` }]} />
    <View style={[styles.hub, { width: hub, height: hub, marginLeft: -hub / 2, marginTop: -hub / 2 }]}>
      <PaperButton paper={tokens.accent} accessibilityRole="button" accessibilityLabel={tr('spin.spin')} accessibilityState={{ disabled: spinDisabled, busy: spinning }} disabled={spinDisabled} onPress={onSpin} style={{ width: hub, height: hub, borderRadius: hub / 2 }}>
        <AppText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[handBold, styles.hubLabel, { color: tokens.accentText, fontSize: Math.max(15, hub * 0.28), lineHeight: Math.max(19, hub * 0.36) }]}>{tr('spin.hub')}</AppText>
      </PaperButton>
    </View>
  </View>;
});

/** A slice that fades back when another one wins. */
function Slice({ dim, faded, children }: { dim: SharedValue<number>; faded: boolean; children: ReactNode }) {
  const props = useAnimatedProps(() => ({ opacity: faded ? 1 - 0.65 * dim.get() : 1 }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

const styles = StyleSheet.create({
  pointer: { position: 'absolute', left: '50%', transformOrigin: '50% 28%' },
  hub: { position: 'absolute', left: '50%', top: '50%' },
  hubLabel: { textAlign: 'center', paddingHorizontal: 6 },
});
