import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

import { CHECKLIST_ITEMS, type ChecklistItem } from '../checklist';
import type { OnboardingStringKey } from '../strings';
import { useMascotRig } from '../welcome/use-mascot-rig';
import { journeyReaction, nextChecklistItem, readCelebrated, saveCelebrated } from './journey';

const MILESTONES: OnboardingStringKey[] = ['hub.say.0', 'hub.say.1', 'hub.say.2', 'hub.say.3', 'hub.say.4'];
const TIPS: OnboardingStringKey[] = CHECKLIST_ITEMS.map((item) => `hub.task.${item}` as OnboardingStringKey);
/** Everything Chits can say here: milestones first, then a tip for each task. */
export const JOURNEY_LINES = [...MILESTONES, ...TIPS];

// The peek is for arriving, so it plays once per launch of the app.
let peekedThisLaunch = false;

/** Chits on the hub: greets, reacts to real progress, and offers the next step when tapped. */
export function useJourneyMascot(done: readonly ChecklistItem[], loaded: boolean) {
  const database = useSQLiteContext();
  const [entrance] = useState(() => !peekedThisLaunch);
  useEffect(() => { peekedThisLaunch = true; }, []);
  const rig = useMascotRig(JOURNEY_LINES.length, { entrance, cheerful: done.length === CHECKLIST_ITEMS.length });
  const { say } = rig;
  const celebrated = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    void (async () => {
      if (celebrated.current === undefined) celebrated.current = await readCelebrated(database);
      if (!active) return;
      const { line, remember } = journeyReaction(done.length, celebrated.current);
      if (remember !== null) {
        celebrated.current = remember;
        await saveCelebrated(database, remember);
      }
      if (active && line !== null) say(line);
    })().catch(() => undefined);
    return () => { active = false; };
  }, [database, done.length, loaded, say]);

  const next = nextChecklistItem(done);
  const tapLine = next ? MILESTONES.length + CHECKLIST_ITEMS.indexOf(next) : MILESTONES.length - 1;
  return { rig, tap: () => rig.tap(tapLine) };
}
