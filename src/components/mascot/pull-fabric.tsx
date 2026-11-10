import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useDesk } from '@/components/desk/desk-surface';
import { PAPER_YELLOW } from '@/constants/paper';
import { useTheme } from '@/components/theme-provider';

export type PullFabricGeometry = { left: number; right: number; y: number; center: number; width: number; grip: number; top: number; occlusion: number };
const MovingPath = Animated.createAnimatedComponent(Path);

/** Tuck the lower body and forearms behind the sheet; the hands draw in front. */
export function PullFabricMask({ geometry, width, unit, children }: { geometry: SharedValue<PullFabricGeometry>; width: number; unit: number; children: ReactNode }) {
  const above = 2500 * unit;
  // Close behind the sheet while the character is off-screen, before top
  // entry. Grip strength may relax during recoil; it must never uncover the
  // lower body. Reopen only after the character has left the top route.
  const clip = useAnimatedStyle(() => {
    const e = geometry.get();
    return { height: above + above * (1 - e.occlusion) + e.y * e.occlusion };
  });
  return <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, top: -above, width, overflow: 'hidden' }, clip]}>
    <View collapsable={false} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: above, height: above }}>{children}</View>
  </Animated.View>;
}

/** Soft tapered folds converge at the grips, rather than a drawn rubber line. */
export function PullFabricFolds({ geometry, width }: { geometry: SharedValue<PullFabricGeometry>; width: number; unit: number }) {
  const desk = useDesk();
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const above = 16;
  const canvasHeight = 180;
  const shadow = dark ? '#080604' : '#9E7F64';
  const light = dark ? '#6E5B43' : '#FFF9EE';
  return <Svg pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={width} height={canvasHeight} viewBox={`0 ${-above} ${width} ${canvasHeight}`} style={[styles.canvas, { top: -above }]}>
    <LinearGradient id="pullFoldLeft" x1="0%" y1="100%" x2="100%" y2="0%">
      <Stop offset="0" stopColor={shadow} stopOpacity={0} /><Stop offset="0.26" stopColor={shadow} stopOpacity={0.28} /><Stop offset="0.48" stopColor={light} stopOpacity={0.94} /><Stop offset="0.7" stopColor={shadow} stopOpacity={0.2} /><Stop offset="1" stopColor={shadow} stopOpacity={0} />
    </LinearGradient>
    <LinearGradient id="pullFoldRight" x1="100%" y1="100%" x2="0%" y2="0%">
      <Stop offset="0" stopColor={shadow} stopOpacity={0} /><Stop offset="0.26" stopColor={shadow} stopOpacity={0.28} /><Stop offset="0.48" stopColor={light} stopOpacity={0.94} /><Stop offset="0.7" stopColor={shadow} stopOpacity={0.2} /><Stop offset="1" stopColor={shadow} stopOpacity={0} />
    </LinearGradient>
    <LinearGradient id="pullFoldLip" x1="0%" y1="0%" x2="0%" y2="100%">
      <Stop offset="0" stopColor={shadow} stopOpacity={0.36} /><Stop offset="0.25" stopColor={light} stopOpacity={0.98} /><Stop offset="0.56" stopColor={shadow} stopOpacity={0.22} /><Stop offset="1" stopColor={desk.desk} stopOpacity={0} />
    </LinearGradient>
    {[0, 1, 2].map(index => <Fold key={`l-${index}`} geometry={geometry} side="left" index={index} />)}
    {[0, 1, 2].map(index => <Fold key={`r-${index}`} geometry={geometry} side="right" index={index} />)}
    <GatheredEdge geometry={geometry} color={desk.desk} />
    <FoldLip geometry={geometry} />
    <GripAccents geometry={geometry} />
  </Svg>;
}

function Fold({ geometry, side, index }: { geometry: SharedValue<PullFabricGeometry>; side: 'left' | 'right'; index: number }) {
  const props = useAnimatedProps(() => {
    const e = geometry.get();
    const mirror = side === 'right';
    const hand = mirror ? e.width - e.right : e.left;
    const start = e.top + index * Math.abs(e.top) * 0.3;
    const spread = 10 + index * 5;
    const x = (value: number) => mirror ? e.width - value : value;
    return { d: `M ${x(0)} ${start - spread} C ${x(hand * 0.36)} ${start + (e.y - start) * 0.35} ${x(hand - 36)} ${e.y - 11 - index * 2} ${x(hand)} ${e.y} C ${x(hand - 28)} ${e.y + 7 + index * 3} ${x(hand * 0.26)} ${start + (e.y - start) * 0.7} ${x(0)} ${start + spread} Z`, opacity: e.grip * (0.86 - index * 0.12) };
  });
  return <MovingPath animatedProps={props} fill={`url(#${side === 'left' ? 'pullFoldLeft' : 'pullFoldRight'})`} />;
}

function GatheredEdge({ geometry, color }: { geometry: SharedValue<PullFabricGeometry>; color: string }) {
  const props = useAnimatedProps(() => {
    const e = geometry.get(), span = e.right - e.left;
    return { d: `M ${e.left} ${e.y - 12} C ${e.left + span * 0.3} ${e.center - 12} ${e.right - span * 0.3} ${e.center - 12} ${e.right} ${e.y - 12} L ${e.right} ${e.y} L ${e.left} ${e.y} Z`, opacity: e.grip };
  });
  return <MovingPath animatedProps={props} fill={color} />;
}

function FoldLip({ geometry }: { geometry: SharedValue<PullFabricGeometry> }) {
  const props = useAnimatedProps(() => {
    const e = geometry.get();
    const span = e.right - e.left;
    return { d: `M ${e.left} ${e.y - 12} C ${e.left + span * 0.3} ${e.center - 12} ${e.right - span * 0.3} ${e.center - 12} ${e.right} ${e.y - 12} C ${e.right - span * 0.25} ${e.center + 17} ${e.left + span * 0.25} ${e.center + 17} ${e.left} ${e.y} Z`, opacity: e.grip };
  });
  return <MovingPath animatedProps={props} fill="url(#pullFoldLip)" />;
}

function GripAccents({ geometry }: { geometry: SharedValue<PullFabricGeometry> }) {
  const props = useAnimatedProps(() => {
    const e = geometry.get();
    return { d: `M ${e.left - 25} ${e.y + 3} l -8 -5 M ${e.left - 27} ${e.y + 13} l -9 1 M ${e.right + 25} ${e.y + 3} l 8 -5 M ${e.right + 27} ${e.y + 13} l 9 1`, opacity: e.grip };
  });
  return <><MovingPath animatedProps={props} fill="none" stroke="#FFF9EC" strokeWidth={6} strokeLinecap="round" /><MovingPath animatedProps={props} fill="none" stroke={PAPER_YELLOW} strokeWidth={3.5} strokeLinecap="round" /></>;
}

const styles = StyleSheet.create({ canvas: { position: 'absolute', left: 0 } });
