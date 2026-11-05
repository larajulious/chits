import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { cancelAnimation, Easing, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { CELEBRATE_MS, ENTRANCE_MS, nextMascotState, nextSpeechIndex, SPEECH_MS, STEP_EXIT_MS, WELCOME_FADE_MS } from './mascot-machine';
import { EDGE, MASCOT_CUT } from './stage-layout';

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

export function useMascotRig(speechCount: number, { entrance = true, cheerful = false, idle = true, compact = false, personality = 'default', sleepy = false, restGaze = 0, restTilt = REST_TILT, dozeAfter = 0, calm = false }: RigOptions = {}) {
  const reduced = useReducedMotion();
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
  const reactionTurn = useRef(0);
  const idleTurn = useRef(0);
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
        move(edge, EDGE.rest, settleMs, EASE_SOFT);
        move(tilt, restTilt, compact ? settleMs : 500, EASE_SOFT);
        move(arm, restingArm, compact ? settleMs : 480, EASE_SOFT);
        move(lift, 0, 240);
        relaxFace(420);
        break;
      case 'reacting':
        move(happy, 1, 120); move(blush, 1, 180); move(arm, personality === 'notes' ? 0 : ARM_RAISED, 200);
        if (!reduced) {
          const alternate = reactionTurn.current++ % 2 === 1;
          if (personality === 'notes') {
            // Alternate a thank-you nod with an inquisitive head tilt.
            move(gaze, alternate ? -22 : -8, 180);
            tilt.set(withSequence(withTiming(restTilt + (alternate ? -4 : 3), { duration: 220, easing: EASE_SOFT }), withTiming(restTilt, { duration: 360, easing: EASE_SOFT })));
            if (!alternate) lift.set(withSequence(withTiming(8, { duration: 180, easing: EASE_SOFT }), withTiming(0, { duration: 260, easing: EASE_SOFT })));
          } else if (personality === 'boards') {
            // A short wave, then a playful lean on the next tap.
            if (!alternate) arm.set(withSequence(withTiming(116, { duration: 180, easing: EASE_OUT }), withTiming(78, { duration: 150, easing: EASE_SOFT }), withTiming(ARM_RAISED, { duration: 150, easing: EASE_SOFT })));
            edge.set(withSequence(withTiming(EDGE.rest + (alternate ? 24 : 10), { duration: 220, easing: EASE_OUT }), withTiming(EDGE.rest, { duration: 380, easing: EASE_SOFT })));
            tilt.set(withSequence(withTiming(alternate ? 2 : -5, { duration: 220, easing: EASE_SOFT }), withTiming(restTilt, { duration: 380, easing: EASE_SOFT })));
          } else {
            if (!compact) lift.set(withSequence(withTiming(-34, { duration: 170, easing: EASE_OUT }), withTiming(0, { duration: 240, easing: Easing.out(Easing.quad) })));
            edge.set(withSequence(withTiming(EDGE.rest + (compact ? 12 : 36), { duration: 200, easing: EASE_OUT }), withTiming(EDGE.rest, { duration: 380, easing: EASE_SOFT })));
            tilt.set(withSequence(withTiming(-7, { duration: 200, easing: EASE_OUT }), withTiming(REST_TILT, { duration: 420, easing: EASE_SOFT })));
          }
        }
        // The expression is brief; the bubble stays a little longer.
        after(900, () => { move(arm, restingArm, 320, EASE_SOFT); relaxFace(320); });
        after(SPEECH_MS, () => send('reacted'));
        break;
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
  }, [arm, blush, breath, compact, edge, gaze, happy, lift, personality, reduced, restGaze, restTilt, restingArm, restingHappy, skipEntrance, state, surprise, tilt]);

  // A line asked for mid-animation waits its turn, so it can't cut a reaction off.
  useEffect(() => {
    if (state !== 'idle' || queuedLine.current === null) return;
    const line = queuedLine.current;
    queuedLine.current = null;
    setSpeech(line);
    send('tap');
  }, [state]);

  // Idle life. One looping value for breathing, and blinks and tilts on long
  // random timers. All of it stops when Chits is out of view or the app is away.
  useEffect(() => {
    if (state !== 'idle' || reduced || !focused || !idle) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleBlink = () => {
      timers.push(setTimeout(() => {
        blink.set(withSequence(withTiming(1, { duration: 70 }), withTiming(restingBlink, { duration: 110 })));
        scheduleBlink();
      }, calm ? between(7000, 13000) : between(2800, 6000)));
    };
    const scheduleTilt = () => {
      timers.push(setTimeout(() => {
        const target = restTilt + (Math.random() < 0.5 ? (compact ? -1.2 : -4) : (compact ? 1.2 : 3));
        tilt.set(withSequence(withTiming(target, { duration: 620, easing: EASE_SOFT }), withDelay(900, withTiming(restTilt, { duration: 720, easing: EASE_SOFT }))));
        scheduleTilt();
      }, between(7000, 12000)));
    };
    const scheduleWorkspaceGesture = () => {
      timers.push(setTimeout(() => {
        const alternate = idleTurn.current++ % 2 === 1;
        if (personality === 'notes') {
          // Read across the notes, or consider one with a quiet head tilt.
          gaze.set(withSequence(withTiming(alternate ? -4 : -24, { duration: 520, easing: EASE_SOFT }), withDelay(650, withTiming(restGaze, { duration: 520, easing: EASE_SOFT }))));
          tilt.set(withSequence(withTiming(restTilt + (alternate ? 2 : -2), { duration: 520, easing: EASE_SOFT }), withDelay(650, withTiming(restTilt, { duration: 520, easing: EASE_SOFT }))));
        } else if (alternate) {
          // A small hello, separated from the next gesture by a long pause.
          arm.set(withSequence(withTiming(68, { duration: 380, easing: EASE_SOFT }), withTiming(116, { duration: 180, easing: EASE_SOFT }), withTiming(restingArm, { duration: 460, easing: EASE_SOFT })));
        } else {
          gaze.set(withSequence(withTiming(-18, { duration: 420, easing: EASE_SOFT }), withDelay(600, withTiming(restGaze, { duration: 500, easing: EASE_SOFT }))));
          tilt.set(withSequence(withTiming(1, { duration: 480, easing: EASE_SOFT }), withDelay(600, withTiming(restTilt, { duration: 500, easing: EASE_SOFT }))));
        }
        scheduleWorkspaceGesture();
      }, personality === 'notes' ? between(7500, 13000) : between(10000, 17000)));
    };
    const start = () => {
      if (!compact) breath.set(withRepeat(withTiming(1, { duration: 2600, easing: EASE_SOFT }), -1, true));
      if (!restingHappy) scheduleBlink();
      if (!calm) {
        if (personality === 'default') scheduleTilt();
        else scheduleWorkspaceGesture();
      }
    };
    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      cancelAnimation(breath);
      cancelAnimation(blink);
      cancelAnimation(tilt);
      blink.set(restingBlink);
      if (personality !== 'default') {
        cancelAnimation(gaze); cancelAnimation(arm);
        gaze.set(restGaze); arm.set(restingArm); tilt.set(restTilt);
      }
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (next) => {
      stop();
      if (next === 'active') start();
    });
    return () => {
      subscription.remove();
      stop();
      breath.set(withTiming(0, { duration: 240, easing: EASE_SOFT }));
    };
  }, [arm, blink, breath, calm, compact, focused, gaze, idle, personality, reduced, restGaze, restTilt, restingArm, restingHappy, state, tilt, restingBlink]);

  // A timestamp rather than state, so a stir from every bit of scrolling costs no render.
  useEffect(() => {
    if (!dozeAfter || state !== 'idle' || !focused) return;
    lastStir.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const quiet = Date.now() - lastStir.current;
      if (quiet >= dozeAfter) send('sleep');
      else timer = setTimeout(check, dozeAfter - quiet);
    };
    timer = setTimeout(check, dozeAfter);
    return () => clearTimeout(timer);
  }, [dozeAfter, focused, state]);

  // Asleep: eyes shut, head drooped and sunk a little, one slow breath. Waking
  // goes through `reacting`, then `idle`, which put every part back.
  useEffect(() => {
    if (state !== 'sleeping' || !focused) return;
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
  }, [arm, asleep, blink, blush, breath, focused, gaze, happy, lift, reduced, restGaze, restTilt, restingBlink, state, tilt]);

  // Resting eyelids follow the mood, and a blink comes back to them.
  useEffect(() => {
    blink.set(reduced ? restingBlink : withTiming(restingBlink, { duration: 420, easing: EASE_SOFT }));
  }, [blink, reduced, restingBlink]);

  /** Reacts to a touch, with the given line or a random one. Ignored unless Chits is at rest or asleep. */
  const tap = useCallback((line?: number) => {
    if (state !== 'idle' && state !== 'sleeping') return false;
    setSpeech((previous) => line ?? nextSpeechIndex(previous, speechCount));
    send('tap');
    return true;
  }, [speechCount, state]);
  /** Chits says this the next time they're at rest, whatever they're doing now. */
  const say = useCallback((line: number) => {
    if (state === 'idle') { setSpeech(line); send('tap'); }
    else queuedLine.current = line;
  }, [state]);
  /** Chits gives something on screen their full attention until `rest` or `celebrate`. */
  const watch = useCallback(() => send('watch'), []);
  const rest = useCallback(() => send('rest'), []);
  /** A short, happy reaction to something that just happened. */
  const celebrate = useCallback(() => send('celebrate'), []);
  const hold = useCallback(() => send('hold'), []);
  /** Something moved, so Chits' `dozeAfter` starts again. It never wakes them. */
  const stir = useCallback(() => { lastStir.current = Date.now(); }, []);
  const release = useCallback(() => send('release'), []);
  /** Chits ducks out; `comeBack` brings them back on the next step, otherwise the screen is leaving. */
  const leave = useCallback((comeBack: boolean) => {
    returning.current = comeBack;
    send('leave');
  }, []);

  return { state, speech, tap, say, watch, rest, celebrate, hold, release, leave, stir, values: { edge, tilt, lift, breath, arm, blink, happy, surprise, blush, gaze, asleep } };
}

export type MascotRig = ReturnType<typeof useMascotRig>;
