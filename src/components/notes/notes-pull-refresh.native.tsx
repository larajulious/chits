import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Pattern, Rect } from 'react-native-svg';
import { spacing } from '@/constants/theme';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { PullFabricFolds, PullFabricHollow, type PullFabricGeometry } from '@/components/mascot/pull-fabric';
import { DOT_SPACING, useDesk } from '@/components/desk/desk-surface';
import { PAPER_YELLOW } from '@/constants/paper';
import { useMascotReducedMotion } from '@/components/mascot/use-mascot-accessibility';
import { AppText } from '@/components/ui/app-text';
import type { MascotTravel } from '@/features/onboarding/welcome/chits-peek-mascot';
import { tr } from '@/localization/runtime';

// Phases live on the UI thread; JS only runs the repository operation and haptic.
const HERO = 0, PULLING = 1, READY = 2, OPENING = 3, RETURNING = 4;
const THRESHOLD = 112;
export const NOTES_MAX_PULL = THRESHOLD * 1.2;
export const NOTES_HEADER_STRETCH = 0.55;
/** Where the fists hold the hem, below the hero's resting top, at the threshold. */
const HEM_AT_THRESHOLD = THRESHOLD * 0.4;
/** Space kept between the status bar and the top of Chits' tape. */
const HEAD_ROOM = 6;
/** Chits' art rows: the top of the tape, and where the hands hold the hem. */
const ART_TOP = 140, ART_CUT = 820;
const SPRING = { damping: 18, stiffness: 210, mass: 0.9 };
type HeaderEdge = PullFabricGeometry;
/** Direct finger tracking while dragging; recoil gets its own single spring. */
function headerStretch(distance: number, journey: number, width: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, (journey - 0.55) / 0.2));
  const grip = p * p * (3 - 2 * p);
  return distance * (0.06 + grip * (NOTES_HEADER_STRETCH - 0.06)) + Math.max(0, Math.min(1, distance / THRESHOLD)) * grip * width * 0.23;
}
type NativeGesture = ReturnType<typeof Gesture.Native>;
type Controller = {
  heroHeight: SharedValue<number>;
  scrollY: SharedValue<number>;
  pull: SharedValue<number>;
  stretch: SharedValue<number>;
  grip: SharedValue<number>;
  peek: SharedValue<number>;
  reach: SharedValue<number>;
  tension: SharedValue<number>;
  release: SharedValue<number>;
  edge: SharedValue<HeaderEdge>;
  phase: SharedValue<number>;
  pulse: SharedValue<number>;
  labelOpacity: SharedValue<number>;
  progress: SharedValue<number>;
  /** The notes' opacity: they fade back while a pull is underway, and return as it lets go. */
  listOpacity: SharedValue<number>;
  reduced: boolean;
  native: NativeGesture;
  stage: HeaderStage | null;
};
type HeaderStage = {
  frame: SharedValue<{ x: number; y: number; width: number; valid: boolean }>;
  corridor: SharedValue<{ left: number; width: number }>;
  safeTop: number;
  register: (node: ReactNode) => void;
};
const StageContext = createContext<HeaderStage | null>(null);

/** The existing toolbar and scrolling hero share one header drawing boundary. */
export function NotesHeaderStage({ children, leadingWidth, trailingWidth }: { children: ReactNode; leadingWidth: number; trailingWidth: number }) {
  const host = useRef<View>(null);
  const { top: safeTop } = useSafeAreaInsets();
  const frame = useSharedValue({ x: 0, y: 0, width: 0, valid: false });
  const corridor = useSharedValue({ left: 0, width: 0 });
  const [node, register] = useState<ReactNode>(null);
  const stage = useMemo(() => ({ frame, corridor, safeTop, register }), [frame, corridor, safeTop]);
  const measureHeader = useCallback(() => {
    host.current?.measureInWindow((x, y, width) => {
      frame.set({ x, y, width, valid: true });
      // Reserve the larger action group on both sides so the single mascot
      // stays on the header centerline even when action counts differ.
      const left = spacing.md + Math.max(leadingWidth, trailingWidth);
      corridor.set({ left, width: Math.max(0, width - left * 2) });
    });
  }, [corridor, frame, leadingWidth, trailingWidth]);
  useLayoutEffect(measureHeader, [measureHeader]);
  return <StageContext.Provider value={stage}>
    <View ref={host} collapsable={false} onLayout={measureHeader} style={styles.flex}>
      {children}
      {node}
    </View>
  </StageContext.Provider>;
}

const Context = createContext<Controller | null>(null);
export function useNotesRefresh() { return useContext(Context); }

/** Pull-to-create controller for the existing toolbar and elastic hero surface. */
export function NotesPullToCreate({ children, scrollY, onCreateNote, canvas, width }: {
  children: ReactNode; scrollY: SharedValue<number>; onCreateNote: () => void; canvas: boolean; width: number;
}) {
  const reduced = useMascotReducedMotion();
  const { height: surfaceHeight } = useWindowDimensions();
  const stage = useContext(StageContext);
  const heroHeight = useSharedValue(THRESHOLD);
  const pull = useSharedValue(0);
  const phase = useSharedValue(HERO);
  const pulse = useSharedValue(0);
  const labelOpacity = useSharedValue(0);
  const progress = useSharedValue(0);
  const release = useSharedValue(0);
  const tension = useDerivedValue(() => Math.max(-0.12, Math.min(1.2, pull.get() / THRESHOLD)));
  // Both clipping boundaries change only on the invisible right-hand leg of
  // the route (.22-.29). The top pose stays tucked even as grip relaxes.
  const peek = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, (progress.get() - 0.22) / 0.07));
    return p * p * (3 - 2 * p);
  });
  // Finish reaching the edge before the cloth starts carrying tension.
  const reach = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, (progress.get() - 0.44) / 0.11));
    return p * p * (3 - 2 * p);
  });
  const grip = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, (progress.get() - 0.55) / 0.2));
    return p * p * (3 - 2 * p);
  });
  // Small pulls leave the notes alone; by the threshold they're well back.
  const listOpacity = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, (progress.get() - 0.15) / 0.85));
    return 1 - 0.65 * p * p * (3 - 2 * p);
  });
  const stretch = useSharedValue(0);
  const edge = useSharedValue<HeaderEdge>({ left: 0, right: 0, y: 0, center: 0, width, grip: 0, top: 0, occlusion: 0, bottom: 0 });
  const start = useSharedValue({ x: 0, y: 0, at: 0 });
  const base = useSharedValue(0);
  const baseStretch = useSharedValue(0);
  const journeyBase = useSharedValue(0);
  const busy = useSharedValue(false);
  const dragging = useSharedValue(false);
  const hapticSent = useSharedValue(false);
  const startsInHero = useSharedValue(true);
  const [status, setStatus] = useState(HERO);
  const alive = useRef(true);
  const createNote = useRef(onCreateNote);
  useLayoutEffect(() => { createNote.current = onCreateNote; });
  const native = useMemo(() => Gesture.Native(), []);
  const reset = useCallback(() => {
    cancelAnimation(stretch); cancelAnimation(pull); cancelAnimation(progress); cancelAnimation(release); cancelAnimation(pulse); cancelAnimation(labelOpacity);
    stretch.set(0); pull.set(0); progress.set(0); release.set(0); pulse.set(0); labelOpacity.set(0); phase.set(HERO); busy.set(false); dragging.set(false); hapticSent.set(false);
  }, [phase, pull, stretch, progress, release, pulse, labelOpacity, busy, dragging, hapticSent]);
  useFocusEffect(useCallback(() => reset, [reset]));
  useEffect(() => { reset(); }, [canvas, width, reset]);
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') reset(); });
    return () => { alive.current = false; subscription.remove(); reset(); };
  }, [reset]);
  const finish = useCallback(() => {
    'worklet';
    phase.set(RETURNING);
    release.set(withSpring(1, { ...SPRING, overshootClamping: true }));
    cancelAnimation(pulse);
    pulse.set(reduced ? 0 : withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 180 })));
    stretch.set(withSpring(0, { ...SPRING, ...(reduced ? { damping: 30, overshootClamping: true } : {}) }));
    pull.set(withSpring(0, { ...SPRING, ...(reduced ? { damping: 30, overshootClamping: true } : {}) }));
    progress.set(withSpring(0, { ...SPRING, overshootClamping: true }, done => { if (done) { phase.set(HERO); busy.set(false); } }));
  }, [phase, pull, stretch, progress, release, pulse, busy, reduced]);
  const openNote = useCallback(() => {
    // Ignore a queued release if the screen lost focus or reset in the meantime.
    if (!alive.current || phase.get() !== OPENING) return;
    finish();
    createNote.current();
  }, [finish, phase]);
  const haptic = useCallback(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }, []);
  useAnimatedReaction(() => phase.get(), (next, previous) => {
    if (next === previous) return;
    labelOpacity.set(withTiming(next === READY ? 1 : 0, { duration: reduced ? 0 : next === OPENING ? 70 : 120 }));
    if (next === READY && !reduced) pulse.set(withRepeat(withSequence(withTiming(0.45, { duration: 500 }), withTiming(0, { duration: 500 })), -1));
    if (next === PULLING) { cancelAnimation(pulse); pulse.set(0); }
    runOnJS(setStatus)(next);
  });
  useEffect(() => {
    if (status === READY) AccessibilityInfo.announceForAccessibility(tr('notesPull.create'));
  }, [status]);
  // Gesture builder callbacks execute on touch events, never during render.
  /* eslint-disable react-hooks/refs, react-hooks/purity */
  const pan = useMemo(() => Gesture.Pan().manualActivation(true).blocksExternalGesture(native)
    .onTouchesDown((event, manager) => {
      const point = event.allTouches[0];
      // Canvas keeps its two-dimensional gestures; pull from its hero only.
      if (!point || event.numberOfTouches !== 1 || scrollY.get() > 0.5 || busy.get() || phase.get() === OPENING || (canvas && point.y > heroHeight.get())) { manager.fail(); return; }
      startsInHero.set(point.y <= heroHeight.get());
      if (phase.get() === RETURNING) { cancelAnimation(pull); cancelAnimation(progress); cancelAnimation(stretch); }
      start.set({ x: point.absoluteX, y: point.absoluteY, at: Date.now() });
      base.set(pull.get()); baseStretch.set(stretch.get()); journeyBase.set(progress.get()); hapticSent.set(false);
    })
    .onTouchesMove((event, manager) => {
      if (dragging.get()) return;
      const point = event.allTouches[0];
      if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
      const dx = point.absoluteX - start.get().x;
      const dy = point.absoluteY - start.get().y;
      if (dy < -6 || Math.abs(dx) > 10 || (Date.now() - start.get().at > 280 && !startsInHero.get())) { manager.fail(); return; }
      if (dy > 8 && scrollY.get() <= 0.5) manager.activate();
    })
    .onStart(() => { dragging.set(true); cancelAnimation(stretch); cancelAnimation(pull); cancelAnimation(progress); release.set(withSpring(0, { ...SPRING, overshootClamping: true })); phase.set(PULLING); })
    .onUpdate(event => {
      // Resistance rises continuously; there is no hard cap that disconnects
      // the character from the finger at the end of a long pull.
      const distance = Math.max(0, -120 * Math.log(1 - Math.min(0.9999, Math.max(0, base.get()) / NOTES_MAX_PULL)) + event.translationY);
      const next = NOTES_MAX_PULL * (1 - Math.exp(-distance / 120));
      pull.set(next);
      const journey = Math.max(0, Math.min(1, journeyBase.get() + (next - base.get()) / THRESHOLD));
      progress.set(journey);
      stretch.set(Math.max(0, baseStretch.get() + headerStretch(next, journey, width) - headerStretch(base.get(), journeyBase.get(), width)));
      phase.set(next >= THRESHOLD ? READY : PULLING);
      if (next >= THRESHOLD && !hapticSent.get()) { hapticSent.set(true); runOnJS(haptic)(); }
    })
    .onEnd(() => {
      if (pull.get() >= THRESHOLD) {
        busy.set(true);
        release.set(1);
        phase.set(OPENING);
        // Open the same draft-only composer as the Write button. The existing
        // spring return runs underneath it; no loading or repository refresh.
        runOnJS(openNote)();
      } else finish();
    })
    .onFinalize((_, success) => { dragging.set(false); if (!success && phase.get() !== OPENING && phase.get() !== HERO) finish(); }),
  [native, heroHeight, scrollY, phase, canvas, start, base, baseStretch, journeyBase, startsInHero, busy, dragging, pull, stretch, progress, release, hapticSent, haptic, reduced, pulse, openNote, finish, width]);
  /* eslint-enable react-hooks/refs, react-hooks/purity */
  const controller = useMemo(() => ({ heroHeight, scrollY, pull, stretch, grip, peek, reach, tension, release, edge, phase, pulse, labelOpacity, progress, listOpacity, reduced, native, stage }), [heroHeight, scrollY, pull, stretch, grip, peek, reach, tension, release, edge, phase, pulse, labelOpacity, progress, listOpacity, reduced, native, stage]);
  // The whole workspace, including its independently sticky filter overlay,
  // moves in one UI-thread transform. Its layout/FlashList measurements stay
  // fixed through both drag and recoil; no onLayout -> JS -> UI feedback loop.
  const contentPull = useAnimatedStyle(() => ({ transform: [{ translateY: stretch.get() }] }));
  return <Context.Provider value={controller}>
    <GestureDetector gesture={pan}><View collapsable={false} style={[styles.flex, styles.viewport]}>
      <NotesElasticSurface width={width} height={surfaceHeight} />
      <Animated.View style={[styles.flex, contentPull]}>{children}</Animated.View>
    </View></GestureDetector>
  </Context.Provider>;
}

/** The original beige/dot surface, with a localized edge under the two grips. */
export function NotesElasticSurface({ width, height }: { width: number; height: number }) {
  const desk = useDesk();
  return <Svg pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={width} height={height} style={[StyleSheet.absoluteFill]}>
    <Pattern id="notesElasticDots" width={DOT_SPACING} height={DOT_SPACING} patternUnits="userSpaceOnUse"><Circle cx={DOT_SPACING / 2} cy={DOT_SPACING / 2} r={1.1} fill={desk.dot} fillOpacity={desk.dotOpacity * 1.5} /></Pattern>
    <Rect width="100%" height="100%" fill={desk.desk} />
    <Rect width="100%" height="100%" fill="url(#notesElasticDots)" />
  </Svg>;
}

function ProgressDot({ index, pulse, reduced, color }: { index: number; pulse: SharedValue<number>; reduced: boolean; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: reduced ? 0.7 : 0.35 + 0.65 * Math.max(0, Math.sin(pulse.get() * Math.PI + index * 1.2)), transform: [{ translateY: reduced ? 0 : -2 * Math.max(0, Math.sin(pulse.get() * Math.PI + index * 1.2)) }] }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** Keep the existing rig mounted once, in the toolbar/hero's shared header. */
export function NotesRefreshMascot({ height, unit, width, children }: { height: number; unit: number; width: number; children: (travel?: MascotTravel, gripSurface?: ReactNode) => ReactNode }) {
  const controller = useNotesRefresh();
  const source = useRef<View>(null);
  const sourceFrame = useSharedValue({ x: 0, y: 0, width: 0, valid: false });
  const heroHeight = controller?.heroHeight;
  const stage = controller?.stage;
  const register = stage?.register;
  useLayoutEffect(() => { heroHeight?.set(height); }, [heroHeight, height]);
  const scrollY = controller?.scrollY;
  const reduced = controller?.reduced;
  const measureSource = useCallback(() => {
    source.current?.measureInWindow((x, y, width) => {
      const offset = scrollY?.get() ?? 0;
      const held = reduced ? 0 : Math.min(Math.max(0, offset), height);
      sourceFrame.set({ x, y: y + offset - held, width, valid: true });
    });
  }, [height, reduced, scrollY, sourceFrame]);
  useLayoutEffect(() => () => sourceFrame.set({ x: 0, y: 0, width: 0, valid: false }), [sourceFrame]);
  useLayoutEffect(() => {
    if (!controller || !stage) return;
    register?.(<HeaderMascot controller={controller} stage={stage} sourceFrame={sourceFrame} height={height} unit={unit} width={width}>{children}</HeaderMascot>);
    return () => register?.(null);
  }, [children, controller, height, register, sourceFrame, stage, unit, width]);
  if (!controller || !stage) return children();
  return <Animated.View ref={source} collapsable={false} pointerEvents="none" onLayout={measureSource} style={StyleSheet.absoluteFill} />;
}

function HeaderMascot({ controller, stage, sourceFrame, height, unit, width, children }: {
  controller: Controller; stage: HeaderStage; sourceFrame: SharedValue<{ x: number; y: number; width: number; valid: boolean }>;
  height: number; unit: number; width: number; children: (travel?: MascotTravel, gripSurface?: ReactNode) => ReactNode;
}) {
  const desk = useDesk();
  const { frame, corridor } = stage;
  const { progress, pulse, phase, reduced, labelOpacity, pull, stretch, grip, peek, reach, tension, edge, scrollY } = controller;
  // Use measureInWindow for both ends so the shared header stays in one
  // window coordinate system on Android and iOS.
  const origin = useDerivedValue(() => {
    const source = sourceFrame.get(), host = frame.get();
    const offset = scrollY.get();
    const held = reduced ? 0 : Math.min(Math.max(0, offset), height);
    return { x: source.x - host.x, y: source.y - host.y - offset + held, width: source.width, valid: source.valid && host.valid };
  });
  // Fit the existing art between measured toolbar action groups. The eye line
  // hangs below the safe-area edge, while the top of the body crops naturally.
  const fitScale = useDerivedValue(() => Math.min(0.92, Math.max(0.35, corridor.get().width / (900 * unit))));
  // The header is clipped at the status bar. Size Chits so the tape-to-hands
  // span fits under it once the hands have pulled the hem down to the
  // threshold, so the head is never cut off at the top.
  const targetScale = useDerivedValue(() => {
    const room = origin.get().y + HEM_AT_THRESHOLD - HEAD_ROOM;
    return Math.min(fitScale.get(), Math.max(0.3, room / ((ART_CUT - ART_TOP) * unit)));
  });
  const targetX = useDerivedValue(() => corridor.get().left + corridor.get().width / 2 - origin.get().x - 625 * unit * targetScale.get());
  // Until the hem comes down that far, Chits waits lower, behind the cloth,
  // and pulling the hem down uncovers the face.
  const targetY = useDerivedValue(() => Math.max(
    edge.get().y - ART_CUT * unit * targetScale.get(),
    -origin.get().y + HEAD_ROOM - ART_TOP * unit * targetScale.get(),
  ));
  const handLeft = useDerivedValue(() => ({ x: edge.get().left, y: edge.get().y }));
  const handRight = useDerivedValue(() => ({ x: edge.get().right, y: edge.get().y }));
  useAnimatedReaction(() => ({
    left: corridor.get().left + corridor.get().width / 2 - origin.get().x - 325 * unit * targetScale.get(),
    right: corridor.get().left + corridor.get().width / 2 - origin.get().x + 325 * unit * targetScale.get(),
    // Reduced motion keeps the hem straight and lets it follow the grip only,
    // so the face is still uncovered.
    y: reduced ? HEM_AT_THRESHOLD * grip.get() : pull.get() * 0.4 * grip.get(),
    center: reduced ? HEM_AT_THRESHOLD * grip.get() : pull.get() * 0.5 * grip.get(),
    width: origin.get().width,
    top: -8,
    grip: grip.get(),
    occlusion: peek.get(),
    // The hero's top, which the cloth reaches down to.
    bottom: stretch.get(),
  }), next => edge.set(next));
  const clipTop = useDerivedValue(() => origin.get().y * (1 - peek.get()));
  const clip = useAnimatedStyle(() => ({
    transform: [{ translateX: origin.get().x }, { translateY: clipTop.get() }],
    width: origin.get().width,
    height: Math.max(0, origin.get().y + height + stretch.get() - clipTop.get() - Math.min(height, Math.max(0, scrollY.get()))),
    opacity: origin.get().valid ? 1 : 0,
  }));
  const position = useAnimatedStyle(() => ({ transform: [{ translateY: origin.get().y - clipTop.get() }] }));
  const feedback = useAnimatedStyle(() => ({
    opacity: labelOpacity.get(),
    // Clear the stretched hands before placing the dots and release label.
    transform: [{ translateY: edge.get().y + (edge.get().right - edge.get().left) * 0.48 }],
  }));
  const travel = useMemo(() => ({ progress, pulse, phase, reduced, targetX, targetY, targetScale, grip, reach, tension, handLeft, handRight, cloth: edge }), [progress, pulse, phase, reduced, targetX, targetY, targetScale, grip, reach, tension, handLeft, handRight, edge]);
  return <Animated.View pointerEvents="box-none" style={[styles.headerClip, clip]}>
    <Animated.View pointerEvents="box-none" style={[styles.mascotOrigin, { height }, position]}>
      <PullFabricHollow geometry={edge} width={width} />
      {children(travel, <PullFabricFolds geometry={edge} width={width} unit={unit} depth={Math.ceil(NOTES_MAX_PULL * NOTES_HEADER_STRETCH + width * 0.23 + 24)} />)}
      <Animated.View pointerEvents="none" style={[styles.label, feedback]}>
        <View style={styles.dots}>{[0, 1, 2].map(index => <ProgressDot key={index} index={index} pulse={pulse} reduced={reduced} color={desk.inkMuted} />)}</View>
        <AppText style={{ color: desk.inkMuted, fontSize: 12 }}>{tr('notesPull.create')}</AppText>
        <View style={[styles.underline, { backgroundColor: PAPER_YELLOW }]} />
      </Animated.View>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewport: { overflow: 'hidden' },
  headerClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  mascotOrigin: { position: 'absolute', left: 0, right: 0 },
  label: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 7 },
  underline: { width: 28, height: 2.5, borderRadius: 3, transform: [{ rotate: '-5deg' }] },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
