import { PAPERS } from '@/components/desk/paper-desk';
import type { SpinWheelCategory } from '@/services/spin-engine';

// Spin's own papers: one per wheel category, so a category keeps its color on
// the wheel and on the note it lands on.
export const SPIN_CATEGORY_PAPER: Record<SpinWheelCategory, string> = {
  tasks: PAPERS[0], unfinished: PAPERS[1], revisit: PAPERS[2], boards: PAPERS[3],
  quick: PAPERS[4], creative: PAPERS[5], unorganized: PAPERS[6], suggestions: PAPERS[7],
};
/** A custom wheel's papers, in turn. */
export const spinPaper = (index: number) => PAPERS[index % PAPERS.length];
