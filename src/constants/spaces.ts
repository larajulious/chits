// Spaces: a fridge door, a desk, a cork board or a wall that notes can be
// stuck to as sticky notes and dragged around freely. Every space is defined
// here and nowhere else — adding one is a new entry in SPACES.
//
// This file is pure data (no React Native) so tests can check placement.

export const SPACE_IDS = ['fridge', 'desk', 'cork', 'wall'] as const;
export type SpaceId = typeof SPACE_IDS[number];
export const DEFAULT_SPACE_ID: SpaceId = 'fridge';

/** How a sticky is held on: a round magnet, a strip of tape, a pushpin or patterned washi tape. */
export type SpacePinStyle = 'magnet' | 'tape' | 'pushpin' | 'washi';

export type SpaceDefinition = {
  id: SpaceId;
  name: string;
  description: string;
  pinStyle: SpacePinStyle;
  /**
   * The board's color, in light and dark. Until real art exists (space_fridge,
   * space_desk… at @2x/@3x in assets/images/spaces) this is the whole
   * background; afterwards it shows while the image loads.
   */
  background: { light: string; dark: string };
};

export const SPACES: Record<SpaceId, SpaceDefinition> = {
  fridge: { id: 'fridge', name: 'Fridge', description: 'Daily reminders & lists', pinStyle: 'magnet', background: { light: '#E8ECEF', dark: '#2B3034' } },
  desk: { id: 'desk', name: 'Desk', description: 'Work and study notes', pinStyle: 'tape', background: { light: '#D9BF9A', dark: '#4A3A2A' } },
  cork: { id: 'cork', name: 'Cork board', description: 'Ideas and plans', pinStyle: 'pushpin', background: { light: '#B98552', dark: '#5B4029' } },
  wall: { id: 'wall', name: 'Wall', description: 'Inspiration to revisit', pinStyle: 'washi', background: { light: '#EDE6DC', dark: '#2F2B27' } },
};
export const SPACE_LIST: SpaceDefinition[] = SPACE_IDS.map((id) => SPACES[id]);

/** The one stored setting: the space Spaces opens on; absent until the user picks one. */
export const SELECTED_SPACE_SETTING_KEY = 'selected_space_id';

/** Anything unknown (a removed space, a newer backup) reads as "not picked yet". */
export function resolveSpaceId(value: string | null | undefined): SpaceId | null {
  return SPACE_IDS.find((id) => id === value) ?? null;
}

// ── Stickies ─────────────────────────────────────────────────────────────────

export const SPACE_CAPACITY = 12;
/** A sticky's size on the board, in points. */
export const STICKY_SIZE = { width: 132, height: 124 } as const;
export const STICKY_COLORS = [
  { name: 'Yellow', hex: '#FFE58A' },
  { name: 'Pink', hex: '#FFC7CC' },
  { name: 'Blue', hex: '#C4E4FF' },
  { name: 'Green', hex: '#D2F0C4' },
  { name: 'Orange', hex: '#FFD6AE' },
] as const;
export const DEFAULT_STICKY_COLOR = STICKY_COLORS[0].hex;
/** Ink on every sticky: they're paper, so it stays dark in dark mode too. */
export const STICKY_INK = '#1C1B19';

// ── Placement ────────────────────────────────────────────────────────────────
//
// A sticky's x/y are its top-left corner as a fraction (0–1) of the room it
// can move in — the board, less a small margin, minus the sticky — so any
// stored value keeps the whole sticky (and the pin above it) on the board,
// whatever the screen size, tablet or rotation.

export type SpacePoint = { x: number; y: number };
type Board = { width: number; height: number };

/** Room around the edge: a little at the sides for the tilt, more on top for the pin. */
export const STICKY_INSET = { top: 16, side: 8, bottom: 10 } as const;

export const clampUnit = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** Where a sticky's top-left corner may go on this board, in points. */
export function stickyBounds(board: Board) {
  const minX = STICKY_INSET.side;
  const minY = STICKY_INSET.top;
  return { minX, minY, maxX: Math.max(minX, board.width - STICKY_INSET.side - STICKY_SIZE.width), maxY: Math.max(minY, board.height - STICKY_INSET.bottom - STICKY_SIZE.height) };
}

/** Board points → stored fraction, clamped inside the board. */
export function toUnit(point: SpacePoint, board: Board): SpacePoint {
  const { minX, minY, maxX, maxY } = stickyBounds(board);
  return { x: clampUnit((point.x - minX) / Math.max(1, maxX - minX)), y: clampUnit((point.y - minY) / Math.max(1, maxY - minY)) };
}

/** Stored fraction → board points. */
export function fromUnit(point: SpacePoint, board: Board): SpacePoint {
  const { minX, minY, maxX, maxY } = stickyBounds(board);
  return { x: minX + clampUnit(point.x) * (maxX - minX), y: minY + clampUnit(point.y) * (maxY - minY) };
}

/** A slight tilt, set once when a note is stuck on: -4° to +4°, to one decimal. */
export function randomRotation(random: () => number = Math.random): number {
  return Math.round((random() * 2 - 1) * 40) / 10;
}

// A loose two-column grid, one slot per sticky a space can hold.
const SLOTS: SpacePoint[] = Array.from({ length: SPACE_CAPACITY }, (_, index) => ({ x: index % 2 === 0 ? 0.1 : 0.9, y: Math.floor(index / 2) / (SPACE_CAPACITY / 2 - 1) }));
const JITTER = 0.04;

/**
 * Where a newly stuck note goes: the first grid slot nothing sits near, nudged
 * a little so the board looks hand-placed rather than aligned. If every slot is
 * taken (stickies were dragged around) it lands anywhere on the board.
 */
export function autoPlace(existing: SpacePoint[], random: () => number = Math.random): SpacePoint {
  const open = SLOTS.find((slot) => !existing.some((point) => Math.abs(point.x - slot.x) < 0.25 && Math.abs(point.y - slot.y) < 0.1));
  const base = open ?? { x: random(), y: random() };
  const nudge = () => (random() * 2 - 1) * JITTER;
  return { x: clampUnit(base.x + nudge()), y: clampUnit(base.y + nudge()) };
}
