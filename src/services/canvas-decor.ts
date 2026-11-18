// Scrapbook pieces on the Notes board: stickers, tape, doodles and labels.
// Board presentation only, like note positions: each filter keeps its own
// pieces in app_settings (covered by backup), and nothing here touches a note.

import type { CanvasRect } from './note-canvas';

/** One piece, centered on (x, y) in board points. */
export type DecorPiece = {
  id: string;
  key: string;
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rot: number;
  /** Tucked under the notes rather than lying on them. */
  behind: boolean;
  z: number;
  text?: string;
  ink?: string;
};

/** What a touch needs to find a piece, kept on the UI thread. */
export type DecorHitBox = { id: string; x: number; y: number; halfW: number; halfH: number; rot: number };

export const DECOR_SETTING_PREFIX = 'notes_canvas_decor.';
/** Enough to decorate generously, few enough that a board stays light. */
export const MAX_DECOR = 120;
export const DECOR_MIN_SCALE = 0.35;
export const DECOR_MAX_SCALE = 3;
export const DECOR_TEXT_MAX = 16;

export const decorSettingKey = (filterKey: string) => `${DECOR_SETTING_PREFIX}${filterKey}`;

export function newDecorId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Saved pieces, keeping only ones this version can draw; anything malformed is dropped, never thrown. */
export function parseDecor(value: string | null | undefined, canDraw: (key: string) => boolean): DecorPiece[] {
  if (!value) return [];
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const pieces: DecorPiece[] = [];
  for (const item of raw.slice(0, MAX_DECOR)) {
    if (!item || typeof item !== 'object') continue;
    const piece = item as Record<string, unknown>;
    if (typeof piece.id !== 'string' || typeof piece.key !== 'string' || !canDraw(piece.key)) continue;
    if (!finite(piece.x) || !finite(piece.y) || !finite(piece.scale) || !finite(piece.rot) || !finite(piece.z)) continue;
    pieces.push({
      id: piece.id, key: piece.key, x: piece.x, y: piece.y,
      scale: clampDecorScale(piece.scale), rot: piece.rot % 360, behind: piece.behind === true, z: piece.z,
      ...(typeof piece.text === 'string' ? { text: piece.text.slice(0, DECOR_TEXT_MAX) } : {}),
      ...(typeof piece.ink === 'string' && /^#[0-9a-f]{6}$/i.test(piece.ink) ? { ink: piece.ink } : {}),
    });
  }
  return pieces;
}

export function clampDecorScale(scale: number) {
  'worklet';
  return Math.min(DECOR_MAX_SCALE, Math.max(DECOR_MIN_SCALE, scale));
}

/** Everything the pieces cover, so panning can always reach them. A rotated piece is boxed by its longer side. */
export function decorBounds(pieces: readonly DecorPiece[], sizeOf: (key: string) => { w: number; h: number } | undefined): CanvasRect | null {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const piece of pieces) {
    const size = sizeOf(piece.key);
    if (!size) continue;
    const reach = (Math.max(size.w, size.h) * piece.scale) / 2;
    left = Math.min(left, piece.x - reach); top = Math.min(top, piece.y - reach);
    right = Math.max(right, piece.x + reach); bottom = Math.max(bottom, piece.y + reach);
  }
  return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

/** The topmost piece under a board point, with `slop` board points of grace around each piece. Boxes are topmost first. */
export function hitDecor(boxes: readonly DecorHitBox[], x: number, y: number, slop: number) {
  'worklet';
  for (const box of boxes) {
    const angle = (-box.rot * Math.PI) / 180;
    const dx = x - box.x;
    const dy = y - box.y;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(localX) <= box.halfW + slop && Math.abs(localY) <= box.halfH + slop) return box.id;
  }
  return null;
}
