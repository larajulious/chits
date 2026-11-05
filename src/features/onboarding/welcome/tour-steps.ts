// The welcome tour's steps and how Chits rests on each. Pure data, so tests can
// check it without React Native.

export const TOUR_STEP = { meet: 0, spaces: 1, boards: 2, spin: 3, focus: 4, plan: 5, finish: 6 } as const;
export const TOUR_STEP_COUNT = 7;
/** The steps with a feature to try: what the progress bar counts. */
export const FEATURE_STEPS = [TOUR_STEP.spaces, TOUR_STEP.boards, TOUR_STEP.spin, TOUR_STEP.focus, TOUR_STEP.plan] as const;

/** A saved step from an older or damaged row can't point past the end of the tour. */
export function clampTourStep(step: number) {
  return Number.isInteger(step) ? Math.min(TOUR_STEP.finish, Math.max(TOUR_STEP.meet, step)) : TOUR_STEP.meet;
}

/** The sheet only moves on the way into and out of the demos; between them Chits stays put. */
export function sheetMoves(from: number, to: number) {
  const inDemos = (step: number) => step >= TOUR_STEP.spaces && step <= TOUR_STEP.plan;
  return !(inDemos(from) && inDemos(to));
}

export type TourPose = { restGaze?: number; restTilt?: number; calm?: boolean; sleepy?: boolean; cheerful?: boolean };

/** How Chits rests on a step. What Chits does when something happens comes from the demos. */
export function tourPose(step: number, evening: boolean): TourPose {
  switch (step) {
    // Welcoming, and curious about the preview below.
    case TOUR_STEP.spaces: return { restGaze: -16, restTilt: -5 };
    case TOUR_STEP.boards: return { restGaze: -10, cheerful: true };
    case TOUR_STEP.spin: return { restGaze: -14, restTilt: -6, cheerful: true };
    // Next to nothing moves here, which is what sets it apart from Spin.
    case TOUR_STEP.focus: return { restGaze: -6, restTilt: -2, calm: true };
    case TOUR_STEP.plan: return evening ? { restGaze: -4, restTilt: -1, sleepy: true } : { restGaze: -10, cheerful: true };
    case TOUR_STEP.finish: return { cheerful: true };
    default: return {};
  }
}
