import { useCallback, useMemo } from 'react';
import { Easing, runOnJS, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { CANVAS_HALF, clampCamera, MIN_ZOOM, type CanvasCamera } from '@/services/note-canvas';

const FLIGHT = { duration: 420, easing: Easing.out(Easing.cubic) };

export type CanvasCameraApi = {
  x: SharedValue<number>; y: SharedValue<number>; zoom: SharedValue<number>;
  /** The lowest zoom a pinch can reach for this board. */
  minZoom: SharedValue<number>;
  width: SharedValue<number>; height: SharedValue<number>;
  /** The notes' extent as [left, top, right, bottom], which bounds panning. */
  extent: SharedValue<[number, number, number, number]>;
  read: () => CanvasCamera;
  jump: (target: CanvasCamera) => void;
  fly: (target: CanvasCamera, onSettled?: () => void) => void;
};

/** The camera lives in shared values so panning and zooming never touch React. */
export function useCanvasCamera(): CanvasCameraApi {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const zoom = useSharedValue(1);
  const minZoom = useSharedValue(MIN_ZOOM);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const flight = useSharedValue(0);
  const extent = useSharedValue<[number, number, number, number]>([-CANVAS_HALF, -CANVAS_HALF, CANVAS_HALF, CANVAS_HALF]);
  const read = useCallback(() => ({ x: x.get(), y: y.get(), zoom: zoom.get() }), [x, y, zoom]);
  const jump = useCallback((target: CanvasCamera) => {
    const next = clampCamera(target, { width: width.get(), height: height.get() });
    x.set(next.x); y.set(next.y); zoom.set(next.zoom);
  }, [height, width, x, y, zoom]);
  const fly = useCallback((target: CanvasCamera, onSettled?: () => void) => {
    if (reduced) { jump(target); onSettled?.(); return; }
    const next = clampCamera(target, { width: width.get(), height: height.get() });
    x.set(withTiming(next.x, FLIGHT));
    y.set(withTiming(next.y, FLIGHT));
    zoom.set(withTiming(next.zoom, FLIGHT));
    // Timed on its own value: an axis already at its target finishes on the first
    // frame, which would report the camera as settled before it has moved.
    flight.set(0);
    flight.set(withTiming(1, FLIGHT, (finished) => { if (finished && onSettled) runOnJS(onSettled)(); }));
  }, [flight, height, jump, reduced, width, x, y, zoom]);
  return useMemo(() => ({ x, y, zoom, minZoom, width, height, extent, read, jump, fly }), [extent, fly, height, jump, minZoom, read, width, x, y, zoom]);
}
