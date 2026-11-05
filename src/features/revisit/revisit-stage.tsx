import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';

import { OnTheDesk } from '@/components/desk/paper-desk';
import { MascotStage } from '@/components/mascot/mascot-stage';
import { nextSpeechIndex, SPEECH_MS } from '@/features/onboarding/welcome/mascot-machine';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** Chits' lines here, shared with the rest of the app's encouragement. */
const LINES = ['spin.say.idle.2', 'onboarding.mascot.say.both', 'onboarding.mascot.say.corner'];

// The entrance belongs to a launch, not a visit: Revisit reopens after every
// note it sends the reader to.
let greeted = false;

type Props = { title: string; body: string; footer: ReactNode; scrollRef?: Ref<ScrollView>; children: ReactNode };

/** Revisit's page and what Chits says on it. Their state lives here, so a blink never re-renders the notes passed in as children. */
export function RevisitStage({ title, body, footer, scrollRef, children }: Props) {
  'use no memo'; // Global i18next copy must refresh when the locale subscription fires.
  useLocale();
  const [entrance] = useState(() => !greeted);
  useEffect(() => { greeted = true; }, []);
  const rig = useMascotRig(1, { entrance, compact: true, restGaze: -10 });
  const [line, setLine] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLine = useRef(-1);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const tapMascot = () => {
    if (!rig.tap()) return;
    void Haptics.selectionAsync().catch(() => undefined);
    lastLine.current = nextSpeechIndex(lastLine.current, LINES.length);
    setLine(LINES[lastLine.current]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLine(null), SPEECH_MS);
  };
  return <MascotStage rig={rig} title={title} body={body} hint={tr('boardsHero.hint')} onTap={tapMascot} line={line ? { text: tr(line), announce: true } : null} footer={footer} scrollRef={scrollRef}><OnTheDesk>{children}</OnTheDesk></MascotStage>;
}
