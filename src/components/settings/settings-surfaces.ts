import { mix } from '../../constants/style-tokens';

// Settings sits on the desk, on the theme's own paper, so controls keep the
// theme's ink. Dark mode needs the lift: a theme's paper is almost the desk's
// own color there, and sections would melt into it. Pure, so tests can check it.

type Tokens = { cardPaper: string; textPrimary: string };

export function settingsSurfaces(scheme: 'light' | 'dark', tokens: Tokens, deskInk: string) {
  const surface = scheme === 'dark' ? mix(tokens.cardPaper, deskInk, 0.08) : tokens.cardPaper;
  return {
    surface,
    /** Hairlines: the section's edge, and between its rows. */
    border: mix(surface, tokens.textPrimary, 0.13),
    /** A row under the finger. */
    pressed: mix(surface, tokens.textPrimary, 0.07),
    /** A switch that's off: plainly a different state from one that's on. */
    switchOff: mix(surface, tokens.textPrimary, scheme === 'dark' ? 0.3 : 0.42),
    /** Its thumb, always lighter than its track, so it shows on dark paper too. */
    thumbOff: scheme === 'dark' ? mix(surface, tokens.textPrimary, 0.8) : surface,
  };
}
