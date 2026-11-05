// The Notes board's geometry: how big a note is, where it goes, which notes are
// in view, and how the camera moves. Pure functions (no React Native) so tests
// can drive them directly; the ones marked 'worklet' also run on the UI thread.
//
// A camera is { x, y, zoom }: x and y are where the world's origin sits on
// screen, so a world point lands at world * zoom + camera.

export type CanvasRect = { x: number; y: number; width: number; height: number };
export type CanvasCamera = { x: number; y: number; zoom: number };
export type CanvasPosition = { x: number; y: number; z: number };
export type CanvasSize = { width: number; height: number };

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
/** Fit All may go below MIN_ZOOM, or a big board could never be seen whole. */
export const MIN_FIT_ZOOM = 0.1;
/** Below this, words are too small to read and notes draw as plain paper. */
export const LITE_ZOOM = 0.42;
/** The world is a real view rather than an unbounded one: Android only delivers touches inside a view's bounds. */
export const CANVAS_HALF = 40000;
export const CANVAS_CELL = 320;
/** How much of the viewport to keep mounted past each edge. */
const OVERSCAN = 0.35;
const EDGE_PADDING = 20;
const READABLE_FIT_ZOOM = 0.62;
/** How far across the screen the board's edge can be pulled. */
const PAN_REACH = 0.55;

export const CANVAS_MAX_FONT_SCALE = 1.3;
export const CANVAS_MAX_TILT = 1.5;
const COLUMN_WIDTH = 228;
const COLUMN_GAP = 30;
const ROW_GAP = 28;
const CARD_PADDING = 12;
const FOOTER_HEIGHT = 34;
const MIN_CARD_HEIGHT = 104;

/** A stable number in [0, 1) from a note's key: the same note always falls the same way. */
export function stableUnit(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) { hash ^= key.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}

export const canvasTilt = (key: string) => Math.round((stableUnit(`${key}:tilt`) * 2 - 1) * CANVAS_MAX_TILT * 10) / 10;

// ── Note sizes ──────────────────────────────────────────────────────────────
// Sizes come from the content, not from measuring, so culling, Fit All and the
// mini-map know every note's frame without mounting it. Text that runs long
// clips to the same line counts the card draws with.

export type CanvasCardInput = {
  title: string | null; body: string | null; hidden: boolean;
  /** Tickable rows shown, and whether a "+N more" line follows them. */
  rows: number; moreRows: boolean; progress: boolean;
  /** Width over height of the preview picture, or null for no picture. */
  picture: number | null;
  audio: boolean; file: boolean; reminder: boolean;
};
export type CanvasCardFrame = CanvasSize & { pictureHeight: number; titleLines: number; bodyLines: number };

function linesOf(text: string, width: number, charWidth: number) {
  return text.split('\n').reduce((lines, paragraph) => lines + Math.max(1, Math.ceil(paragraph.length * charWidth / width)), 0);
}

export function canvasCardFrame(input: CanvasCardInput, fontScale = 1): CanvasCardFrame {
  const scale = Math.max(1, Math.min(fontScale, CANVAS_MAX_FONT_SCALE));
  const length = (input.title?.length ?? 0) + (input.body?.length ?? 0);
  const width = input.hidden ? 168 : input.picture !== null ? 216 : input.rows ? 204 : input.file ? 176 : length < 48 ? 168 : length < 160 ? 196 : COLUMN_WIDTH;
  const inner = width - CARD_PADDING * 2;
  const titleLines = input.title ? Math.min(2, linesOf(input.title, inner, 8.4 * scale)) : 0;
  const bodyMax = input.rows || input.picture !== null ? 3 : input.title ? 5 : 7;
  const bodyLines = input.body ? Math.min(bodyMax, linesOf(input.body, inner, 7.2 * scale)) : 0;
  const pictureHeight = input.picture === null ? 0 : Math.round(Math.max(92, Math.min(196, (width - 16) / input.picture)));
  let height = FOOTER_HEIGHT;
  if (pictureHeight) height += pictureHeight + 8;
  if (input.hidden) height += 62 * scale;
  if (input.file) height += 76 * scale;
  height += titleLines * 21 * scale + bodyLines * 20 * scale;
  if (input.progress) height += 26 * scale;
  height += input.rows * 25 * scale + (input.moreRows ? 18 * scale : 0);
  if (input.audio) height += 46;
  if (input.reminder) height += 30 * scale;
  if (titleLines || bodyLines || input.rows || input.audio || input.reminder || input.hidden || input.file) height += CARD_PADDING + 4;
  return { width, height: Math.max(MIN_CARD_HEIGHT, Math.ceil(height / 4) * 4), pictureHeight, titleLines, bodyLines };
}

// ── Placing notes ───────────────────────────────────────────────────────────

/**
 * The first arrangement of an existing board: notes go in their sort order to
 * whichever column is shortest, so the top of the list stays at the top left.
 * Columns start staggered and each note wanders inside its own lane, which reads
 * as placed by hand; a lane is wider than any note, so nothing overlaps.
 */
export function placeBoard(notes: readonly (CanvasSize & { key: string })[]) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(notes.length * 1.2)));
  const bottoms = Array.from({ length: columns }, (_, column) => column === 0 ? 0 : Math.round(stableUnit(`column:${column}`) * 72));
  const placed = new Map<string, CanvasPosition>();
  for (const note of notes) {
    let column = 0;
    for (let index = 1; index < columns; index += 1) if (bottoms[index] < bottoms[column]) column = index;
    const slack = Math.max(0, COLUMN_WIDTH - note.width);
    const x = column * (COLUMN_WIDTH + COLUMN_GAP) + Math.round(stableUnit(`${note.key}:x`) * slack);
    const y = bottoms[column];
    placed.set(note.key, { x, y, z: 0 });
    bottoms[column] = y + note.height + ROW_GAP + Math.round(stableUnit(`${note.key}:y`) * 14);
  }
  return placed;
}

const intersects = (a: CanvasRect, b: CanvasRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where a new note goes: the free spot closest to `center`, walking outward in
 * rings. A spot wholly inside `visible` wins, so a note just written is seen; if
 * the view is full, the nearest free spot past it will do.
 */
export function placeNear(size: CanvasSize, center: { x: number; y: number }, index: CanvasIndex<CanvasRect>, visible?: CanvasRect): { x: number; y: number } {
  const step = 44;
  const gap = 16;
  const start = { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) };
  const free = (x: number, y: number) => {
    const padded = { x: x - gap, y: y - gap, width: size.width + gap * 2, height: size.height + gap * 2 };
    return !queryCanvasIndex(index, padded).some((rect) => intersects(rect, padded));
  };
  const inView = (x: number, y: number) => !visible || (x >= visible.x && y >= visible.y && x + size.width <= visible.x + visible.width && y + size.height <= visible.y + visible.height);
  if (free(start.x, start.y) && inView(start.x, start.y)) return start;
  const reach = visible ? Math.max(visible.width, visible.height) / step : 0;
  let nearest: { x: number; y: number } | null = null;
  for (let ring = 1; ring < 200; ring += 1) {
    for (let side = -ring; side <= ring; side += 1) {
      for (const [dx, dy] of [[side, -ring], [side, ring], [-ring, side], [ring, side]]) {
        const x = start.x + dx * step;
        const y = start.y + dy * step;
        if (!free(x, y)) continue;
        if (inView(x, y)) return { x, y };
        nearest ??= { x, y };
      }
    }
    if (nearest && ring > reach) return nearest;
  }
  return nearest ?? start;
}

export function clampToWorld(x: number, y: number, size: CanvasSize) {
  return { x: Math.max(-CANVAS_HALF, Math.min(CANVAS_HALF - size.width, x)), y: Math.max(-CANVAS_HALF, Math.min(CANVAS_HALF - size.height, y)) };
}

// ── Finding notes ───────────────────────────────────────────────────────────

/** Notes bucketed by grid cell, so looking something up never walks the whole board. */
export type CanvasIndex<T extends CanvasRect> = Map<string, T[]>;

export function createCanvasIndex<T extends CanvasRect>(items: readonly T[]): CanvasIndex<T> {
  const index: CanvasIndex<T> = new Map();
  for (const item of items) addToCanvasIndex(index, item);
  return index;
}

export function addToCanvasIndex<T extends CanvasRect>(index: CanvasIndex<T>, item: T) {
  for (let column = Math.floor(item.x / CANVAS_CELL); column <= Math.floor((item.x + item.width) / CANVAS_CELL); column += 1) {
    for (let row = Math.floor(item.y / CANVAS_CELL); row <= Math.floor((item.y + item.height) / CANVAS_CELL); row += 1) {
      const key = `${column}:${row}`;
      const cell = index.get(key);
      if (cell) cell.push(item); else index.set(key, [item]);
    }
  }
}

export function queryCanvasIndex<T extends CanvasRect>(index: CanvasIndex<T>, rect: CanvasRect) {
  const found = new Set<T>();
  for (let column = Math.floor(rect.x / CANVAS_CELL); column <= Math.floor((rect.x + rect.width) / CANVAS_CELL); column += 1) {
    for (let row = Math.floor(rect.y / CANVAS_CELL); row <= Math.floor((rect.y + rect.height) / CANVAS_CELL); row += 1) {
      for (const item of index.get(`${column}:${row}`) ?? []) if (intersects(item, rect)) found.add(item);
    }
  }
  return [...found];
}

/** The note on top at a world point, if any. */
export function noteAtPoint<T extends CanvasRect & { z: number }>(index: CanvasIndex<T>, x: number, y: number) {
  let top: T | null = null;
  for (const item of index.get(`${Math.floor(x / CANVAS_CELL)}:${Math.floor(y / CANVAS_CELL)}`) ?? []) {
    if (x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height && (!top || item.z >= top.z)) top = item;
  }
  return top;
}

export function boundsOf(rects: readonly CanvasRect[]): CanvasRect | null {
  if (!rects.length) return null;
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x); top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width); bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The grid cells worth mounting, as a string that only changes when the camera
 * crosses a cell edge. That change is the only thing the UI thread tells JS while
 * panning, so React does nothing on most frames.
 */
export function canvasRangeKey(x: number, y: number, zoom: number, width: number, height: number) {
  'worklet';
  const left = -x / zoom;
  const top = -y / zoom;
  const viewWidth = width / zoom;
  const viewHeight = height / zoom;
  const firstColumn = Math.floor((left - viewWidth * OVERSCAN) / CANVAS_CELL);
  const firstRow = Math.floor((top - viewHeight * OVERSCAN) / CANVAS_CELL);
  const lastColumn = Math.floor((left + viewWidth * (1 + OVERSCAN)) / CANVAS_CELL);
  const lastRow = Math.floor((top + viewHeight * (1 + OVERSCAN)) / CANVAS_CELL);
  return `${firstColumn},${firstRow},${lastColumn},${lastRow},${zoom < LITE_ZOOM ? 1 : 0}`;
}

export function parseCanvasRange(key: string): { rect: CanvasRect; lite: boolean } {
  const [firstColumn, firstRow, lastColumn, lastRow, lite] = key.split(',').map(Number);
  return {
    rect: { x: firstColumn * CANVAS_CELL, y: firstRow * CANVAS_CELL, width: (lastColumn - firstColumn + 1) * CANVAS_CELL, height: (lastRow - firstRow + 1) * CANVAS_CELL },
    lite: lite === 1,
  };
}

// ── Moving the camera ───────────────────────────────────────────────────────

export function clampZoom(zoom: number, min: number = MIN_ZOOM) {
  'worklet';
  return Math.max(min, Math.min(MAX_ZOOM, zoom));
}

/** The camera at a new zoom with one screen point held still under the fingers. */
export function zoomAround(camera: CanvasCamera, zoom: number, screenX: number, screenY: number): CanvasCamera {
  'worklet';
  const ratio = zoom / camera.zoom;
  return { x: screenX - (screenX - camera.x) * ratio, y: screenY - (screenY - camera.y) * ratio, zoom };
}

/** The furthest the camera can go along one axis before the view leaves the world. */
export function cameraLimits(zoom: number, viewSize: number): [number, number] {
  'worklet';
  return [viewSize - CANVAS_HALF * zoom, CANVAS_HALF * zoom];
}

/**
 * How far a pan or glide may go along one axis: until the far edge of the notes
 * reaches the middle of the screen, so a fling can't lose the board. `start` and
 * `end` are the notes' extent in world points. A camera already outside (a note
 * was just removed, say) keeps its place rather than snapping back.
 */
export function panLimits(zoom: number, viewSize: number, start: number, end: number, current: number): [number, number] {
  'worklet';
  const [worldMin, worldMax] = cameraLimits(zoom, viewSize);
  const min = Math.max(worldMin, viewSize * (1 - PAN_REACH) - end * zoom);
  const max = Math.min(worldMax, viewSize * PAN_REACH - start * zoom);
  return [Math.min(min, current), Math.max(max, current)];
}

export function clampCamera(camera: CanvasCamera, view: CanvasSize): CanvasCamera {
  'worklet';
  const [minX, maxX] = cameraLimits(camera.zoom, view.width);
  const [minY, maxY] = cameraLimits(camera.zoom, view.height);
  return { x: Math.max(minX, Math.min(maxX, camera.x)), y: Math.max(minY, Math.min(maxY, camera.y)), zoom: camera.zoom };
}

/** What a double tap goes to next: in by steps, then back to actual size. */
export function nextTapZoom(zoom: number) {
  if (zoom < 0.95) return 1;
  if (zoom < 1.45) return 1.5;
  return zoom < MAX_ZOOM - 0.05 ? MAX_ZOOM : 1;
}

/** Start of the board at actual size: the newest notes, at a size that reads. */
export function homeCamera(bounds: CanvasRect | null, view: CanvasSize): CanvasCamera {
  if (!bounds) return { x: view.width / 2, y: view.height / 2, zoom: 1 };
  return { x: EDGE_PADDING - bounds.x, y: EDGE_PADDING - bounds.y, zoom: 1 };
}

/** The first look at a board: all of it when that still reads, or else its start. */
export function openingCamera(bounds: CanvasRect | null, view: CanvasSize): CanvasCamera {
  const fit = fitCamera(bounds, view);
  return fit.zoom >= READABLE_FIT_ZOOM ? fit : homeCamera(bounds, view);
}

/** Frames every note, never enlarging past actual size. */
export function fitCamera(bounds: CanvasRect | null, view: CanvasSize): CanvasCamera {
  if (!bounds) return homeCamera(null, view);
  const zoom = Math.max(MIN_FIT_ZOOM, Math.min(1, (view.width - EDGE_PADDING * 2) / bounds.width, (view.height - EDGE_PADDING * 2) / bounds.height));
  return { x: view.width / 2 - (bounds.x + bounds.width / 2) * zoom, y: view.height / 2 - (bounds.y + bounds.height / 2) * zoom, zoom };
}

/** The lowest zoom a pinch can reach: MIN_ZOOM, or lower when that's what Fit All needed. */
export function floorZoom(bounds: CanvasRect | null, view: CanvasSize) {
  return Math.min(MIN_ZOOM, fitCamera(bounds, view).zoom);
}

/** First look at a filter: keep the zoom where possible and bring its notes into view. */
export function frameCamera(bounds: CanvasRect | null, view: CanvasSize, zoom: number): CanvasCamera {
  if (!bounds) return { ...homeCamera(null, view), zoom };
  const fit = fitCamera(bounds, view).zoom;
  const next = Math.min(zoom, Math.max(fit, MIN_ZOOM));
  const fits = bounds.width * next <= view.width - EDGE_PADDING * 2 && bounds.height * next <= view.height - EDGE_PADDING * 2;
  if (fits) return { x: view.width / 2 - (bounds.x + bounds.width / 2) * next, y: view.height / 2 - (bounds.y + bounds.height / 2) * next, zoom: next };
  return { x: EDGE_PADDING - bounds.x * next, y: EDGE_PADDING - bounds.y * next, zoom: next };
}

/** Centers one note, at a size that reads and small enough to see all of it. */
export function focusCamera(rect: CanvasRect, view: CanvasSize, zoom: number): CanvasCamera {
  const next = clampZoom(Math.min(Math.max(zoom, 1), (view.width - EDGE_PADDING * 2) / rect.width, (view.height - EDGE_PADDING * 2) / rect.height));
  return { x: view.width / 2 - (rect.x + rect.width / 2) * next, y: view.height / 2 - (rect.y + rect.height / 2) * next, zoom: next };
}

// ── Saved view ──────────────────────────────────────────────────────────────

export const NOTE_CANVAS_PREFS_KEY = 'notes_canvas_view';
export type CanvasPrefs = { miniMap: boolean; hintDone: boolean; views: Record<string, CanvasCamera>; connections?: 'selected' | 'all' | 'hidden' };

export function parseCanvasPrefs(value: string | null | undefined): CanvasPrefs {
  const prefs: CanvasPrefs = { miniMap: true, hintDone: false, views: {} };
  if (!value) return prefs;
  try {
    const parsed = JSON.parse(value) as Partial<CanvasPrefs> | null;
    if (!parsed || typeof parsed !== 'object') return prefs;
    prefs.miniMap = parsed.miniMap !== false;
    prefs.hintDone = parsed.hintDone === true;
    if (parsed.connections === 'all' || parsed.connections === 'hidden' || parsed.connections === 'selected') prefs.connections = parsed.connections;
    for (const [key, view] of Object.entries(parsed.views ?? {})) {
      if (Number.isFinite(view?.x) && Number.isFinite(view?.y) && Number.isFinite(view?.zoom) && view.zoom > 0) prefs.views[key] = { x: view.x, y: view.y, zoom: Math.min(MAX_ZOOM, view.zoom) };
    }
  } catch { /* A damaged preference reads as no preference. */ }
  return prefs;
}
