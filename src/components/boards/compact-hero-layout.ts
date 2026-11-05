import { EDGE, MASCOT_CUT } from '../../features/onboarding/welcome/stage-layout';

export const COMPACT_EDGE_INSET = -35;

/** How far the hero holds still: only until the paper has fully covered it. */
export function heroScroll(offset: number, height: number) {
  'worklet';
  return Math.min(Math.max(offset, 0), height);
}

/** Keep the character large; crop it instead of scaling it to the hero's height. */
export function compactHeroLayout(width: number, copyHeight = 0) {
  const unit = Math.max(0.18, Math.min(0.215, width * 0.00052));
  // Clear the waving hand as well as the face, including the rig's small lean.
  const copyLeft = 20;
  const characterLeft = width - (EDGE.wave - COMPACT_EDGE_INSET - 26) * unit;
  return {
    unit,
    // Frame the tape through the resting hand. Only the body's far edge is cropped.
    // Eight extra points clear the tape during the compact shoulder-pivot nod.
    height: Math.ceil(Math.max((MASCOT_CUT - 130) * unit + 32, copyHeight + 24)),
    copyLeft,
    copyWidth: Math.floor(Math.min(360, characterLeft - copyLeft - 8)),
  };
}
