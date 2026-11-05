import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';

import { MascotStage } from '@/components/mascot/mascot-stage';
import { SPEECH_MS } from '@/features/onboarding/welcome/mascot-machine';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** How long after the wave Chits speaks up. */
const FIRST_LINE_MS = 1100;

// The entrance belongs to a launch, not a visit: Pick a Space is passed through
// on the way to every space.
let greeted = false;

type Props = {
  title: string;
  body: string;
  /** Nobody has picked a space yet, so Chits mentions it's not a final choice. */
  firstVisit: boolean;
  footer: ReactNode;
  children: ReactNode;
};

/** Pick a Space's page and what Chits says on it. Their state lives here, so a blink never re-renders the prints passed in as children. */
export function PickStage({ title, body, firstVisit, footer, children }: Props) {
  'use no memo'; // Global i18next copy must refresh when the locale subscription fires.
  useLocale();
  const [entrance] = useState(() => !greeted);
  useEffect(() => { greeted = true; }, []);
  const rig = useMascotRig(1, { entrance, compact: true, restGaze: -10 });
  const [line, setLine] = useState<{ announce: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speak = (announce: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setLine({ announce });
    timer.current = setTimeout(() => setLine(null), SPEECH_MS);
  };
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const [opensSpeaking] = useState(firstVisit);
  useEffect(() => {
    if (!opensSpeaking) return;
    const first = setTimeout(() => speakRef.current(false), FIRST_LINE_MS);
    return () => clearTimeout(first);
  }, [opensSpeaking]);

  const tapMascot = () => {
    if (!rig.tap()) return;
    void Haptics.selectionAsync().catch(() => undefined);
    speak(true);
  };
  return <MascotStage rig={rig} title={title} body={body} hint={tr('spin.hero.hint')} onTap={tapMascot} line={line ? { text: tr('pick.youCanSwitchSpacesAnyTimeFromThe'), announce: line.announce } : null} footer={footer}>{children}</MascotStage>;
}
