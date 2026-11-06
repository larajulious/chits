import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Keyboard } from 'react-native';
import { cancelAnimation, Easing, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { CELEBRATE_MS, ENTRANCE_MS, nextMascotState, nextSpeechIndex, SPEECH_MS, STEP_EXIT_MS, WELCOME_FADE_MS } from './mascot-machine';
import { EDGE, MASCOT_CUT } from './stage-layout';
import { useMascotReducedMotion } from '@/components/mascot/use-mascot-accessibility';
import { createMascotGestureController, gestureDuration, type GestureRequest, type MascotContext, type MascotReaction } from '@/components/mascot/mascot-gestures';
import { animateMascotGesture } from '@/components/mascot/gesture-animation';

const REST_TILT = -3;
const SLEEPY_EYES = 0.5;
/** A sleeping Chits: degrees of head droop, and artwork units sunk behind the paper. */
const SLEEP_DROOP = 5;
const SLEEP_SINK = 30;
/** The arm, in degrees from hanging at Chits' side. */
const ARM_WAVE_HIGH = 122;
const ARM_WAVE_LOW = 84;
const ARM_RAISED = 104;

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);
const EASE_SOFT = Easing.inOut(Easing.sin);
const between = (low: number, high: number) => low + Math.random() * (high - low);

type RigOptions = {
  context?: MascotContext;
  onGestureComplete?: (gesture: MascotReaction) => void;
  /** False skips the peek and wave, for a screen Chits has already greeted from. */
  entrance?: boolean;
  /** A settled, contented Chits: blushing a little when at rest. */
  cheerful?: boolean;
  /** False keeps Chits perfectly still at rest: no breathing, blinks or tilts. */
  idle?: boolean;
  /** A brief greeting and quieter reactions for everyday productivity screens. */
  compact?: boolean;
  /** Distinct gestures for the two workspace listings; other screens keep their usual rig. */
  personality?: 'default' | 'notes' | 'boards';
  /** Eyes half-closed at rest, for the end of the day. */
  sleepy?: boolean;
  /** Where Chits' eyes rest, in artwork units. Negative looks away from the edge, toward the screen. */
  restGaze?: number;
  /** How Chits' head rests, in degrees. */
  restTilt?: number;
  /** Next to nothing at rest, for someone concentrating: slow blinks, and no tilts. */
  calm?: boolean;
  /** Falls asleep after this many quiet milliseconds at rest, until a tap. `stir` keeps Chits awake. */
  dozeAfter?: number;
};

export function useMascotRig(speechCount: number, { entrance = true, cheerful = false, idle = true, compact = false, personality = 'default', sleepy = false, restGaze = 0, restTilt = REST_TILT, dozeAfter = 0, calm = false, context = 'general', onGestureComplete }: RigOptions = {}) {
  const reduced = useMascotReducedMotion();
  const skipEntrance = reduced || !entrance;
  const restingBlink = sleepy ? SLEEPY_EYES : 0;
  const restingArm = personality === 'boards' ? ARM_RAISED : 0;
  const restingHappy = personality === 'boards' ? 1 : 0;
  const [state, send] = useReducer(nextMascotState, 'hidden');
  const [speech, setSpeech] = useState(-1);
  const [focused, setFocused] = useState(true);
  const greeted = useRef(false);
  const returning = useRef(false);
  const restingBlush = useRef(0);
  const queuedLine = useRef<number | null>(null);
  const queuedSpeechGesture = useRef<MascotReaction>('happy');
  const [controller] = useState(() => createMascotGestureController());
  const [reaction, setReaction] = useState<GestureRequest | null>(null);
  const queuedGesture = useRef<MascotReaction | null>(null);
  const completion = useRef(onGestureComplete);
  useEffect(() => { completion.current = onGestureComplete; }, [onGestureComplete]);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => setForeground(next === 'active'));
    const shown = Keyboard.addListener('keyboardDidShow', () => setWriting(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setWriting(false));
    return () => { subscription.remove(); shown.remove(); hidden.remove(); };
  }, []);
  const lastStir = useRef(0);
  useEffect(() => { restingBlush.current = cheerful ? 0.7 : 0; }, [cheerful]);

  const edge = useSharedValue<number>(skipEntrance || personality === 'notes' ? EDGE.rest : EDGE.hidden);
  const tilt = useSharedValue(skipEntrance ? restTilt : 0);
  const lift = useSharedValue(!skipEntrance && personality === 'notes' ? MASCOT_CUT : 0);
  const breath = useSharedValue(0);
  const arm = useSharedValue<number>(skipEntrance ? restingArm : 0);
  const blink = useSharedValue(0);
  const happy = useSharedValue<number>(skipEntrance ? restingHappy : 0);
  const surprise = useSharedValue(0);
  const blush = useSharedValue(0);
  const gaze = useSharedValue(restGaze);
  const asleep = useSharedValue(0);
  const farArm = useSharedValue(0);
  const stretch = useSharedValue(0);
  const press = useSharedValue(0);
  useEffect(() => () => {
    controller.cancel();
    [edge, tilt, lift, breath, arm, farArm, stretch, press, blink, happy, surprise, blush, gaze, asleep].forEach(cancelAnimation);
  }, [arm, asleep, blink, blush, breath, controller, edge, farArm, gaze, happy, lift, press, stretch, surprise, tilt]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  // Each state sets every part it cares about, which also cancels whatever that
  // part was doing — so an interrupted animation can't leave Chits half-posed.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, run: () => void) => { timers.push(setTimeout(run, ms)); };
    // Waits for an animation, so there's nothing to wait for without motion.
    // Reading time (the speech bubble) uses `after`: it stays the same either way.
    const afterMotion = (ms: number, run: () => void) => after(reduced ? 0 : ms, run);
    const sneakMs = compact ? 260 : ENTRANCE_MS.sneak;
    const waveMs = compact ? (personality === 'default' ? 420 : 620) : ENTRANCE_MS.wave;
    const settleMs = compact ? 320 : ENTRANCE_MS.settle;
    const move = (value: SharedValue<number>, to: number, duration: number, easing = EASE_OUT) => {
      value.set(reduced ? to : withTiming(to, { duration, easing }));
    };
    const relaxFace = (duration: number) => {
      // The eye shapes swap quickly: a slow crossfade shows both at once.
      move(happy, restingHappy, 110); move(surprise, 0, duration); move(blush, restingBlush.current, duration); move(gaze, restGaze, duration);
    };

    if (!focused || !foreground) {
      controller.cancel(); queuedGesture.current = null;
      [edge, tilt, lift, breath, arm, farArm, stretch, press, blink, happy, surprise, blush, gaze, asleep].forEach(cancelAnimation);
      press.set(0); farArm.set(0); stretch.set(0);
      send('cancel');
      return;
    }
    if (state !== 'reacting') { move(farArm, 0, 180); move(stretch, 0, 180); }
    switch (state) {
      case 'hidden':
        after(skipEntrance || compact ? 0 : WELCOME_FADE_MS, () => send(skipEntrance ? 'skipEntrance' : 'enter'));
        break;
      case 'peeking':
        if (greeted.current) {
          // Back from behind the edge: straight to resting, without another wave.
          move(edge, EDGE.rest, 460); move(tilt, REST_TILT, 460); move(arm, 0, 300); relaxFace(320);
          afterMotion(460, () => send('settled'));
        } else if (personality === 'notes') {
          // Rise from behind the paper; Boards keeps its sideways peek.
          move(edge, EDGE.rest, 0); move(lift, 0, 420); move(tilt, restTilt, 420); move(gaze, restGaze, 200);
          afterMotion(420, () => send('noticed'));
        } else {
          // Eyes first, then a tilt, as if checking whether anyone is there.
          move(edge, EDGE.sneak, sneakMs);
          tilt.set(withSequence(withTiming(-10, { duration: 380, easing: EASE_OUT }), withTiming(-6, { duration: 220, easing: EASE_SOFT })));
          move(gaze, -14, 300);
          afterMotion(sneakMs, () => send('noticed'));
        }
        break;
      case 'waving':
        greeted.current = true;
        if (reduced) {
          move(edge, EDGE.rest, 0); move(lift, 0, 0); move(tilt, restTilt, 0); move(arm, restingArm, 0); relaxFace(0);
          afterMotion(0, () => send('settled'));
          break;
        }
        if (compact && personality === 'notes') {
          // Notes: a curious look toward the page, then a small nod. No wave.
          move(edge, EDGE.rest, 340); move(arm, 0, 180); move(gaze, -28, 220); move(blush, 0.6, 200);
          tilt.set(withSequence(withTiming(restTilt - 3, { duration: 190, easing: EASE_SOFT }), withTiming(restTilt + 2, { duration: 210, easing: EASE_SOFT }), withTiming(restTilt, { duration: 220, easing: EASE_SOFT })));
          afterMotion(waveMs, () => send('settled'));
          break;
        }
        if (compact && personality === 'boards') {
          // Boards: two little hand flicks with a counter-lean, within the usual wave bounds.
          move(edge, EDGE.wave, 300); move(gaze, -5, 200); move(blush, 0.7, 200);
          arm.set(withSequence(withTiming(ARM_RAISED, { duration: 180, easing: EASE_OUT }), withTiming(76, { duration: 110, easing: EASE_SOFT }), withTiming(114, { duration: 110, easing: EASE_SOFT }), withTiming(82, { duration: 110, easing: EASE_SOFT }), withTiming(ARM_RAISED, { duration: 110, easing: EASE_SOFT })));
          tilt.set(withSequence(withTiming(1, { duration: 260, easing: EASE_SOFT }), withTiming(restTilt, { duration: 360, easing: EASE_SOFT })));
          afterMotion(waveMs, () => send('settled'));
          break;
        }
        if (compact) {
          move(edge, EDGE.wave, 300); move(gaze, 0, 200); move(blush, 0.7, 200);
          arm.set(withSequence(withTiming(ARM_WAVE_HIGH, { duration: 160, easing: EASE_OUT }), withTiming(ARM_WAVE_LOW, { duration: 130, easing: EASE_SOFT }), withTiming(ARM_RAISED, { duration: 130, easing: EASE_SOFT })));
          move(tilt, -1, waveMs);
          afterMotion(waveMs, () => send('settled'));
          break;
        }
        surprise.set(withSequence(withTiming(1, { duration: 90 }), withDelay(130, withTiming(0, { duration: 160 }))));
        move(blush, 1, 260); move(gaze, 0, 220);
        edge.set(withTiming(EDGE.wave, { duration: 380, easing: Easing.out(Easing.back(1.1)) }));
        arm.set(withSequence(
          withTiming(ARM_WAVE_HIGH, { duration: 200, easing: EASE_OUT }),
          withTiming(ARM_WAVE_LOW, { duration: 130, easing: EASE_SOFT }),
          withTiming(ARM_WAVE_HIGH, { duration: 130, easing: EASE_SOFT }),
          withTiming(ARM_WAVE_LOW, { duration: 130, easing: EASE_SOFT }),
          withTiming(ARM_RAISED, { duration: 130, easing: EASE_SOFT }),
        ));
        // The body sways against the arm, so the wave isn't only the arm moving.
        tilt.set(withSequence(
          withTiming(-1, { duration: 200, easing: EASE_OUT }),
          withTiming(-4, { duration: 260, easing: EASE_SOFT }),
          withTiming(-1, { duration: 260, easing: EASE_SOFT }),
        ));
        afterMotion(ENTRANCE_MS.wave, () => send('settled'));
        break;
      case 'idle':
        move(blink, restingBlink, 140);
        move(farArm, 0, 260); move(stretch, 0, 260); move(press, 0, 160);
        move(edge, EDGE.rest, settleMs, EASE_SOFT);
        move(tilt, restTilt, compact ? settleMs : 500, EASE_SOFT);
        move(arm, restingArm, compact ? settleMs : 480, EASE_SOFT);
        move(lift, 0, 240);
        relaxFace(420);
        break;
      case 'reacting': {
        const chosen = reaction?.gesture ?? 'happy';
        const token = reaction?.token;
        animateMascotGesture(chosen, { arm, farArm, tilt, lift, stretch, blink, happy, surprise, blush, gaze }, {
          arm: restingArm, farArm: 0, tilt: restTilt, lift: 0, stretch: 0, blink: restingBlink,
          happy: restingHappy, surprise: 0, blush: restingBlush.current, gaze: restGaze,
        }, compact, reduced || calm);
        const finish = () => {
          if (token !== undefined && !controller.complete(token)) return;
          try { completion.current?.(chosen); } finally { send('reacted'); }
        };
        // The visual reaction and its speech share the existing state machine.
        // Reading time remains unchanged under Reduce Motion.
        if (speechCount > 0 && gestureDuration(chosen) <= SPEECH_MS) after(SPEECH_MS, finish);
        else after(reduced ? 450 : gestureDuration(chosen), finish);
        break;
      }
      case 'shy':
        move(lift, 0, 200); move(arm, 0, 220); move(happy, 0, 160); move(surprise, 0, 160);
        move(blush, 1, 240); move(gaze, 12, 240); move(tilt, 3, 340);
        if (reduced) edge.set(EDGE.shy);
        // Back behind the edge, then one small check that the coast is clear.
        else edge.set(withSequence(withTiming(EDGE.shy, { duration: 340, easing: EASE_OUT }), withDelay(620, withTiming(EDGE.shyPeek, { duration: 260, easing: EASE_SOFT })), withDelay(420, withTiming(EDGE.shy, { duration: 240, easing: EASE_SOFT }))));
        break;
      case 'watching':
        // Chits leans in and holds still: the thing being watched is what moves.
        greeted.current = true;
        move(edge, EDGE.rest + 24, 280); move(tilt, -8, 320); move(arm, 0, 240); move(lift, 0, 200);
        move(happy, 0, 110); move(surprise, 1, 200); move(blush, 0.6, 240); move(gaze, -16, 220);
        break;
      case 'celebrating':
        move(surprise, 0, 120); move(gaze, 0, 160); move(happy, 1, 120); move(blush, 1, 180);
        if (reduced) arm.set(ARM_RAISED);
        else {
          // One wave and one small lean: a reaction, not a performance.
          arm.set(withSequence(withTiming(ARM_WAVE_HIGH, { duration: 180, easing: EASE_OUT }), withTiming(ARM_WAVE_LOW, { duration: 140, easing: EASE_SOFT }), withTiming(ARM_RAISED, { duration: 140, easing: EASE_SOFT })));
          edge.set(withSequence(withTiming(EDGE.rest + 40, { duration: 220, easing: EASE_OUT }), withTiming(EDGE.rest, { duration: 420, easing: EASE_SOFT })));
          tilt.set(withSequence(withTiming(-1, { duration: 220, easing: EASE_OUT }), withTiming(REST_TILT, { duration: 420, easing: EASE_SOFT })));
        }
        after(CELEBRATE_MS - 500, () => { move(arm, 0, 320, EASE_SOFT); relaxFace(320); });
        after(CELEBRATE_MS, () => send('reacted'));
        break;
      case 'exiting':
        greeted.current = true;
        move(happy, 1, 120); move(surprise, 0, 100);
        if (!reduced) {
          arm.set(withSequence(withTiming(ARM_WAVE_HIGH, { duration: 130, easing: EASE_OUT }), withTiming(ARM_WAVE_LOW, { duration: 120, easing: EASE_SOFT })));
          edge.set(withDelay(100, withTiming(EDGE.hidden, { duration: STEP_EXIT_MS - 100, easing: EASE_IN })));
        }
        afterMotion(STEP_EXIT_MS, () => { if (returning.current) send('returned'); });
        break;
    }
    return () => timers.forEach(clearTimeout);
  }, [arm, asleep, blink, blush, breath, calm, compact, controller, edge, farArm, focused, foreground, gaze, happy, lift, personality, press, reaction, reduced, restGaze, restTilt, restingArm, restingBlink, restingHappy, skipEntrance, speechCount, state, stretch, surprise, tilt]);

  // Speech queued by an existing screen event shares the same admission gate.
  useEffect(() => {
    if (state !== 'idle' || !focused || !foreground || (calm && context === 'focus') || (context === 'notes' && writing) || queuedLine.current === null) return;
    const request = controller.start(queuedSpeechGesture.current);
    if (!request) return;
    const line = queuedLine.current; queuedLine.current = null;
    setReaction(request); setSpeech(line); send('tap');
  }, [calm, context, controller, focused, foreground, state, writing]);

  // Idle timing runs on the UI thread. Long pauses cost no JS timer, and
  // cleanup cancels every track before a gesture, blur, keyboard or background.
  useEffect(() => {
    if (state !== 'idle' || reduced || !focused || !foreground || !idle || (context === 'notes' && writing)) return;
    const breathe = withSequence(withTiming(calm ? 0.18 : compact ? 0.3 : 1, { duration: calm ? 3800 : 2800, easing: EASE_SOFT }), withTiming(0, { duration: 3000, easing: EASE_SOFT }));
    breath.set(withRepeat(breathe, -1));
    if (!restingHappy) blink.set(withRepeat(withSequence(withDelay(calm ? between(7000, 13000) : between(3200, 6200), withTiming(1, { duration: 70 })), withTiming(restingBlink, { duration: 130 })), -1));
    if (!calm) {
      tilt.set(withRepeat(withSequence(withDelay(between(9000, 15000), withTiming(restTilt + (compact ? 1.2 : 3), { duration: 620, easing: EASE_SOFT })), withDelay(800, withTiming(restTilt, { duration: 720, easing: EASE_SOFT }))), -1));
      // A rare, small hello. Writing and active Focus never run this track.
      if (context !== 'notes') arm.set(withRepeat(withSequence(withDelay(between(45000, 75000), withTiming(100, { duration: 420, easing: EASE_SOFT })), withTiming(76, { duration: 170 }), withTiming(108, { duration: 170 }), withTiming(restingArm, { duration: 460, easing: EASE_SOFT })), -1));
    }
    return () => {
      [breath, blink, tilt, arm].forEach(cancelAnimation);
      breath.set(0); blink.set(restingBlink);
    };
  }, [arm, blink, breath, calm, compact, context, focused, foreground, idle, reduced, restTilt, restingArm, restingBlink, restingHappy, state, tilt, writing]);

  // A timestamp rather than state, so a stir from every bit of scrolling costs no render.
  useEffect(() => {
    if (!dozeAfter || state !== 'idle' || !focused || !foreground) return;
    lastStir.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const quiet = Date.now() - lastStir.current;
      if (quiet >= dozeAfter) send('sleep');
      else timer = setTimeout(check, dozeAfter - quiet);
    };
    timer = setTimeout(check, dozeAfter);
    return () => clearTimeout(timer);
  }, [dozeAfter, focused, foreground, state]);

  // Asleep: eyes shut, head drooped and sunk a little, one slow breath. Waking
  // goes through `reacting`, then `idle`, which put every part back.
  useEffect(() => {
    if (state !== 'sleeping' || !focused || !foreground) return;
    const settle = (value: SharedValue<number>, to: number, duration: number) => {
      value.set(reduced ? to : withTiming(to, { duration, easing: EASE_SOFT }));
    };
    settle(blink, 1, 600); settle(asleep, 1, 500); settle(happy, 0, 200); settle(gaze, restGaze, 400); settle(blush, 0.4, 600);
    settle(arm, 0, 700); settle(tilt, restTilt + SLEEP_DROOP, 900); settle(lift, SLEEP_SINK, 900);
    if (!reduced) breath.set(withDelay(900, withRepeat(withTiming(1, { duration: 3200, easing: EASE_SOFT }), -1, true)));
    return () => {
      cancelAnimation(breath);
      breath.set(reduced ? 0 : withTiming(0, { duration: 240, easing: EASE_SOFT }));
      blink.set(reduced ? restingBlink : withTiming(restingBlink, { duration: 160 }));
      asleep.set(reduced ? 0 : withTiming(0, { duration: 160 }));
    };
  }, [arm, asleep, blink, blush, breath, focused, foreground, gaze, happy, lift, reduced, restGaze, restTilt, restingBlink, state, tilt]);

  // Resting eyelids follow the mood, and a blink comes back to them.
  useEffect(() => {
    blink.set(reduced ? restingBlink : withTiming(restingBlink, { duration: 420, easing: EASE_SOFT }));
  }, [blink, reduced, restingBlink]);

  /** Tap admission is synchronous, including taps during a normal reaction. */
  const tap = useCallback((line?: number) => {
    if (!focused || !foreground || (calm && context === 'focus') || (context === 'notes' && writing)) return false;
    const request = controller.tap(Date.now(), context, state === 'idle' || state === 'sleeping');
    if (!request) return false;
    setReaction(request);
    setSpeech(previous => line ?? nextSpeechIndex(previous, speechCount));
    send('tap');
    return true;
  }, [calm, context, controller, focused, foreground, speechCount, state, writing]);
  /** Context reactions wait behind a gesture; only committed screen state calls this. */
  const react = useCallback((gesture: MascotReaction) => {
    if (!focused || !foreground) return;
    if ((calm && context === 'focus') || (context === 'notes' && writing) || !['idle', 'sleeping', 'watching'].includes(state)) { queuedGesture.current = gesture; return; }
    const request = controller.start(gesture);
    if (!request) { queuedGesture.current = gesture; return; }
    setReaction(request); setSpeech(-1); send('gesture');
  }, [calm, context, controller, focused, foreground, state, writing]);
  useEffect(() => {
    if (state !== 'idle' || (calm && context === 'focus') || !focused || !foreground || (context === 'notes' && writing) || queuedGesture.current === null) return;
    const gesture = queuedGesture.current; queuedGesture.current = null; react(gesture);
  }, [calm, context, focused, foreground, react, state, writing]);
  /** Chits says this at rest. Existing copy and its reading interval are retained. */
  const say = useCallback((line: number, gesture: MascotReaction = 'happy') => {
    queuedSpeechGesture.current = gesture;
    if (state === 'idle' && focused && foreground) {
      const request = controller.start(gesture);
      if (request) { setReaction(request); setSpeech(line); send('tap'); }
      else queuedLine.current = line;
    } else queuedLine.current = line;
  }, [controller, focused, foreground, state]);
  /** Chits gives something on screen their full attention until `rest` or `celebrate`. */
  const watch = useCallback(() => { controller.cancel(); send('watch'); }, [controller]);
  const rest = useCallback(() => send('rest'), []);
  /** A short, happy reaction to something that just happened. */
  const celebrate = useCallback(() => { controller.cancel(); send('celebrate'); }, [controller]);
  const hold = useCallback(() => { controller.cancel(); send('hold'); }, [controller]);
  /** Something moved, so Chits' `dozeAfter` starts again. It never wakes them. */
  const stir = useCallback(() => { lastStir.current = Date.now(); }, []);
  const release = useCallback(() => send('release'), []);
  /** Chits ducks out; `comeBack` brings them back on the next step, otherwise the screen is leaving. */
  const leave = useCallback((comeBack: boolean) => {
    controller.cancel(); queuedGesture.current = null;
    returning.current = comeBack;
    send('leave');
  }, [controller]);

  return { state, speech, active: focused && foreground, gesture: state === 'reacting' ? reaction?.gesture ?? null : null, tap, react, say, watch, rest, celebrate, hold, release, leave, stir, values: { edge, tilt, lift, breath, arm, blink, happy, surprise, blush, gaze, asleep, farArm, stretch, press } };
}

export type MascotRig = ReturnType<typeof useMascotRig>;
