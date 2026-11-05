import { memo, useEffect } from 'react';
import { I18nManager, PixelRatio, StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { connectionCurve, connectionSurface, curvePath } from '@/services/canvas-connections';
import { CANVAS_HALF, type CanvasPosition, type CanvasRect } from '@/services/note-canvas';
import type { CanvasNote } from './canvas-note-card.native';
import type { CanvasCameraApi } from './use-canvas-camera';
import type { CanvasDrag } from './use-canvas-gestures';

export type CanvasMotion = { from: Record<string, CanvasPosition>; to: Record<string, CanvasPosition> };
export type CanvasEdge = { id: string; a: CanvasNote; b: CanvasNote; emphasized: boolean; fresh: boolean };
export type ConnectionMotion = { motion: SharedValue<CanvasMotion>; progress: SharedValue<number> };
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function movingPosition(key: string, fallback: CanvasPosition, motion: CanvasMotion, progress: number) {
  'worklet';
  const from = motion.from[key]; const to = motion.to[key];
  return from && to ? { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress, z: to.z } : fallback;
}

const Connection = memo(function Connection({ edge, ink, camera, drag, dragKey, motion, progress }: ConnectionMotion & { edge: CanvasEdge; ink: string; camera: CanvasCameraApi; drag: CanvasDrag; dragKey: string | null }) {
  const reduced = useReducedMotion(); const draw = useSharedValue(edge.fresh && !reduced ? 0 : 1);
  useEffect(() => { draw.set(reduced ? 1 : withTiming(1, { duration: 360 })); }, [draw, reduced]);
  const a = { key: edge.a.key, x: edge.a.x, y: edge.a.y, z: edge.a.z, width: edge.a.width, height: edge.a.height, tilt: edge.a.tilt };
  const b = { key: edge.b.key, x: edge.b.x, y: edge.b.y, z: edge.b.z, width: edge.b.width, height: edge.b.height, tilt: edge.b.tilt };
  // A static edge has no dependency on gesture or arrangement shared values.
  const movingA = dragKey === a.key; const movingB = dragKey === b.key;
  const animatedProps = useAnimatedProps(() => {
    const positions = motion.get(); const t = positions.from[a.key] || positions.from[b.key] ? progress.get() : 1;
    let pa = movingPosition(a.key, a, positions, t); let pb = movingPosition(b.key, b, positions, t);
    if (movingA || movingB) {
      const pos = { x: (drag.fingerX.get() - camera.x.get()) / camera.zoom.get() - drag.grabX.get(), y: (drag.fingerY.get() - camera.y.get()) / camera.zoom.get() - drag.grabY.get(), z: 0 };
      if (movingA) pa = pos; else pb = pos;
    }
    const lift = movingA || movingB ? 1 + (reduced ? 0 : 0.05) * drag.lifted.get() : 1;
    const ra = movingA ? { ...a, x: pa.x - a.width * (lift - 1) / 2, y: pa.y - a.height * (lift - 1) / 2, width: a.width * lift, height: a.height * lift } : { ...a, ...pa };
    const rb = movingB ? { ...b, x: pb.x - b.width * (lift - 1) / 2, y: pb.y - b.height * (lift - 1) / 2, width: b.width * lift, height: b.height * lift } : { ...b, ...pb };
    const curve = connectionCurve(ra, rb);
    const length = Math.hypot(curve.c1.x - curve.start.x, curve.c1.y - curve.start.y) + Math.hypot(curve.c2.x - curve.c1.x, curve.c2.y - curve.c1.y) + Math.hypot(curve.end.x - curve.c2.x, curve.end.y - curve.c2.y);
    return { d: curvePath(curve, CANVAS_HALF), strokeDashoffset: length * (1 - draw.get()), strokeDasharray: [length, length] };
  });
  return <AnimatedPath animatedProps={animatedProps} stroke={ink} strokeOpacity={edge.emphasized ? 0.78 : 0.35} strokeWidth={edge.emphasized ? 2.4 : 1.6} strokeLinecap="round" fill="none" />;
});

/** SVG shares the papers' world transform; no independent camera or touch layer. */
export function CanvasConnectionLines({ edges, range, ...props }: ConnectionMotion & { edges: CanvasEdge[]; range: CanvasRect | null; ink: string; camera: CanvasCameraApi; drag: CanvasDrag; dragKey: string | null }) {
  if (!range) return null;
  // Android SVG rasterizes its local bounds. Keep that bitmap bounded even at
  // Fit All's lowest zoom; this local scale still inherits the SAME world camera.
  const surface = connectionSurface(range, PixelRatio.get());
  return <Svg pointerEvents="none" accessible={false} width={surface.width} height={surface.height} viewBox={`${range.x + CANVAS_HALF} ${range.y + CANVAS_HALF} ${range.width} ${range.height}`} style={[styles.lines, { [I18nManager.isRTL ? 'right' : 'left']: range.x + CANVAS_HALF, top: range.y + CANVAS_HALF, transformOrigin: [0, 0, 0], transform: [{ scale: surface.scale }] }]}>
    {edges.map((edge) => <Connection key={edge.id} edge={edge} {...props} />)}
  </Svg>;
}
const styles = StyleSheet.create({ lines: { position: 'absolute', top: 0 } });
