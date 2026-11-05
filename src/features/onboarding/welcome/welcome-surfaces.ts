import { mix } from '../../../constants/style-tokens';

// The welcome screen's two surfaces, both from the desk kit Spin and Focus use:
// the dotted desk Chits lives on, and a sheet of paper lying over it. Pure, so
// tests can check every pairing.

type DeskTokens = { desk: string; ink: string; inkMuted: string };
type PaperTokens = { white: string; ink: string; yellow: string };

export type WelcomeSurfaces = {
  paper: string;
  /** Quiet controls on the paper, which sit a step toward the desk. */
  control: string;
  /** A card to act on, and a finished one, softer and flat. */
  card: string;
  cardDone: string;
  /** An empty stretch of the progress track. */
  track: string;
  ink: string;
  inkMuted: string;
  action: string;
  onAction: string;
};

export function welcomeSurfaces(scheme: 'light' | 'dark', desk: DeskTokens, paper: PaperTokens): WelcomeSurfaces {
  // The yellow accent nearly vanishes on light paper (1.25:1), so the main
  // action takes Chits' own ink there, and the yellow where it can stand out.
  if (scheme === 'light') {
    const control = mix(paper.white, desk.desk, 0.6);
    return { paper: paper.white, control, card: paper.white, cardDone: control, track: mix(control, desk.ink, 0.14), ink: desk.ink, inkMuted: desk.inkMuted, action: paper.ink, onAction: paper.white };
  }
  // Dark paper is the desk lifted toward its own ink, so it stays the same warm family.
  const darkPaper = mix(desk.desk, desk.ink, 0.09);
  const control = mix(darkPaper, desk.ink, 0.1);
  return { paper: darkPaper, control, card: control, cardDone: mix(darkPaper, desk.desk, 0.45), track: mix(control, desk.ink, 0.14), ink: desk.ink, inkMuted: desk.inkMuted, action: paper.yellow, onAction: paper.ink };
}
