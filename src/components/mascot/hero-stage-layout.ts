import { EDGE, MASCOT_CUT } from '../../features/onboarding/welcome/stage-layout';

// The compact mascot hero's geometry, shared by Spin and Focus. Plain numbers,
// so tests can check them.

/** How far Chits leans in past their resting column, so both eyes clear the edge on a narrow phone. */
export const HERO_EDGE_INSET = -45;
/** The widest the page's content gets, on a tablet. */
export const HERO_CONTENT_WIDTH = 620;
const COPY_LEFT = 20;
/** The tape's top row in the artwork, which stays inside the hero. */
const MASCOT_TOP = 130;
const VISIBLE_ROWS = MASCOT_CUT - MASCOT_TOP;
const HERO_MAX = 150;
const HERO_MIN = 120;
const HERO_PAD = 8;

/**
 * Words on the left, Chits cropped by the right edge. The height follows the
 * screen; Chits fills it rather than floating inside it. Only the words can
 * grow the hero, so large text never runs under the paper.
 */
export function heroStageLayout(width: number, screenHeight: number, copyHeight = 0) {
  const tallest = Math.min(HERO_MAX, Math.max(HERO_MIN, screenHeight * 0.19));
  // Chits takes about a third of a phone's width.
  const unit = Math.min(width * 0.000475, (tallest - HERO_PAD) / VISIBLE_ROWS);
  // On a wide screen the words line up with the centered content below them.
  const copyLeft = Math.max(COPY_LEFT, (width - HERO_CONTENT_WIDTH) / 2 + COPY_LEFT);
  // Clear the waving hand as well as the face, including the small lean.
  const characterLeft = width - (EDGE.wave - HERO_EDGE_INSET - 70) * unit;
  return {
    unit,
    height: Math.ceil(Math.max(VISIBLE_ROWS * unit + HERO_PAD, copyHeight + 24)),
    copyLeft,
    copyWidth: Math.floor(Math.min(360, characterLeft - copyLeft - 10)),
    speechWidth: Math.floor(Math.max(120, Math.min(190, width - characterLeft - 8))),
  };
}
