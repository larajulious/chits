import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useDerivedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { ArmPart, ART, BackPart, BlushPart, BodyPart, CastShadowPart, EyePart, ElasticArmPart, ElasticHandPart, FarArmPart, GroundShadowPart, HappyEyePart, PIVOT, SleepingMouthPart, SmilePart, SurprisedMouthPart, TapePart, type ArtBox, type ElasticArmGeometry } from './mascot-art';
import { MASCOT_CUT, MASCOT_VIEWBOX } from './stage-layout';
import type { MascotRig } from './use-mascot-rig';
import { PullFabricMask, type PullFabricGeometry } from '@/components/mascot/pull-fabric';
import { useMascotPreference } from '@/components/mascot/mascot-provider';
import { BandanaPart, BANDANA_BOX } from '@/components/mascot/mascot-still';
import type { MascotVariant } from '@/components/mascot/mascot-variants';
import { useMascotReducedMotion } from '@/components/mascot/use-mascot-accessibility';

/** Chits leans around a point low down by the screen edge, not around their middle. */
const LEAN_PIVOT = { x: 1000, y: 950 };
const TOUCH_AREA: ArtBox = { x: 180, y: 160, w: 870, h: 860 };
/** The light comes from the upper right, so the shadow falls down and to the left. */
const SHADOW_OFFSET = { x: -30, y: 26 };

export type MascotTravel = {
  progress: SharedValue<number>;
  pulse: SharedValue<number>;
  phase: SharedValue<number>;
  targetX: SharedValue<number>;
  targetY: SharedValue<number>;
  targetScale: SharedValue<number>;
  grip: SharedValue<number>;
  reach: SharedValue<number>;
  tension: SharedValue<number>;
  handLeft: SharedValue<{ x: number; y: number }>;
  handRight: SharedValue<{ x: number; y: number }>;
  cloth: SharedValue<PullFabricGeometry>;
  reduced: boolean;
};

type Props = {
  travel?: MascotTravel;
  gripSurface?: ReactNode;
  standalone?: boolean;
  interactive?: boolean;
  variant?: MascotVariant;
  values: MascotRig['values'];
  unit: number;
  screenWidth: number;
  /** Crop more of the same character beyond the right edge on compact surfaces. */
  edgeInset?: number;
  /** Compact listing heroes lean at the shoulder, so a nod keeps the hand on a short page. */
  compact?: boolean;
  sheetTop: SharedValue<number>;
  zoom: SharedValue<number>;
  shadowColor: string;
  label: string;
  hint: string;
  onPress: () => void;
  onLongPress: () => void;
  onPressOut: () => void;
  /** The paper: it sits over Chits' body and under Chits' arm. */
  children: ReactNode;
};

const placed = (box: ArtBox, unit: number) => ({ position: 'absolute' as const, left: box.x * unit, top: box.y * unit, width: box.w * unit, height: box.h * unit });
const originAt = (box: ArtBox, pivot: { x: number; y: number }, unit: number): [number, number, number] => [(pivot.x - box.x) * unit, (pivot.y - box.y) * unit, 0];

function Part({ box, unit, style, origin, children }: { box: ArtBox; unit: number; style?: ComponentProps<typeof Animated.View>['style']; origin?: [number, number, number]; children: ReactNode }) {
  return <Animated.View style={[placed(box, unit), origin ? { transformOrigin: origin } : null, style]}>{children}</Animated.View>;
}

/** The character itself: positioned by the screen edge and the sheet, posed by the rig. */
export function ChitsPeekMascot({ travel, gripSurface, values, unit, screenWidth, edgeInset = 0, compact = false, standalone = false, interactive = true, variant: preview, sheetTop, zoom, shadowColor, label, hint, onPress, onLongPress, onPressOut, children }: Props) {
  const preference = useMascotPreference();
  const variant = preview ?? preference.variant;
  const reduced = useMascotReducedMotion();
  const { edge, tilt, lift, breath, arm, farArm, stretch, press, blink, happy, surprise, blush, gaze, asleep } = values;
  const size = MASCOT_VIEWBOX * unit;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  // The right edge of the screen and the top of the sheet hold Chits in place,
  // so they stay tucked behind both as the sheet moves between steps.
  const placement = useDerivedValue(() => {
    if (standalone) return { x: 0, y: 0, scale: 1 };
    const scale = zoom.get();
    const p = Math.max(0, Math.min(1, travel?.progress.get() ?? 0));
    const x = screenWidth - (edge.get() - edgeInset) * unit * scale;
    const y = sheetTop.get() - MASCOT_CUT * unit * scale;
    if (!travel || travel.reduced) return {
      x: x + ((travel?.targetX.get() ?? x) - x) * p,
      y: y + ((travel?.targetY.get() ?? y) - y) * p,
      scale: scale * (1 + p * ((travel?.targetScale.get() ?? 1) - 1)),
    };
    // One continuous off-screen route: exit right, travel above the header,
    // then peek down. Reversing progress exits up and re-enters from the right.
    const outside = screenWidth + size;
    const above = -size * 2;
    const targetX = travel.targetX.get(), targetY = travel.targetY.get();
    let nextX = targetX, nextY = targetY;
    if (p < 0.22) { nextX = x + (outside - x) * p / 0.22; nextY = y; }
    else if (p < 0.29) { nextX = outside; nextY = y + (above - y) * (p - 0.22) / 0.07; }
    else if (p < 0.36) { nextX = outside + (targetX - outside) * (p - 0.29) / 0.07; nextY = above; }
    else if (p < 0.55) { nextY = above + (targetY - above) * (p - 0.36) / 0.19; }
    return { x: nextX, y: nextY, scale: scale * (1 + Math.min(1, p / 0.55) * (travel.targetScale.get() - 1)) };
  });
  const frame = useAnimatedStyle(() => ({ transform: [{ translateX: placement.get().x }, { translateY: placement.get().y }, { scale: placement.get().scale }] }));
  const pose = useDerivedValue(() => {
    const p = travel?.progress.get() ?? 0;
    const motion = travel?.reduced ? 0 : p;
    const bounce = travel?.pulse.get() ?? 0;
    const force = travel?.reduced ? 0 : (travel?.tension.get() ?? 0) * (travel?.grip.get() ?? 0);
    return {
      y: (lift.get() - breath.get() * 7) * unit * (1 - p) - bounce * 2 * motion - force * 3,
      angle: travel?.reduced ? tilt.get() : tilt.get() * (1 - p) + Math.sin(p * Math.PI) * 4 - force * 2.5,
      xScale: 1 + (-stretch.get() * 0.6 + press.get() * 0.015) * (1 - p) + force * 0.012 + bounce * motion * 0.012,
      yScale: 1 + (breath.get() * 0.012 + stretch.get() - press.get() * 0.025) * (1 - p) - force * 0.015 - bounce * motion * 0.012,
    };
  });
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: pose.get().y }, { rotate: `${pose.get().angle}deg` }, { scaleX: pose.get().xScale }, { scaleY: pose.get().yScale }] }));
  const nearGrip = useDerivedValue<ElasticArmGeometry>(() => {
    if (!travel || !travel.reach.get()) return { path: '', x: 0, y: 0, scale: 1, visible: 0, grip: 0 };
    const g = travel.reach.get();
    const angle = arm.get() * (1 - travel.progress.get()) + (travel.reduced ? 0 : travel.progress.get() * (12 + travel.pulse.get() * 9));
    const reach = 1;
    const pivot = compact ? PIVOT.shoulder : LEAN_PIVOT;
    const project = (x: number, y: number) => projectArmPoint(x, y, PIVOT.shoulder, angle, reach, pivot, unit, placement.get(), pose.get());
    const shoulder = project(300, 825), control = project(175, 780), oldHand = project(166, 875);
    const anchor = travel.handLeft.get();
    const hand = { x: oldHand.x + (anchor.x - oldHand.x) * g, y: oldHand.y + (anchor.y - oldHand.y) * g };
    const cx = control.x * (1 - g) + ((shoulder.x + hand.x) / 2 - Math.min(9, Math.abs(hand.y - shoulder.y) * 0.16)) * g;
    const cy = control.y * (1 - g) + (shoulder.y + (hand.y - shoulder.y) * 0.6) * g;
    return { path: `M ${shoulder.x} ${shoulder.y} Q ${cx} ${cy} ${hand.x} ${hand.y}`, ...hand, scale: placement.get().scale * (0.73 + 0.27 * g), visible: 1, grip: g };
  });
  const farGrip = useDerivedValue<ElasticArmGeometry>(() => {
    if (!travel || !travel.reach.get()) return { path: '', x: 0, y: 0, scale: 1, visible: 0, grip: 0 };
    const g = travel.reach.get();
    const angle = farArm.get() * (1 - travel.progress.get()) + (travel.reduced ? 0 : travel.progress.get() * 125);
    const reach = 1;
    const pivot = compact ? PIVOT.shoulder : LEAN_PIVOT;
    const project = (x: number, y: number) => projectArmPoint(x, y, { x: 1040, y: 690 }, angle, reach, pivot, unit, placement.get(), pose.get());
    const oldShoulder = project(1040, 690), control = project(1105, 660), oldHand = project(1140, 560);
    const attached = projectArmPoint(950, 825, { x: 950, y: 825 }, 0, 1, pivot, unit, placement.get(), pose.get());
    const shoulder = { x: oldShoulder.x + (attached.x - oldShoulder.x) * g, y: oldShoulder.y + (attached.y - oldShoulder.y) * g };
    const anchor = travel.handRight.get();
    const hand = { x: oldHand.x + (anchor.x - oldHand.x) * g, y: oldHand.y + (anchor.y - oldHand.y) * g };
    const cx = control.x * (1 - g) + ((shoulder.x + hand.x) / 2 + Math.min(9, Math.abs(hand.y - shoulder.y) * 0.16)) * g;
    const cy = control.y * (1 - g) + (shoulder.y + (hand.y - shoulder.y) * 0.6) * g;
    return { path: `M ${shoulder.x} ${shoulder.y} Q ${cx} ${cy} ${hand.x} ${hand.y}`, ...hand, scale: placement.get().scale * (0.73 + 0.27 * g), visible: 1, grip: g };
  });
  const armStyle = useAnimatedStyle(() => ({ opacity: (travel?.reach.get() ?? 0) > 0 ? 0 : 1, transform: [{ rotate: `${arm.get() * (1 - (travel?.progress.get() ?? 0)) + (travel?.reduced ? 0 : (travel?.progress.get() ?? 0) * (12 + (travel?.pulse.get() ?? 0) * 9))}deg` } ] }));
  const farBehind = useAnimatedStyle(() => ({ opacity: (travel?.reach.get() ?? 0) > 0 ? 0 : farArm.get() < -45 ? 0 : 1, transform: [{ rotate: `${farArm.get() * (1 - (travel?.progress.get() ?? 0)) + (travel?.reduced ? 0 : (travel?.progress.get() ?? 0) * 125)}deg` }] }));
  const farInFront = useAnimatedStyle(() => ({ opacity: (travel?.reach.get() ?? 0) > 0 ? 0 : farArm.get() < -45 ? 1 : 0, transform: [{ rotate: `${farArm.get() * (1 - (travel?.progress.get() ?? 0)) + (travel?.reduced ? 0 : (travel?.progress.get() ?? 0) * 125)}deg` }] }));
  const ground = useAnimatedStyle(() => ({ opacity: Math.max(0.5, 1 + lift.get() * 0.003), transform: [{ scaleX: Math.max(0.8, 1 + lift.get() * 0.0015) }] }));
  const tapeStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(tilt.get() + (standalone ? 0 : 3)) * -0.7}deg` }] }));
  const blushStyle = useAnimatedStyle(() => ({ opacity: blush.get() * 0.75 }));
  const refreshBlink = useDerivedValue(() => travel && !travel.reduced && travel.phase.get() === 3
    ? Math.max(0, 1 - Math.abs(travel.pulse.get() - 0.85) / 0.12) : 0);
  const eyes = useAnimatedStyle(() => {
    const p = travel?.progress.get() ?? 0;
    return {
      opacity: 1 - happy.get() * (1 - p),
      transform: [{ translateX: gaze.get() * unit * (1 - p) }, { scale: 1 + surprise.get() * 0.14 * (1 - p) }, { scaleY: 1 - (blink.get() * (1 - p) + refreshBlink.get() * p) * 0.92 }],
    };
  });
  const happyEyes = useAnimatedStyle(() => ({
    opacity: happy.get() * (1 - (travel?.progress.get() ?? 0)),
    transform: [{ translateX: gaze.get() * unit }],
  }));

  const smile = useAnimatedStyle(() => ({ opacity: (1 - surprise.get() * (1 - (travel?.progress.get() ?? 0))) * (1 - asleep.get() * (1 - (travel?.progress.get() ?? 0))), transform: [{ translateX: gaze.get() * unit * 0.6 * (1 - (travel?.progress.get() ?? 0)) }] }));
  const surprisedMouth = useAnimatedStyle(() => ({ opacity: surprise.get() * (1 - (travel?.progress.get() ?? 0)) }));
  const sleepingMouth = useAnimatedStyle(() => ({ opacity: asleep.get() * (1 - (travel?.progress.get() ?? 0)) }));

  // A lean around the far edge pushes the resting hand below a short hero.
  // Pivot compact poses at the shoulder so a nod keeps the hand on the page.
  const leanPivot = standalone ? { x: 650, y: 1000 } : compact ? PIVOT.shoulder : LEAN_PIVOT;
  const lean = { transformOrigin: [leanPivot.x * unit, leanPivot.y * unit, 0] as [number, number, number] };
  const bodyModel = <>
   {standalone ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Part box={ART.ground} unit={unit} style={ground}><GroundShadowPart unit={unit} /></Part></View> : null}
   {travel ? <ElasticArmPart geometry={farGrip} unit={unit} width={screenWidth} /> : null}
   <Animated.View pointerEvents="box-none" style={[styles.frame, { width: size, height: size }, frame]}>
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, lean, body]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        {!standalone ? <Part box={{ ...ART.body, x: ART.body.x + SHADOW_OFFSET.x, y: ART.body.y + SHADOW_OFFSET.y }} unit={unit}><CastShadowPart unit={unit} color={shadowColor} /></Part> : null}
        {/* Header travel uses an upper-body pose throughout, including entry
            and return. Fading legs still exposes them between gesture states. */}
        {!travel ? <Part box={ART.back} unit={unit}><BackPart unit={unit} includeFarArm={false} /></Part> : null}
        <Part box={ART.farArm} unit={unit} origin={originAt(ART.farArm, { x: 1040, y: 690 }, unit)} style={farBehind}><FarArmPart unit={unit} /></Part>
        <Part box={ART.body} unit={unit}><BodyPart unit={unit} /></Part>
        {variant === 'chits-ong' ? <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} exiting={reduced ? undefined : FadeOut.duration(120)} style={placed(BANDANA_BOX, unit)}><BandanaPart unit={unit} /></Animated.View> : null}
        <Part box={ART.tape} unit={unit} origin={originAt(ART.tape, PIVOT.tape, unit)} style={tapeStyle}><TapePart unit={unit} /></Part>
        <Part box={ART.blush} unit={unit} style={blushStyle}><BlushPart unit={unit} /></Part>
        <Part box={ART.eyeLeft} unit={unit} style={eyes}><EyePart side="left" unit={unit} /></Part>
        <Part box={ART.eyeRight} unit={unit} style={eyes}><EyePart side="right" unit={unit} /></Part>
        <Part box={ART.eyeLeft} unit={unit} style={happyEyes}><HappyEyePart side="left" unit={unit} /></Part>
        <Part box={ART.eyeRight} unit={unit} style={happyEyes}><HappyEyePart side="right" unit={unit} /></Part>
        <Part box={ART.mouth} unit={unit} style={smile}><SmilePart unit={unit} /></Part>
        <Part box={ART.mouth} unit={unit} style={surprisedMouth}><SurprisedMouthPart unit={unit} /></Part>
        <Part box={ART.mouth} unit={unit} style={sleepingMouth}><SleepingMouthPart unit={unit} /></Part>
        <Part box={ART.farArm} unit={unit} origin={originAt(ART.farArm, { x: 1040, y: 690 }, unit)} style={farInFront}><FarArmPart unit={unit} /></Part>
      </View>
      {interactive ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') onPress();
          else if (nativeEvent.actionName === 'longpress') { if (holdTimer.current) clearTimeout(holdTimer.current); onLongPress(); holdTimer.current = setTimeout(onPressOut, 1600); }
        }}
        delayLongPress={320}
        onPress={onPress}
        onPressIn={() => press.set(reduced ? 0 : withTiming(1, { duration: 80 }))}
        onLongPress={onLongPress}
        onPressOut={() => { press.set(reduced ? 0 : withSpring(0, { damping: 15, stiffness: 230 })); onPressOut(); }}
        style={standalone ? { position: 'absolute', left: 0, top: 0, width: size, height: size } : placed(TOUCH_AREA, unit)}
      /> : null}
    </Animated.View>
   </Animated.View>
</>;
  const nearModel = <>
   {/* The whole arm, in one piece over the body and the paper: split around
       the paper, the wrist shows a cut whenever the two don't line up. */}
   <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size }, frame]}>
    <Animated.View style={[StyleSheet.absoluteFill, lean, body]}>
      <Part box={ART.arm} unit={unit} origin={originAt(ART.arm, PIVOT.shoulder, unit)} style={armStyle}><ArmPart unit={unit} /></Part>
    </Animated.View>
   </Animated.View>
   {travel ? <ElasticArmPart geometry={nearGrip} unit={unit} width={screenWidth} /> : null}
  </>;
  return travel ? <>
    <PullFabricMask geometry={travel.cloth} width={screenWidth} unit={unit}>{bodyModel}{nearModel}</PullFabricMask>
    {children}
    {gripSurface}
    <ElasticHandPart geometry={farGrip} unit={unit} />
    <ElasticHandPart geometry={nearGrip} unit={unit} />
  </> : <>{bodyModel}{children}{nearModel}</>;
}

function projectArmPoint(x: number, y: number, shoulder: { x: number; y: number }, armAngle: number, reach: number,
  pivot: { x: number; y: number }, unit: number, frame: { x: number; y: number; scale: number }, pose: { y: number; angle: number; xScale: number; yScale: number }) {
  'worklet';
  const a = armAngle * Math.PI / 180;
  const ax = x - shoulder.x, ay = (y - shoulder.y) * reach;
  const localX = shoulder.x + ax * Math.cos(a) - ay * Math.sin(a);
  const localY = shoulder.y + ax * Math.sin(a) + ay * Math.cos(a);
  const bx = (localX - pivot.x) * unit * pose.xScale, by = (localY - pivot.y) * unit * pose.yScale;
  const b = pose.angle * Math.PI / 180;
  return { x: frame.x + (pivot.x * unit + bx * Math.cos(b) - by * Math.sin(b)) * frame.scale,
    y: frame.y + (pivot.y * unit + bx * Math.sin(b) + by * Math.cos(b) + pose.y) * frame.scale };
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', left: 0, top: 0, transformOrigin: [0, 0, 0] },
});
