import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ArmPart, ART, BackPart, BlushPart, BodyPart, CastShadowPart, EyePart, HappyEyePart, PIVOT, SleepingMouthPart, SmilePart, SurprisedMouthPart, TapePart, type ArtBox } from './mascot-art';
import { MASCOT_CUT, MASCOT_VIEWBOX } from './stage-layout';
import type { MascotRig } from './use-mascot-rig';

/** Chits leans around a point low down by the screen edge, not around their middle. */
const LEAN_PIVOT = { x: 1000, y: 950 };
const TOUCH_AREA: ArtBox = { x: 180, y: 160, w: 870, h: 860 };
/** The light comes from the upper right, so the shadow falls down and to the left. */
const SHADOW_OFFSET = { x: -30, y: 26 };

type Props = {
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
export function ChitsPeekMascot({ values, unit, screenWidth, edgeInset = 0, compact = false, sheetTop, zoom, shadowColor, label, hint, onPress, onLongPress, onPressOut, children }: Props) {
  const { edge, tilt, lift, breath, arm, blink, happy, surprise, blush, gaze, asleep } = values;
  const size = MASCOT_VIEWBOX * unit;

  // The right edge of the screen and the top of the sheet hold Chits in place,
  // so they stay tucked behind both as the sheet moves between steps.
  const frame = useAnimatedStyle(() => {
    const scale = zoom.get();
    return { transform: [{ translateX: screenWidth - (edge.get() - edgeInset) * unit * scale }, { translateY: sheetTop.get() - MASCOT_CUT * unit * scale }, { scale }] };
  });
  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: (lift.get() - breath.get() * 7) * unit }, { rotate: `${tilt.get()}deg` }, { scaleY: 1 + breath.get() * 0.012 }],
  }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arm.get()}deg` }] }));
  const tapeStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(tilt.get() + 3) * -0.7}deg` }] }));
  const blushStyle = useAnimatedStyle(() => ({ opacity: blush.get() * 0.75 }));
  const eyes = useAnimatedStyle(() => ({
    opacity: 1 - happy.get(),
    transform: [{ translateX: gaze.get() * unit }, { scale: 1 + surprise.get() * 0.14 }, { scaleY: 1 - blink.get() * 0.92 }],
  }));
  const happyEyes = useAnimatedStyle(() => ({ opacity: happy.get(), transform: [{ translateX: gaze.get() * unit }] }));
  const smile = useAnimatedStyle(() => ({ opacity: (1 - surprise.get()) * (1 - asleep.get()), transform: [{ translateX: gaze.get() * unit * 0.6 }] }));
  const surprisedMouth = useAnimatedStyle(() => ({ opacity: surprise.get() }));
  const sleepingMouth = useAnimatedStyle(() => ({ opacity: asleep.get() }));

  // A lean around the far edge pushes the resting hand below a short hero.
  // Pivot compact poses at the shoulder so a nod keeps the hand on the page.
  const leanPivot = compact ? PIVOT.shoulder : LEAN_PIVOT;
  const lean = { transformOrigin: [leanPivot.x * unit, leanPivot.y * unit, 0] as [number, number, number] };
  return <>
   <Animated.View pointerEvents="box-none" style={[styles.frame, { width: size, height: size }, frame]}>
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, lean, body]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Part box={{ ...ART.body, x: ART.body.x + SHADOW_OFFSET.x, y: ART.body.y + SHADOW_OFFSET.y }} unit={unit}><CastShadowPart unit={unit} color={shadowColor} /></Part>
        <Part box={ART.back} unit={unit}><BackPart unit={unit} /></Part>
        <Part box={ART.body} unit={unit}><BodyPart unit={unit} /></Part>
        <Part box={ART.tape} unit={unit} origin={originAt(ART.tape, PIVOT.tape, unit)} style={tapeStyle}><TapePart unit={unit} /></Part>
        <Part box={ART.blush} unit={unit} style={blushStyle}><BlushPart unit={unit} /></Part>
        <Part box={ART.eyeLeft} unit={unit} style={eyes}><EyePart side="left" unit={unit} /></Part>
        <Part box={ART.eyeRight} unit={unit} style={eyes}><EyePart side="right" unit={unit} /></Part>
        <Part box={ART.eyeLeft} unit={unit} style={happyEyes}><HappyEyePart side="left" unit={unit} /></Part>
        <Part box={ART.eyeRight} unit={unit} style={happyEyes}><HappyEyePart side="right" unit={unit} /></Part>
        <Part box={ART.mouth} unit={unit} style={smile}><SmilePart unit={unit} /></Part>
        <Part box={ART.mouth} unit={unit} style={surprisedMouth}><SurprisedMouthPart unit={unit} /></Part>
        <Part box={ART.mouth} unit={unit} style={sleepingMouth}><SleepingMouthPart unit={unit} /></Part>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') onPress();
          else if (nativeEvent.actionName === 'longpress') { onLongPress(); setTimeout(onPressOut, 1600); }
        }}
        delayLongPress={320}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressOut={onPressOut}
        style={placed(TOUCH_AREA, unit)}
      />
    </Animated.View>
   </Animated.View>
   {children}
   {/* The whole arm, in one piece over the body and the paper: split around
       the paper, the wrist shows a cut whenever the two don't line up. */}
   <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size }, frame]}>
    <Animated.View style={[StyleSheet.absoluteFill, lean, body]}>
      <Part box={ART.arm} unit={unit} origin={originAt(ART.arm, PIVOT.shoulder, unit)} style={armStyle}><ArmPart unit={unit} /></Part>
    </Animated.View>
   </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', left: 0, top: 0, transformOrigin: [0, 0, 0] },
});
