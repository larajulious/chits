import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedProps, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText, TSpan } from 'react-native-svg';
import { AppText } from '@/components/ui/primitives';
import { tr } from '@/localization/runtime';
import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, PaperButton, PushPin, useDesk, useHandwriting } from '@/components/desk/paper-desk';

/** One spin: a quick start and a long, gentle slow-down onto the chosen slice. */
export const SPIN_DURATION = 4200;
export const SPIN_EASING = Easing.bezier(0.22, 0.61, 0.12, 1);

const AnimatedG = Reanimated.createAnimatedComponent(G);

/**
 * The wheel: paper slices with their names handwritten on them, in a
 * cardboard rim, under a pushpin that flicks as each slice edge passes. The
 * sticky note in the middle spins it. `highlight` fades every slice but the
 * one it landed on. Memoized: it redraws only when its own props change.
 */
export const SpinWheel = memo(function SpinWheel({ size, rotation, labels, papers, spinning, highlight = null, onSpin, spinDisabled }: {
  size: number; rotation: Animated.Value; labels: string[]; papers: string[]; spinning: boolean;
  highlight?: number | null; onSpin: () => void; spinDisabled: boolean;
}) {
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const count = labels.length;
  const hub = Math.max(44, Math.round(size * 0.27));
  const pin = Math.max(22, Math.round(size * 0.09));
  const fontSize = count > 16 ? 10 : count > 12 ? 11 : count > 8 ? 13 : 16;
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
    const [x, y] = point(center, 98);
    // Text runs along each slice's radius, flipped on the left half so it never reads upside down.
    return { path: count > 1 ? `M160,160 L${a[0]},${a[1]} A146,146 0 0,1 ${b[0]},${b[1]} Z` : null, x, y, lines: fitWheelLabel(label, fontSize, maxLines), turn: count === 1 ? 0 : center > 180 ? center + 90 : center - 90 };
  }), [count, fontSize, labels, maxLines]);
  const described = `${tr(spinning ? 'spin.spinning' : 'spin.title')}${count ? `: ${labels.join(', ')}` : ''}`;
  return <View style={{ width: size, height: size, alignSelf: 'center' }}>
    <View accessible accessibilityRole="image" accessibilityLabel={described} style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: desk.rim, boxShadow: `0px 14px 24px ${desk.shadow}` }]} />
      <View style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 320 320">
          <Circle cx={160} cy={160} r={153} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeDasharray="6 5" />
        </Svg>
      </View>
      <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS={spinning} style={[StyleSheet.absoluteFill, { transform: [{ rotate: turn }] }]}>
        <Svg width={size} height={size} viewBox="0 0 320 320">
          {count <= 1 ? <Circle cx={160} cy={160} r={146} fill={count ? papers[0] : PAPER_WHITE} /> : null}
          {slices.map((slice, i) => <Slice key={i} dim={dim} faded={highlight !== null && highlight !== i}>
            {slice.path ? <Path d={slice.path} fill={papers[i]} stroke={PAPER_WHITE} strokeWidth={2.5} /> : null}
            <G transform={`rotate(${slice.turn} ${slice.x} ${slice.y})`}>
              <SvgText x={slice.x} y={slice.y - (slice.lines.length - 1) * (fontSize + 3) / 2 + fontSize * 0.35} textAnchor="middle" fill={PAPER_INK} fontSize={fontSize} fontFamily={handBold.fontFamily} fontWeight={handBold.fontWeight}>
                {slice.lines.map((line, index) => <TSpan key={index} x={slice.x} dy={index === 0 ? 0 : fontSize + 3}>{line}</TSpan>)}
              </SvgText>
            </G>
          </Slice>)}
        </Svg>
      </Animated.View>
    </View>
    <Animated.View pointerEvents="none" style={[styles.pointer, { top: -pin * 0.55, marginLeft: -pin / 2, transform: flick ? [{ rotate: flick }] : [] }]}><PushPin size={pin} needle /></Animated.View>
    <View style={[styles.hub, { width: hub, height: hub, marginLeft: -hub / 2, marginTop: -hub / 2 }]}>
      <PaperButton paper={PAPER_YELLOW} tilt={-4} accessibilityRole="button" accessibilityLabel={tr('spin.spin')} accessibilityState={{ disabled: spinDisabled, busy: spinning }} disabled={spinDisabled} onPress={onSpin} style={{ width: hub, height: hub }}>
        <AppText numberOfLines={1} adjustsFontSizeToFit style={[handBold, styles.hubLabel, { fontSize: Math.max(15, hub * 0.3), lineHeight: Math.max(19, hub * 0.38) }]}>{tr('spin.hub')}</AppText>
      </PaperButton>
    </View>
  </View>;
});

/** A slice that fades back when another one wins. */
function Slice({ dim, faded, children }: { dim: SharedValue<number>; faded: boolean; children: ReactNode }) {
  const props = useAnimatedProps(() => ({ opacity: faded ? 1 - 0.65 * dim.get() : 1 }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

// A bounded radial label stays between the hub and rim. Full text remains in
// the accessible wheel label, item list and result; stored labels are never cut.
function fitWheelLabel(value: string, fontSize: number, maxLines: number) {
  const glyphs = Array.from(value.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  const width = (glyph: string) => (glyph.codePointAt(0)! > 0x2ff ? 1 : /[MWmw]/.test(glyph) ? 0.85 : 0.6) * fontSize;
  while (glyphs.length && lines.length < maxLines) {
    let used = 0; let end = 0;
    while (end < glyphs.length && used + width(glyphs[end]) <= 80) used += width(glyphs[end++]);
    if (end < glyphs.length && lines.length < maxLines-1) {
      const space = glyphs.slice(0,end).lastIndexOf(' ');
      if (space > 0) end = space+1;
    }
    let line = glyphs.splice(0,Math.max(1,end)).join('').trim();
    if (glyphs.length && lines.length === maxLines-1) {
      const shortened = Array.from(line);
      shortened.splice(Math.max(0,shortened.length-2),2);
      line = shortened.join('').trimEnd()+'…';
    }
    lines.push(line);
  }
  return lines;
}

const styles = StyleSheet.create({
  pointer: { position: 'absolute', left: '50%', transformOrigin: '50% 30%' },
  hub: { position: 'absolute', left: '50%', top: '50%' },
  hubLabel: { color: PAPER_INK, textAlign: 'center' },
});
