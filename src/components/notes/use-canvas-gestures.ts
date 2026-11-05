import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, runOnJS, useFrameCallback, useReducedMotion, useSharedValue, withDecay, type SharedValue } from 'react-native-reanimated';

import { cameraLimits, clampZoom, panLimits } from '@/services/note-canvas';
import type { CanvasCameraApi } from './use-canvas-camera';

export const DRAG_NONE = 0;
/** Lifted, waiting for JS to say whether a note was under the finger. */
export const DRAG_PENDING = 1;
export const DRAG_ACTIVE = 2;

/** Held this long without moving, a touch picks a note up. */
export const LIFT_MS = 320;
const PAN_DISTANCE = 8;
const DECELERATION = 0.996;
/** Holding a note this close to an edge moves the board under it, faster the closer it is. */
const EDGE = 52;
const MAX_EDGE_STEP = 11;

export type CanvasDrag = {
  phase: SharedValue<number>;
  fingerX: SharedValue<number>; fingerY: SharedValue<number>;
  /** Where the note was gripped, from its corner, in world points. */
  grabX: SharedValue<number>; grabY: SharedValue<number>;
  lifted: SharedValue<number>;
  setEdgePanning: (active: boolean) => void;
};

type Handlers = {
  /** A long press landed. Decide whether a note lifts (see CanvasDrag.phase). */
  onPick: (x: number, y: number) => void;
  onDrop: (commit: boolean, x: number, y: number) => void;
  onDoubleTap: (x: number, y: number) => void;
  /** The camera came to rest, so the view is worth saving. */
  onSettled: () => void;
  onPanStart: () => void;
  /** A touch stopped a glide, and shouldn't also count as a tap on a note. */
  onCaughtGlide: () => void;
};

/**
 * Every touch on the board goes through one detector, not one per note: notes
 * mount and unmount as the camera moves, and a gesture on one would die with it.
 * Notes stay plain Pressables underneath; whichever gesture activates cancels
 * their press, so a tap is only ever a touch that nothing here claimed.
 *
 * A touch resolves as whichever comes first: moving 8 points pans, holding
 * LIFT_MS still lifts (moving at all before that fails the lift, so a slow pan
 * can never grab a note), and a second finger zooms.
 */
export function useCanvasGestures(camera: CanvasCameraApi, bottomClearance: SharedValue<number>, handlers: Handlers) {
  "use no memo"; // The gesture is built once; handlers are read through a ref at touch time.

  const reduced = useReducedMotion();
  const latest = useRef(handlers);
  useLayoutEffect(() => { latest.current = handlers; });
  const pick = useCallback((x: number, y: number) => latest.current.onPick(x, y), []);
  const drop = useCallback((commit: boolean, x: number, y: number) => latest.current.onDrop(commit, x, y), []);
  const doubleTap = useCallback((x: number, y: number) => latest.current.onDoubleTap(x, y), []);
  const settled = useCallback(() => latest.current.onSettled(), []);
  const panStarted = useCallback(() => latest.current.onPanStart(), []);
  const caughtGlide = useCallback(() => latest.current.onCaughtGlide(), []);

  const phase = useSharedValue(DRAG_NONE);
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const gliding = useSharedValue(false);
  const lifting = useSharedValue(false);

  const { x, y, zoom, minZoom, width, height, extent } = camera;

  const edgePan = useFrameCallback((frame) => {
    if (phase.get() !== DRAG_ACTIVE) return;
    const pace = (frame.timeSincePreviousFrame ?? 16) / 16;
    const px = fingerX.get();
    const py = fingerY.get();
    const right = width.get() - EDGE;
    const bottom = height.get() - bottomClearance.get() - EDGE;
    const stepX = px < EDGE ? MAX_EDGE_STEP * (1 - px / EDGE) : px > right ? -MAX_EDGE_STEP * Math.min(1, (px - right) / EDGE) : 0;
    const stepY = py < EDGE ? MAX_EDGE_STEP * (1 - Math.max(0, py) / EDGE) : py > bottom ? -MAX_EDGE_STEP * Math.min(1, (py - bottom) / EDGE) : 0;
    if (!stepX && !stepY) return;
    const [minX, maxX] = cameraLimits(zoom.get(), width.get());
    const [minY, maxY] = cameraLimits(zoom.get(), height.get());
    x.set(Math.max(minX, Math.min(maxX, x.get() + stepX * pace)));
    y.set(Math.max(minY, Math.min(maxY, y.get() + stepY * pace)));
  }, false);
  const { setActive } = edgePan;

  // The callbacks read `latest` only when a touch arrives, never during render;
  // the react-hooks/refs rule can't see that through runOnJS.
  /* eslint-disable react-hooks/refs */
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().maxPointers(1).minDistance(PAN_DISTANCE)
      .onBegin(() => {
        if (gliding.get()) runOnJS(caughtGlide)();
        gliding.set(false);
        cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom);
      })
      .onStart(() => { startX.set(x.get()); startY.set(y.get()); runOnJS(panStarted)(); })
      .onUpdate((event) => {
        const [left, top, right, bottom] = extent.get();
        const [minX, maxX] = panLimits(zoom.get(), width.get(), left, right, startX.get());
        const [minY, maxY] = panLimits(zoom.get(), height.get(), top, bottom, startY.get());
        x.set(Math.max(minX, Math.min(maxX, startX.get() + event.translationX)));
        y.set(Math.max(minY, Math.min(maxY, startY.get() + event.translationY)));
      })
      .onEnd((event) => {
        if (reduced) { runOnJS(settled)(); return; }
        gliding.set(true);
        const [left, top, right, bottom] = extent.get();
        x.set(withDecay({ velocity: event.velocityX, deceleration: DECELERATION, clamp: panLimits(zoom.get(), width.get(), left, right, x.get()) }));
        y.set(withDecay({ velocity: event.velocityY, deceleration: DECELERATION, clamp: panLimits(zoom.get(), height.get(), top, bottom, y.get()) }, (finished) => {
          gliding.set(false);
          if (finished) runOnJS(settled)();
        }));
      });

    const pinch = Gesture.Pinch()
      .onStart((event) => {
        cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom);
        startZoom.set(zoom.get()); startX.set(x.get()); startY.set(y.get());
        focalX.set(event.focalX); focalY.set(event.focalY);
      })
      .onUpdate((event) => {
        // The world point first under the fingers stays under them, wherever they go.
        const next = clampZoom(startZoom.get() * event.scale, minZoom.get());
        const ratio = next / startZoom.get();
        zoom.set(next);
        x.set(event.focalX - (focalX.get() - startX.get()) * ratio);
        y.set(event.focalY - (focalY.get() - startY.get()) * ratio);
      })
      .onEnd(() => { runOnJS(settled)(); });

    const lift = Gesture.Pan().maxPointers(1).activateAfterLongPress(LIFT_MS)
      .onStart((event) => {
        lifting.set(true);
        phase.set(DRAG_PENDING);
        fingerX.set(event.x); fingerY.set(event.y);
        runOnJS(pick)(event.x, event.y);
      })
      .onChange((event) => {
        fingerX.set(event.x); fingerY.set(event.y);
        // A hold on bare board has nothing to carry, so it pans like any other touch.
        if (phase.get() === DRAG_NONE) {
          const [left, top, right, bottom] = extent.get();
          const [minX, maxX] = panLimits(zoom.get(), width.get(), left, right, x.get());
          const [minY, maxY] = panLimits(zoom.get(), height.get(), top, bottom, y.get());
          x.set(Math.max(minX, Math.min(maxX, x.get() + event.changeX)));
          y.set(Math.max(minY, Math.min(maxY, y.get() + event.changeY)));
        }
      })
      // Finalize also runs for every touch that never lifted, which has nothing to drop.
      .onFinalize((event, success) => {
        if (!lifting.get()) return;
        lifting.set(false);
        runOnJS(drop)(success, event.x, event.y);
      });

    const tapTwice = Gesture.Tap().numberOfTaps(2).maxDelay(280).maxDistance(24)
      .onEnd((event, success) => { if (success) runOnJS(doubleTap)(event.x, event.y); });

    return Gesture.Race(lift, Gesture.Simultaneous(pan, pinch), tapTwice);
  }, [caughtGlide, doubleTap, drop, extent, fingerX, fingerY, focalX, focalY, gliding, height, lifting, minZoom, panStarted, phase, pick, reduced, settled, startX, startY, startZoom, width, x, y, zoom]);
  /* eslint-enable react-hooks/refs */

  const drag = useMemo<CanvasDrag>(() => ({ phase, fingerX, fingerY, grabX, grabY, lifted, setEdgePanning: setActive }), [fingerX, fingerY, grabX, grabY, lifted, phase, setActive]);
  return { gesture, drag };
}
