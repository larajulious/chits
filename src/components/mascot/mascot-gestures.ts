export const GESTURE_WEIGHTS = { wave: 18, happy: 16, laugh: 14, thinking: 12, shy: 10, surprised: 9, sleepy: 7, peekaboo: 6, dance: 5, dizzy: 3 } as const;
export type MascotGesture = keyof typeof GESTURE_WEIGHTS;
export type MascotReaction = MascotGesture | 'easteregg';
export type MascotContext = 'welcome' | 'getting-started' | 'notes' | 'boards' | 'plan' | 'focus' | 'spin' | 'settings' | 'general';
export type GesturePose = { arm: number; farArm: number; tilt: number; lift: number; stretch: number; blink: number; happy: number; surprise: number; blush: number; gaze: number };
export type GestureFrame = { ms: number; pose: Partial<GesturePose> };
const frame = (ms: number, pose: Partial<GesturePose> = {}): GestureFrame => ({ ms, pose });
// Tilt/gaze are offsets from the screen's rest pose. The final empty pose is
// resolved to that same rest pose, not to an unrelated character or expression.
export const GESTURES: Record<MascotReaction, readonly GestureFrame[]> = {
  wave: [frame(180, { arm: 112, tilt: -2, blush: 0.7 }), frame(130, { arm: 80 }), frame(130, { arm: 122 }), frame(130, { arm: 80 }), frame(130, { arm: 122 }), frame(130, { arm: 94 }), frame(300)],
  shy: [frame(260, { arm: -135, farArm: -110, tilt: 4, lift: 14, blink: 0.55, blush: 1, gaze: 10 }), frame(380, { arm: -135, farArm: -110, tilt: 4, lift: 14, blink: 0.55, blush: 1, gaze: 10 }), frame(240, { arm: -118, farArm: -90, tilt: 2, blink: 0.1, blush: 1, gaze: -12 }), frame(380)],
  laugh: [frame(140, { happy: 1, blush: 1, lift: -16, stretch: 0.025, arm: 18, farArm: -12 }), frame(160, { happy: 1, blush: 1, lift: 0, stretch: -0.02 }), frame(140, { happy: 1, lift: -20, tilt: 2, stretch: 0.025 }), frame(160, { happy: 1, lift: 0, tilt: -2, stretch: -0.02 }), frame(140, { happy: 1, lift: -12, stretch: 0.02 }), frame(340)],
  sleepy: [frame(400, { arm: -30, farArm: -24, stretch: 0.025, blink: 0.5, tilt: 2 }), frame(460, { blink: 1, tilt: 6, lift: 12, surprise: 0.45 }), frame(240, { blink: 0.25, tilt: 2, surprise: 0.1 }), frame(340)],
  happy: [frame(140, { happy: 1, blush: 1, arm: 115, farArm: -28, stretch: -0.025, lift: 8 }), frame(190, { happy: 1, blush: 1, arm: 115, farArm: -28, lift: -38, stretch: 0.035 }), frame(180, { happy: 1, arm: 104, lift: 0, stretch: -0.025 }), frame(180, { happy: 1, arm: 115, farArm: -28, lift: -30, stretch: 0.025 }), frame(170, { happy: 1, lift: 0, stretch: -0.02 }), frame(320)],
  thinking: [frame(320, { farArm: -80, arm: -12, tilt: -5, gaze: -16, blink: 0.15 }), frame(700, { farArm: -80, arm: -12, tilt: -5, gaze: -16, blink: 0.15 }), frame(380)],
  surprised: [frame(110, { surprise: 1, happy: 0, lift: -28, stretch: 0.04, arm: 60, farArm: 16 }), frame(240, { surprise: 1, happy: 0, lift: -28, stretch: 0.04, arm: 60, farArm: 16 }), frame(400)],
  peekaboo: [frame(260, { lift: 110, blink: 0.6, arm: -120, farArm: -95, tilt: 3 }), frame(300, { lift: 110, blink: 0.6, arm: -120, farArm: -95, tilt: 3 }), frame(380, { lift: 65, gaze: -16, blink: 0.1, tilt: -2 }), frame(170, { lift: -18, happy: 1, arm: 100, stretch: 0.025 }), frame(360)],
  dance: [frame(200, { tilt: -6, lift: -8, arm: 104, farArm: 20, happy: 1 }), frame(220, { tilt: 6, lift: -4, arm: 55, farArm: -35, happy: 1 }), frame(220, { tilt: -6, lift: -8, arm: 115, farArm: 15, happy: 1 }), frame(220, { tilt: 5, lift: -4, arm: 55, farArm: -35, happy: 1 }), frame(170, { lift: -25, arm: 104, farArm: -18, happy: 1, stretch: 0.025 }), frame(340)],
  dizzy: [frame(180, { tilt: 6, gaze: -14, arm: 30, farArm: 14, surprise: 0.25 }), frame(220, { tilt: -6, gaze: 14, arm: 12, farArm: -12, surprise: 0.25 }), frame(240, { tilt: 4, gaze: -9, arm: 20 }), frame(260, { tilt: -3, gaze: 6 }), frame(380)],
  easteregg: [frame(130, { surprise: 1, happy: 0, lift: -14, stretch: 0.025 }), ...[5, -5, 5, -5].map(tilt => frame(90, { tilt, surprise: 1, happy: 0 })), ...[6, -6, 4, -3].map(tilt => frame(160, { tilt, gaze: -tilt * 2, surprise: 0.4, happy: 0 })), frame(320, { tilt: 0, gaze: 0, surprise: 0.1 }), frame(180, { arm: 115, happy: 1, blush: 1 }), frame(140, { arm: 80, happy: 1 }), frame(140, { arm: 115, happy: 1 }), frame(140, { arm: 84, happy: 1 }), frame(340)],
};
export function gestureDuration(gesture: MascotReaction) { return GESTURES[gesture].reduce((sum, item) => sum + item.ms, 0); }
export function chooseMascotGesture(previous: MascotGesture | null, context: MascotContext = 'general', random = Math.random): MascotGesture {
  const choices = (Object.keys(GESTURE_WEIGHTS) as MascotGesture[]).filter(key => key !== previous);
  const weight = (key: MascotGesture) => GESTURE_WEIGHTS[key] * (context === 'welcome' && key === 'wave' ? 3 : context === 'getting-started' && key === 'happy' ? 2 : context === 'focus' && ['sleepy', 'thinking'].includes(key) ? 2 : 1);
  let point = Math.max(0, Math.min(0.999999, random())) * choices.reduce((sum, key) => sum + weight(key), 0);
  return choices.find(key => (point -= weight(key)) < 0) ?? choices[choices.length - 1];
}

export type GestureRequest = { gesture: MascotReaction; token: number };
/** Synchronous admission gate: React batching cannot admit two gestures. Five
 * taps may replace one normal gesture with the egg; stale completions cannot
 * unlock its replacement. This stores animation state only, never app data. */
export function createMascotGestureController(random = Math.random) {
  let token = 0;
  let active: GestureRequest | null = null;
  let previous: MascotGesture | null = null;
  let taps: number[] = [];
  let eggAfter = 0;
  const begin = (gesture: MascotReaction) => {
    if (gesture !== 'easteregg') previous = gesture;
    active = { gesture, token: ++token };
    return active;
  };
  return {
    tap(now: number, context: MascotContext, eligible: boolean): GestureRequest | null {
      if (!eligible && !active) return null;
      taps = taps.filter(time => now - time <= 2000 && now >= time);
      taps.push(now);
      if (active?.gesture === 'easteregg') return null;
      if (taps.length >= 5 && now >= eggAfter) { taps = []; eggAfter = now + 5000; return begin('easteregg'); }
      if (!eligible || active) return null;
      return begin(chooseMascotGesture(previous, context, random));
    },
    start(gesture: MascotReaction): GestureRequest | null { return active ? null : begin(gesture); },
    complete(completedToken: number) { if (active?.token !== completedToken) return false; active = null; return true; },
    cancel() { active = null; taps = []; token++; },
  };
}
