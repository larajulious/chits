import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedStyle, useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

import { DOT_SPACING, useDesk } from '@/components/desk/desk-surface';
import { useTheme } from '@/components/theme-provider';

/**
 * The desk as a cloth, in the header's coordinates (y = 0 is the hero's resting top).
 * `top` is where the cloth is pinned at both screen edges, `left`/`right` are the
 * fists on the hem at `y`, `center` is the hem's lowest point between the fists,
 * and `bottom` is the hero's current top, where the cloth meets the still desk.
 */
export type PullFabricGeometry = { left: number; right: number; y: number; center: number; width: number; grip: number; top: number; occlusion: number; bottom: number };
const MovingPath = Animated.createAnimatedComponent(Path);
const MovingRect = Animated.createAnimatedComponent(Rect);
const DOT_R = 1.1;
const ABOVE = 16;

// Shading stays neutral and faint: real folds are mostly shadow, never a colored band.
const TONES = {
  light: { hollow: '#D3C4A8', lip: '#4A3420', lipOpacity: 0.26, fold: '#4A3420', foldLayer: 0.055, light: '#FFFFFF', lightLayer: 0.2, hem: 0.75, hemShadow: 0.2 },
  dark: { hollow: '#110E0B', lip: '#000000', lipOpacity: 0.55, fold: '#000000', foldLayer: 0.1, light: '#FFF0D2', lightLayer: 0.035, hem: 0.16, hemShadow: 0.55 },
};

/** Tuck the lower body and forearms behind the sheet; the hands draw in front. */
export function PullFabricMask({ geometry, width, unit, children }: { geometry: SharedValue<PullFabricGeometry>; width: number; unit: number; children: ReactNode }) {
  const above = 2500 * unit;
  // Close behind the sheet while the character is off-screen, before top
  // entry. Grip strength may relax during recoil; it must never uncover the
  // lower body. Reopen only after the character has left the top route.
  // The cloth draws over the body down to the hem's lowest point, so the cut
  // can sit there rather than at the fists.
  const clip = useAnimatedStyle(() => {
    const e = geometry.get();
    return { height: above + above * (1 - e.occlusion) + Math.max(e.y, e.center) * e.occlusion };
  });
  return <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, top: -above, width, overflow: 'hidden' }, clip]}>
    <View collapsable={false} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: above, height: above }}>{children}</View>
  </Animated.View>;
}

function hemCurve(s: number) {
  'worklet';
  const r = 1 - s;
  return 1.5 * s * r * r + 2.5 * s * s * r + s * s * s;
}

/** The hem's height at x: the same curve `hemPath` draws. */
function hemAt(e: PullFabricGeometry, x: number) {
  'worklet';
  const drop = Math.max(0, e.y - e.top);
  if (x <= e.left) return e.top + drop * hemCurve(e.left > 0 ? Math.max(0, x / e.left) : 1);
  if (x >= e.right) {
    const span = e.width - e.right;
    return e.top + drop * hemCurve(span > 0 ? Math.max(0, (e.width - x) / span) : 1);
  }
  const t = (x - e.left) / Math.max(1, e.right - e.left);
  return e.y + 4 * Math.max(0, e.center - e.y) * t * (1 - t);
}

/** Pinned at both screen edges on `top`, pulled down to each fist, sagging a little between them. */
function hemPath(e: PullFabricGeometry) {
  'worklet';
  const drop = Math.max(0, e.y - e.top), L = e.left, R = e.right, W = e.width;
  const sag = Math.max(0, e.center - e.y);
  return `M 0 ${e.top} C ${L / 3} ${e.top + drop * 0.5} ${(2 * L) / 3} ${e.top + (drop * 5) / 6} ${L} ${e.y} `
    + `Q ${(L + R) / 2} ${e.y + 2 * sag} ${R} ${e.y} `
    + `C ${R + (W - R) / 3} ${e.top + (drop * 5) / 6} ${R + ((W - R) * 2) / 3} ${e.top + drop * 0.5} ${W} ${e.top}`;
}

const round = (value: number) => {
  'worklet';
  return Math.round(value * 10) / 10;
};

/**
 * The desk's own dots, carried by the cloth: each column is pulled down with
 * the hem and bunches just under it, easing back onto the still grid by the
 * hero's top so the two meet without a seam. Near each fist the weave is also
 * drawn in sideways, toward the grip.
 */
function clothDots(e: PullFabricGeometry) {
  'worklet';
  const band = e.bottom - e.top;
  if (band <= 4 || Math.max(e.grip, e.occlusion) <= 0.01) return '';
  const half = DOT_SPACING / 2;
  const first = half + Math.ceil((e.top - half) / DOT_SPACING) * DOT_SPACING;
  const r = DOT_R, arc = `a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  let d = '';
  for (let gx = half; gx < e.width + half; gx += DOT_SPACING) {
    const hem = hemAt(e, gx);
    const drop = hem - e.top;
    // Keep each column in order: material never passes the row below it.
    const power = Math.max(1.05, Math.min(2, band / Math.max(1, drop * 1.15)));
    const reach = Math.min(drop, band / (power * 1.05));
    const hand = Math.abs(gx - e.left) <= Math.abs(gx - e.right) ? e.left : e.right;
    const off = (gx - hand) / 44;
    const pinch = 0.12 * e.grip * Math.exp(-off * off);
    for (let gy = first; gy < e.bottom; gy += DOT_SPACING) {
      const w = Math.pow(1 - (gy - e.top) / band, power);
      const y = gy + reach * w;
      if (y < hem + r) continue;
      const x = gx + (hand - gx) * pinch * w;
      d += `M${round(x - r)} ${round(y)}${arc}`;
    }
  }
  return d;
}

/** A thin lens along one side of a fold line: zero width at both ends, widest in the middle. */
function lens(x0: number, y0: number, x1: number, y1: number, curve: number, bulge: number) {
  'worklet';
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const cx = (x0 + x1) / 2 + nx * curve, cy = (y0 + y1) / 2 + ny * curve;
  return `M${round(x0)} ${round(y0)}Q${round(cx)} ${round(cy)} ${round(x1)} ${round(y1)}Q${round(cx + nx * bulge * 2)} ${round(cy + ny * bulge * 2)} ${round(x0)} ${round(y0)}Z`;
}

const SHADOW_LAYERS = 4;
const LIGHT_LAYERS = 2;

/**
 * Tension runs from each fist back to the pinned corner, so two broad folds
 * fan out from each grip toward that screen edge, and the cloth between the
 * fists drapes. SVG blur is too slow to
 * redraw every frame, so each fold is a stack of faint lenses: the outer ones
 * longer and wider, the inner ones shorter and narrower. They add up to a soft
 * shadow that is darkest at the grip and fades out along the fold and away
 * from its ridge, rather than ending in a hard point.
 */
function clothFolds(e: PullFabricGeometry) {
  'worklet';
  const drop = Math.max(0, e.y - e.top);
  const tension = e.grip * Math.min(1, drop / 45);
  const shadow = ['', '', '', ''];
  const light = ['', ''];
  if (tension <= 0.01) return { shadow, light, tension: 0 };
  // [x0, y0, x1, y1, curve, width]: from the grip outward.
  const lines: number[][] = [];
  for (let side = -1; side <= 1; side += 2) {
    const fist = side < 0 ? e.left : e.right;
    const edge = side < 0 ? 0 : e.width;
    lines.push([fist + side * 8, e.y + 2, edge, e.top + 8 + drop * 0.2, -4, 7]);
    lines.push([fist + side * 6, e.y + 10, edge, e.top + 20 + drop * 0.4, -6, 8]);
  }
  const sag = Math.max(0, e.center - e.y);
  lines.push([e.left + 14, e.y + 8, e.right - 14, e.y + 8, 8 + sag * 1.2, 6]);
  for (const [x0, y0, x1, y1, curve, width] of lines) {
    for (let k = 0; k < SHADOW_LAYERS; k++) {
      const reach = 1 - 0.18 * k;
      shadow[k] += lens(x0, y0, x0 + (x1 - x0) * reach, y0 + (y1 - y0) * reach, curve * reach, width * (1 - 0.2 * k));
    }
    for (let k = 0; k < LIGHT_LAYERS; k++) {
      const reach = 0.8 - 0.25 * k;
      light[k] += lens(x0, y0, x0 + (x1 - x0) * reach, y0 + (y1 - y0) * reach, curve * reach, -width * 0.45 * (1 - 0.35 * k));
    }
  }
  return { shadow, light, tension };
}

type ClothShapes = { show: number; grip: number; hem: string; cloth: string; dots: string; shadow: string[]; light: string[]; tension: number };

function FoldLayer({ shapes, kind, index, color, alpha }: { shapes: DerivedValue<ClothShapes>; kind: 'shadow' | 'light'; index: number; color: string; alpha: number }) {
  const props = useAnimatedProps(() => ({ d: shapes.get()[kind][index], opacity: shapes.get().tension }));
  return <MovingPath animatedProps={props} fill={color} fillOpacity={alpha} />;
}

/** What shows where the cloth has been pulled away: a darker pocket under its pinned edge. Draw it behind Chits. */
export function PullFabricHollow({ geometry, width }: { geometry: SharedValue<PullFabricGeometry>; width: number }) {
  const { scheme } = useTheme();
  const tone = TONES[scheme === 'dark' ? 'dark' : 'light'];
  const height = 200;
  // The cloth draws over everything below its hem, so the pocket can be a
  // plain band reaching the hem's lowest point.
  const pocket = useAnimatedProps(() => {
    const e = geometry.get();
    return { y: e.top, height: Math.max(0, Math.max(e.y, e.center) - e.top + 4), opacity: Math.max(e.grip, e.occlusion) };
  });
  const lip = useAnimatedProps(() => ({ y: geometry.get().top, opacity: Math.max(geometry.get().grip, geometry.get().occlusion) }));
  return <Svg pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={width} height={height} viewBox={`0 ${-ABOVE} ${width} ${height}`} style={[styles.canvas, { top: -ABOVE }]}>
    <LinearGradient id="pullHollowLip" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={tone.lip} stopOpacity={tone.lipOpacity} />
      <Stop offset="1" stopColor={tone.lip} stopOpacity={0} />
    </LinearGradient>
    <MovingRect animatedProps={pocket} x={0} width={width} fill={tone.hollow} />
    <MovingRect animatedProps={lip} x={0} width={width} height={16} fill="url(#pullHollowLip)" />
  </Svg>;
}

/** The pulled part of the desk: its own dots bent toward the fists, soft tension folds, and a hem. Draw it over Chits' body, under the hands. */
export function PullFabricFolds({ geometry, width, depth }: { geometry: SharedValue<PullFabricGeometry>; width: number; unit: number; depth: number }) {
  const desk = useDesk();
  const { scheme } = useTheme();
  const tone = TONES[scheme === 'dark' ? 'dark' : 'light'];
  const shapes = useDerivedValue<ClothShapes>(() => {
    const e = geometry.get();
    // The edge is there whenever Chits is behind it, so a peeking head is
    // tucked behind something visible before the hands take hold.
    const present = Math.max(e.grip, e.occlusion);
    const hem = present > 0.01 ? hemPath(e) : '';
    const folds = clothFolds(e);
    return {
      show: present > 0.01 ? 1 : 0,
      grip: present,
      hem,
      cloth: hem ? `${hem} L ${e.width} ${e.bottom + 1} L 0 ${e.bottom + 1} Z` : '',
      dots: clothDots(e),
      ...folds,
    };
  });
  const cloth = useAnimatedProps(() => ({ d: shapes.get().cloth, opacity: shapes.get().show }));
  const dots = useAnimatedProps(() => ({ d: shapes.get().dots, opacity: shapes.get().show }));
  const hemShadow = useAnimatedProps(() => ({ d: shapes.get().hem, opacity: shapes.get().grip }));
  const hem = useAnimatedProps(() => ({ d: shapes.get().hem, opacity: shapes.get().grip }));
  const height = depth + ABOVE;
  return <Svg pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={width} height={height} viewBox={`0 ${-ABOVE} ${width} ${height}`} style={[styles.canvas, { top: -ABOVE }]}>
    <MovingPath animatedProps={cloth} fill={desk.desk} />
    <MovingPath animatedProps={dots} fill={desk.dot} fillOpacity={desk.dotOpacity * 1.5} />
    {Array.from({ length: SHADOW_LAYERS }, (_, index) => <FoldLayer key={`s${index}`} shapes={shapes} kind="shadow" index={index} color={tone.fold} alpha={tone.foldLayer} />)}
    {Array.from({ length: LIGHT_LAYERS }, (_, index) => <FoldLayer key={`l${index}`} shapes={shapes} kind="light" index={index} color={tone.light} alpha={tone.lightLayer} />)}
    {/* The hem's thickness, then its lit top edge. */}
    <MovingPath animatedProps={hemShadow} fill="none" stroke={tone.fold} strokeOpacity={tone.hemShadow} strokeWidth={3} transform="translate(0 2)" />
    <MovingPath animatedProps={hem} fill="none" stroke={tone.light} strokeOpacity={tone.hem} strokeWidth={1.3} strokeLinecap="round" />
  </Svg>;
}

const styles = StyleSheet.create({ canvas: { position: 'absolute', left: 0 } });
