// Where Chits and the content sheet sit on each onboarding step. Positions are
// in the mascot artwork's own units (a 1250-unit square), so one set of poses
// works at every screen size. Pure numbers, so tests can check them.

import { TOUR_STEP, TOUR_STEP_COUNT } from './tour-steps';

export const MASCOT_VIEWBOX = 1250;
/** The top of Chits' tape, leaving room for a slight head tilt. */
const MASCOT_TOP = 130;
/** Everything below this row is tucked behind the content sheet. */
export const MASCOT_CUT = 905;

/**
 * The artwork column that lines up with the right edge of the screen. Anything
 * further right is outside the screen, which is what makes Chits look like they
 * are leaning in from beyond it.
 */
export const EDGE = { hidden: 40, sneak: 520, shy: 570, shyPeek: 660, wave: 930, rest: 870 } as const;

/** The artwork column of Chits' left side, and the hero's side margin. */
const BODY_LEFT = 191;
export const HERO_GUTTER = 20;

export { PAPER_TILT } from '../../../constants/paper';

const MEET_SHEET = 0.5;
/** The tour's demos: Chits stays small, and the room goes to the thing to try. */
const DEMO_SHEET = 0.24;
const FINISH_SHEET = 0.36;
/** Chits stays small on the last step too: the words and the button are the point. */
const FINISH_ZOOM = 0.58;
const SMALLEST_ZOOM = 0.42;
/** The Meet and Finish copy and actions always get at least this much sheet. */
const MINIMUM_SHEET = 280;

export type StageLayout = {
  /** Points per artwork unit at full size. */
  unit: number;
  /** The top of the content sheet on each step. */
  sheetTops: readonly number[];
  /** Chits' size on each step, relative to `unit`. */
  zooms: readonly number[];
};

export function stageLayout(width: number, height: number, insets: { top: number; bottom: number }): StageLayout {
  const meetTop = Math.round(Math.min(height * MEET_SHEET, height - MINIMUM_SHEET - insets.bottom));
  const demoTop = Math.round(Math.max(height * DEMO_SHEET, insets.top + 124));
  const finishTop = Math.round(Math.min(height * FINISH_SHEET, height - MINIMUM_SHEET - insets.bottom));
  const visibleRows = MASCOT_CUT - MASCOT_TOP;
  const unit = Math.min(width / 900, (meetTop - insets.top - 12) / visibleRows);
  const zoomFor = (top: number) => Math.min(1, Math.max(SMALLEST_ZOOM, (top - insets.top - 6) / (visibleRows * unit)));
  const sheetTops = Array.from({ length: TOUR_STEP_COUNT }, (_, step) => (step === TOUR_STEP.meet ? meetTop : step === TOUR_STEP.finish ? finishTop : demoTop));
  return { unit, sheetTops, zooms: sheetTops.map((top, step) => (step === TOUR_STEP.finish ? Math.min(FINISH_ZOOM, zoomFor(top)) : zoomFor(top))) };
}

/** Spare room on a tall phone goes to the desk, up to this much above Chits' own height. */
const HERO_SPARE = 1.5;
const SMALLEST_HERO_UNIT = 0.15;

/**
 * Getting started's hero: Chits on the right, the words on the left. The page
 * fits one screen, so the hero takes the height the content leaves (`room`) and
 * Chits scales to it. It only ever grows past that for the words themselves, so
 * long or enlarged text scrolls rather than running under the paper.
 */
export function heroLayout(width: number, copyHeight: number, contentWidth = 720, room = Number.POSITIVE_INFINITY) {
  const widest = Math.min(0.34, Math.max(0.22, width * 0.00068));
  const visibleRows = MASCOT_CUT - MASCOT_TOP;
  const unit = Math.max(SMALLEST_HERO_UNIT, Math.min(widest, (room - 8) / visibleRows));
  const fullHeight = visibleRows * widest + 8;
  const copyRoom = copyHeight > 0 ? copyHeight + 28 : 0;
  const bodyLeft = width - (EDGE.rest - BODY_LEFT) * unit;
  // On a wide screen the words line up with the centered content below them.
  const copyLeft = Math.max(HERO_GUTTER, (width - contentWidth) / 2 + HERO_GUTTER);
  return {
    unit,
    height: Math.round(Math.max(Math.min(room, fullHeight * HERO_SPARE), copyRoom, visibleRows * unit + 8)),
    copyLeft,
    copyWidth: Math.round(Math.min(bodyLeft - copyLeft - 6, 420)),
    speechWidth: Math.round(Math.max(150, Math.min(width - bodyLeft - 8, 260))),
  };
}
