import { cancelAnimation, Easing, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { GESTURES, type GesturePose, type MascotReaction } from './mascot-gestures';
export type GestureValues = { [Key in keyof GesturePose]: SharedValue<number> };
const EASE = Easing.inOut(Easing.sin);

/** Original part transforms only; the artwork and accessory are never morphed. */
export function animateMascotGesture(gesture: MascotReaction, values: GestureValues, rest: GesturePose, compact: boolean, reduced: boolean) {
  const frames = GESTURES[gesture];
  for (const key of Object.keys(rest) as (keyof GesturePose)[]) {
    cancelAnimation(values[key]);
    if (reduced) {
      // No travel/rotation/arm sweep under Reduce Motion, including the egg.
      values[key].set(key === 'happy' ? 1 : key === 'blush' ? 0.8 : key === 'surprise' && gesture === 'surprised' ? 0.5 : rest[key]);
      continue;
    }
    const steps = frames.map(({ ms, pose }) => {
      let target = pose[key] ?? rest[key];
      if (pose[key] !== undefined && (key === 'tilt' || key === 'gaze')) target += rest[key];
      if (compact && key === 'lift') target *= 0.38;
      if (compact && key === 'tilt') target = rest[key] + (target - rest[key]) * 0.65;
      if (compact && key === 'stretch') target *= 0.5;
      return withTiming(target, { duration: ms, easing: EASE });
    });
    values[key].set(withSequence(...steps));
  }
}
