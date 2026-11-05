import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { type ScrollView, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

import { heroStageLayout } from '@/components/mascot/hero-stage-layout';
import { MascotStage, useStageViewport } from '@/components/mascot/mascot-stage';
import { nextSpeechIndex, SPEECH_MS } from '@/features/onboarding/welcome/mascot-machine';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { spinWheelLayout } from './spin-layout';

const FOUND_LINES = ['spin.say.found.0', 'spin.say.found.1', 'spin.say.found.2', 'spin.say.found.3'];
const IDLE_LINES = ['spin.say.before', 'spin.say.idle.0', 'spin.say.idle.1', 'spin.say.idle.2'];
/** How long after the wave Chits wonders aloud. */
const FIRST_LINE_MS = 1100;

export type SpinMoment = 'idle' | 'result' | 'empty';

// The entrance belongs to a launch, not a visit: coming back to Spin, or
// switching wheels, shouldn't replay it.
let greeted = false;
export function useSpinEntrance() {
  const [entrance] = useState(() => !greeted);
  useEffect(() => { greeted = true; }, []);
  return entrance;
}

/** The sizes the wheel takes on this screen, known before the first frame. */
export function useSpinWheelLayout() {
  const { width, height } = useWindowDimensions();
  const viewport = useStageViewport();
  return useMemo(() => spinWheelLayout(width, viewport, heroStageLayout(width, height).height), [height, viewport, width]);
}

type Props = {
  title: string;
  body: string;
  /** What's on the page, which decides what Chits says when tapped. */
  moment: SpinMoment;
  spinning: boolean;
  /** Counts each landing: Chits reacts when it changes. */
  landing: number;
  /** The wheel landed on the same thing as last time. */
  repeat?: boolean;
  /** False keeps Chits' reaction to words, for readers who turned celebrations off. */
  celebrate?: boolean;
  entrance: boolean;
  /** The page's actions, held at the bottom of the screen. */
  footer?: ReactNode;
  /** They arrive last, after a landing just now. */
  footerFresh?: boolean;
  scrollRef?: Ref<ScrollView>;
  children: ReactNode;
};

/** Spin's page, and what Chits says and does on it. Their state lives here, so a blink never re-renders the wheel passed in as children. */
export function SpinStage({ title, body, moment, spinning, landing, repeat = false, celebrate = true, entrance, footer, footerFresh = false, scrollRef, children }: Props) {
  'use no memo'; // Global i18next copy must refresh when the locale subscription fires.
  useLocale();
  const rig = useMascotRig(1, { entrance, compact: true, restGaze: -10 });
  const { watch, rest, celebrate: cheer, tap } = rig;

  const [line, setLine] = useState<{ key: string; announce: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLine = useRef(-1);
  const momentRef = useRef(moment);
  useEffect(() => { momentRef.current = moment; }, [moment]);
  const say = (key: string | null, announce = false, ms: number | null = SPEECH_MS) => {
    if (timer.current) clearTimeout(timer.current);
    setLine(key ? { key, announce } : null);
    if (key && ms !== null) timer.current = setTimeout(() => setLine(null), ms);
  };
  const sayRef = useRef(say);
  useEffect(() => { sayRef.current = say; });
  // A different line from the last one, so Chits doesn't repeat themselves.
  const pick = (lines: string[]) => { lastLine.current = nextSpeechIndex(lastLine.current, lines.length); return lines[lastLine.current]; };
  const pickRef = useRef(pick);
  useEffect(() => { pickRef.current = pick; });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!entrance) return;
    const wonder = setTimeout(() => { if (momentRef.current === 'idle') sayRef.current('spin.say.before'); }, FIRST_LINE_MS);
    return () => clearTimeout(wonder);
  }, [entrance]);
  useEffect(() => {
    if (spinning) { watch(); sayRef.current('spin.say.spinning', false, null); }
    else { rest(); sayRef.current(null); }
  }, [rest, spinning, watch]);
  const seenLanding = useRef(landing);
  useEffect(() => {
    if (landing === seenLanding.current) return;
    seenLanding.current = landing;
    if (celebrate) cheer();
    sayRef.current(repeat ? 'spin.say.same' : pickRef.current(FOUND_LINES));
  }, [celebrate, cheer, landing, repeat]);

  const tapMascot = () => {
    if (!tap()) return;
    void Haptics.selectionAsync().catch(() => undefined);
    say(moment === 'empty' ? 'spin.say.empty' : pick(moment === 'result' ? FOUND_LINES : IDLE_LINES), true);
  };
  return <MascotStage rig={rig} title={title} body={body} hint={tr('spin.hero.hint')} onTap={tapMascot} line={line ? { text: tr(line.key), announce: line.announce } : null} footer={footer} footerFresh={footerFresh} scrollRef={scrollRef}>{children}</MascotStage>;
}
