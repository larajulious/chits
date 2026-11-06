import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { MascotStage } from '@/components/mascot/mascot-stage';
import { nextSpeechIndex, SPEECH_MS } from '@/features/onboarding/welcome/mascot-machine';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { SpinCelebration } from '@/features/spin/spin-celebration';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { focusCelebrates, focusHeroKeys, focusPose, type FocusOutcome, type FocusPhase } from './focus-phase';

const LINES: Record<Exclude<FocusPhase, 'running'>, string[]> = {
  ready: ['focus.say.ready.0', 'focus.say.ready.1'],
  paused: ['focus.say.paused'],
  unfinished: ['focus.say.unfinished'],
  completed: ['focus.say.completed'],
};

type Props = {
  phase: FocusPhase;
  outcome: FocusOutcome | null;
  /** The reader's Focus Companion setting. Off means no Chits and no messages. */
  companion: boolean;
  entrance: boolean;
  /** Counts sessions finishing while this screen watches; a past session opened from history never adds one. */
  finished: number;
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Focus' page, and how Chits behaves on it. A welcome, then quiet: while someone
 * works Chits barely moves and doesn't speak, and the timer's tick never reaches
 * here. It's the only place that re-renders for Chits.
 */
export function FocusStage({ phase, outcome, companion, entrance, finished, footer, children }: Props) {
  'use no memo'; // Global i18next copy must refresh when the locale subscription fires.
  useLocale();
  const reduced = useReducedMotion();
  // Decided on arrival: a session starting mid-wave doesn't change how Chits came in.
  const [arrival] = useState(entrance);
  const rig = useMascotRig(1, { context: 'focus', entrance: arrival, idle: companion, compact: true, ...focusPose(phase) });
  const { celebrate, tap } = rig;
  const calm = useSharedValue(phase === 'running' ? 1 : 0);
  useEffect(() => {
    const to = phase === 'running' ? 1 : 0;
    calm.set(reduced ? to : withTiming(to, { duration: 600, easing: Easing.inOut(Easing.sin) }));
  }, [calm, phase, reduced]);

  // A line belongs to its moment: it's gone the instant the phase moves on, so focus starts in silence.
  const [spoken, setSpoken] = useState<{ key: string; phase: FocusPhase } | null>(null);
  const line = spoken?.phase === phase ? spoken.key : null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(-1);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const seen = useRef(finished);
  // Counted from arrival, so coming back from the note view doesn't replay it.
  const [finishedBefore] = useState(finished);
  useEffect(() => {
    if (finished === seen.current) return;
    seen.current = finished;
    if (!companion || !outcome || !focusCelebrates(outcome)) return;
    celebrate();
  }, [celebrate, companion, finished, outcome]);

  const tapMascot = () => {
    if (phase === 'running' || !tap()) return;
    void Haptics.selectionAsync().catch(() => undefined);
    const lines = LINES[phase];
    last.current = nextSpeechIndex(last.current, lines.length);
    if (timer.current) clearTimeout(timer.current);
    setSpoken({ key: lines[last.current], phase });
    timer.current = setTimeout(() => setSpoken(null), SPEECH_MS);
  };
  const { title, body } = focusHeroKeys(phase, outcome);

  return <MascotStage rig={rig} title={tr(title)} body={tr(body)} mascot={companion} hint={phase === 'running' ? '' : tr('focus.hero.hint')} onTap={tapMascot} line={line ? { text: tr(line), announce: true } : null} calm={calm} footer={footer}>
    {children}
    {finished > finishedBefore && companion && outcome && focusCelebrates(outcome) && !reduced ? <SpinCelebration key={finished} /> : null}
  </MascotStage>;
}
