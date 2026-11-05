import { HERO_CONTENT_WIDTH } from '../mascot/hero-stage-layout';

// The sizes on Pick a Space, known before the first frame. Plain numbers, so
// tests can check them.

export const PICK_GAP = 10;
/** The print's white border around its picture. */
export const PICK_PAD = 7;
const PAGE_EDGE = 16;
/** The name and up to two lines of description under the picture. */
const CAPTION = 62;
/** The sheet's padding, the footer's action, and what the header takes past its minimum. */
const RESERVED = 142;
const TILE_MIN = 150;
const TILE_MAX = 252;
const STICKY_MIN = 0.32;
const STICKY_MAX = 0.46;

/** Four prints, two by two, sharing the height the page has left. A short screen scrolls rather than squeezes them. */
export function pickGridLayout(width: number, viewport: number, heroHeight: number) {
  const tileWidth = Math.floor((Math.min(width, HERO_CONTENT_WIDTH) - PAGE_EDGE * 2 - PICK_GAP) / 2);
  const room = Math.floor((viewport - heroHeight - RESERVED - PICK_GAP) / 2);
  const tileHeight = Math.min(TILE_MAX, Math.max(TILE_MIN, room));
  const previewWidth = tileWidth - PICK_PAD * 2;
  const previewHeight = tileHeight - PICK_PAD * 2 - CAPTION;
  // The two sample notes overlap, so together they're about 1.7 notes wide and 1.2 tall.
  const stickyUnit = Math.min(STICKY_MAX, Math.max(STICKY_MIN, Math.min((previewWidth - 12) / 224, (previewHeight - 12) / 150)));
  return { tileHeight, previewWidth, previewHeight, stickyUnit };
}
