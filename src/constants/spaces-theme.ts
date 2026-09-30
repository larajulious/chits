import { STICKY_COLORS, type SpaceId } from './spaces';

// The look of Spaces: real objects — a fridge door, a desk, a cork board, a
// wall — filling the screen, with dark "ink" controls floating on top. These
// are fixed physical colors, not the app theme's, so a fridge looks like a
// fridge whatever personality or light/dark mode Chits is in.
//
// Presentation only: stored data (a sticky's color id, its position) is
// defined in spaces.ts and never changes because of anything here.

export const SPACE_UI = {
  /** Dark UI: the dock, sheets, Pick a Space and Share. */
  ink: '#17181C',
  /** Tiles and cards on ink. */
  inkRaised: '#24262C',
  inkBorder: '#3A3C43',
  /** Text on ink, and selected states. */
  paper: '#F4F2EC',
  /** Receipt paper and the round buttons over a surface. */
  paperWhite: '#FBFAF6',
  /** Secondary text on ink. */
  textMuted: '#A9A59C',
  /** Primary buttons (white text). */
  accent: '#C23A17',
  accentText: '#FFFFFF',
  magnetRed: '#D8432A',
  dangerBorder: '#E0634A',
  dangerText: '#F2917E',
  /** Unselected icons in the dock. */
  dockIcon: '#C9C6BE',
  switchOff: '#4A4C53',
} as const;

export type PaperColor = { base: string; curl: string };

/**
 * How each stored sticky color is drawn: its paper, and the darker shade it
 * curls to at the bottom. Keyed by the stored id (STICKY_COLORS[].hex), so the
 * palette can be refreshed without touching a single saved note.
 */
const PAPER_BY_ID: Record<string, PaperColor> = {
  [STICKY_COLORS[0].hex]: { base: '#FFE27A', curl: '#F2CB45' },
  [STICKY_COLORS[1].hex]: { base: '#FFB8C2', curl: '#F09AA8' },
  [STICKY_COLORS[2].hex]: { base: '#BFDDFB', curl: '#9CC6F0' },
  [STICKY_COLORS[3].hex]: { base: '#C9EDB8', curl: '#A9D993' },
  [STICKY_COLORS[4].hex]: { base: '#FFCF9E', curl: '#F3B070' },
};
export const paperColor = (storedColor: string): PaperColor => PAPER_BY_ID[storedColor] ?? PAPER_BY_ID[STICKY_COLORS[0].hex];

/** Ink on paper: dark in every mode, because paper is paper. */
export const PAPER_INK = '#2A2622';

export const MAGNET_COLORS = ['#E04B2A', '#2F6FDE', '#F2B517', '#1F9D6B', '#8A4FD8'] as const;
/** A stable per-note number, so a note keeps its magnet/pin/tape color however the stack reorders. */
export const noteSeed = (id: string) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
export const magnetColor = (seed: number) => MAGNET_COLORS[seed % MAGNET_COLORS.length];

/** Short labels for the dock, where space is tight; screen readers hear the full name. */
export const DOCK_LABELS: Record<SpaceId, string> = { fridge: 'Fridge', desk: 'Desk', cork: 'Cork', wall: 'Wall' };
/** Material Community icon per space in the dock. */
export const DOCK_ICONS: Record<SpaceId, 'fridge-outline' | 'desk' | 'pin-outline' | 'image-frame'> = { fridge: 'fridge-outline', desk: 'desk', cork: 'pin-outline', wall: 'image-frame' };
/** Whether controls over this surface need light status-bar icons. */
export const DARK_SURFACE: Record<SpaceId, boolean> = { fridge: false, desk: true, cork: true, wall: false };
